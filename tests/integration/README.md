# Integration / e2e tests (Node.js)

Non-mock tests that hit **real Huawei Cloud APIs** (no HTTP mocking), ported 1:1
from `agentarts-sdk-python/tests/integration/`. They verify the SDK wrapper
layers end-to-end: `IdentityClient`, `RuntimeClient`, `MemoryClient` /
`AsyncMemoryClient`, `GatewayClient`, `CodeInterpreter`, `AgentArtsRuntimeApp`,
the `require*` auth factories, and the `agentarts` CLI.

A second, local-only tier (runtime app + upload content-type + V11 signature +
CLI local) needs neither credentials nor network.

## Three-tier safety model

The core tension: verifying write operations (create/update/delete) requires
creating real resources, which conflicts with "no residue / no overspend". The
suite resolves this with three tiers, each gated by environment variables.

| Tier | Switch | What runs | Cloud writes? | Cost |
|------|--------|-----------|---------------|------|
| **Default (read-only)** | — | `list`/`get` + ephemeral token issuance + local `AgentArtsRuntimeApp` / local HTTP servers / local CLI | none | none |
| **Lifecycle** | `AGENTARTS_TEST_ALLOW_CREATE=1` | `create → get → update → delete` for every resource type | yes, teardown-guaranteed | low |
| **Billable** | `AGENTARTS_TEST_RUN_BILLABLE=1` | code-interpreter sandbox session, runtime `invoke`/`exec` | ephemeral sessions (paired start/stop) | real money |

Tests skip automatically when their gate is not satisfied, so
`pnpm test:integration` is always safe to run. Gating is done at collection time:

```ts
const describeIntegration = hasCloudCredentials() ? describe : describe.skip;
// cloud writes:
const describeLifecycle =
  hasCloudCredentials() && envTruthy(ENV_ALLOW_CREATE) ? describe : describe.skip;
// billable:
const describeSession =
  hasCloudCredentials() && runBillable() ? describe : describe.skip;
```

## Running

```bash
# Default tier — local tests run; cloud read-only tests skip without AK/SK.
pnpm test:integration

# Read-only tier — real list/get calls, no writes.
# Put the credentials in tests/integration/.env (auto-loaded) or export them.
export HUAWEICLOUD_SDK_AK=...
export HUAWEICLOUD_SDK_SK=...
export HUAWEICLOUD_SDK_REGION=cn-southwest-2
pnpm test:integration

# Full lifecycle (create→delete).
export AGENTARTS_TEST_ALLOW_CREATE=1
pnpm test:integration

# Billable sandbox/runtime sessions.
export AGENTARTS_TEST_RUN_BILLABLE=1
pnpm test:integration
```

`tests/integration/.env` (gitignored) is parsed by
`tests/integration/_helpers.ts#loadDotEnv` — no `dotenv` dependency, existing
environment variables always win. See `.env.example` for the full variable set.
The default tier needs only `HUAWEICLOUD_SDK_AK` / `HUAWEICLOUD_SDK_SK` /
`HUAWEICLOUD_SDK_REGION`.

The integration runner uses `vitest.integration.config.ts`
(`tests/integration/**/*.test.ts`, 120 s timeout). There is no per-file
credential fixture: every file computes its gate at import time.

## Resource hygiene

- Every created resource is registered with a file-scoped `resourceRegistry`;
  at the end of the file it calls each deleter **in reverse order**, swallowing
  errors so a failing cleanup never masks a real failure. Python scopes this to
  the whole pytest session; vitest isolates module state per test file, so each
  file owns one registry and drains it in `afterAll`.
- All resource names are prefixed `aa-it-<run_id>-…`, so any leaked resource is
  greppable for manual cleanup. The run id is shared process-wide
  (`globalThis`), so every file uses the same prefix.
- The Memory suite is self-contained: `createSpace` mints the space's own
  data-plane API key, so no pre-existing `HUAWEICLOUD_SDK_MEMORY_API_KEY` is
  needed; `deleteSpace` cascades to all sessions/messages/memories.
- Billable sessions use the `codeSession` helper (auto `stopSession` on exit)
  and register `stopSession` with the registry as a safety net.
- The auth factories' local-auth bootstrap persists `.agent_identity.json`;
  the test chdirs into a temp dir so the repository is never polluted, and a
  pre-seeded `Config` makes the bootstrap reuse the run's workload identity
  (no extra create).

### Cleaning up leaked resources

If a run is interrupted before teardown, find leftovers by the run prefix:

```text
# Identity
# (list via the SDK) identityClient.listWorkloadIdentities() / list*CredentialProviders()
#   filter for names starting with "aa-it-"

# Memory spaces
# memoryControlClient.listSpaces() -> delete spaces whose name starts with "aa-it-"

# MCP gateways
# gatewayClient.listGateways() -> delete gateways whose name starts with "aa-it-"

# Runtime agents
# runtimeClient.getAgents() -> delete agents whose name starts with "aa-it-"

# Code interpreters
# codeInterpreter.listCodeInterpreters() -> delete those whose name starts with "aa-it-"
```

> **Note:** `GatewayClient.createGateway` auto-creates a shared IAM agency
> `AgentArtsCoreGateway` (409-ignored if it already exists) which the SDK
> intentionally does **not** delete. This single shared agency is expected
> residue.

## What is deliberately NOT covered

- OAuth2 3-legged `requireAccessToken` — interactive browser round trip;
  covered by unit tests for wiring, e2e is a manual exercise (kept as an
  explicit `it.skip` in `test_auth_decorators.test.ts`).
- `IAMClient.createAgency` — only a create wrapper, no read/delete in the SDK;
  exercised implicitly only via the gateway's shared-agency path.
- The `deployed_runtime_agent` fixture (Docker build + SWR push + cloud runtime
  create) — see "Porting notes".

## Test inventory

Every file mirrors its Python counterpart (`test_x.py` → `test_x.test.ts`).

| File | Tier | Cases |
|---|---|---|
| `test_readonly_lists.test.ts` | read-only | 4 |
| `test_identity_readonly.test.ts` | read-only | 5 |
| `test_identity_lifecycle.test.ts` | ALLOW_CREATE | 9 |
| `test_gateway_lifecycle.test.ts` | ALLOW_CREATE | 6 |
| `test_runtime_agent_lifecycle.test.ts` | ALLOW_CREATE + `AGENTARTS_TEST_RUNTIME_AGENT_NAME` | 6 |
| `test_code_interpreter_lifecycle.test.ts` | ALLOW_CREATE | 3 |
| `test_memory_lifecycle.test.ts` | ALLOW_CREATE | 12 |
| `test_memory_async.test.ts` | ALLOW_CREATE | 8 |
| `test_runtime_session_lifecycle.test.ts` | RUN_BILLABLE + agent name | 1 |
| `test_code_interpreter_session.test.ts` | RUN_BILLABLE + CI name/API key | 1 |
| `test_v11_upload_signature_real.test.ts` | read-only (real gateway) | 3 |
| `test_auth_decorators.test.ts` | ALLOW_CREATE (+ 1 manual skip) | 3 |
| `test_runtime_app_local.test.ts` | local, always runs | 11 |
| `test_upload_content_type_local.test.ts` | local, always runs | 9 |
| `test_v11_upload_signature.test.ts` | local, always runs | 4 |
| `toolkit/test_cli_local.test.ts` | local, always runs (skips when `dist/` is absent) | 12 |
| `toolkit/test_cli_gateway.test.ts` | read-only + ALLOW_CREATE | 2 |
| `toolkit/test_cli_memory.test.ts` | read-only + ALLOW_CREATE | 2 |
| `toolkit/test_cli_deployed_runtime.test.ts` | billable + deploy project | 4 |

Conditional cases additionally skip on their own inputs
(`AGENTARTS_TEST_WORKLOAD_IDENTITY_NAME`, `AGENTARTS_TEST_OAUTH2_*`,
`AGENTARTS_TEST_STS_AGENCY_URN`, `AGENTARTS_TEST_CODE_INTERPRETER_NAME`, …).

## Coverage by client

Status legend: ✅ real-cloud pass · 🟦 local pass · ⏭ conditional skip ·
💰 requires `RUN_BILLABLE=1` · 🚫 skip (backend prereq / port limitation)

### AgentArtsRuntimeApp (local, 🟦)

| Method / endpoint | Test |
|---|---|
| `entrypoint()` / `ping()` / `websocket()` registration | all local tests |
| `forcePingStatus()` / `getCurrentPingStatus()` | `test_runtime_app_local` |
| `GET /ping` (default / custom / forced) | 3 cases |
| `POST /invocations` (JSON 200 / bad-JSON 400 / no-entrypoint 404 / raise 500) | 4 cases |
| `POST /invocations` (sync + async generator → SSE) | 2 cases |
| `WS /ws` (no-handler rejection / echo) | 2 cases |

Not covered: `asyncTask()`, `hasRunningTasks()`, `run()` itself (used as the test
transport).

### IdentityClient

| Method | Test | Status |
|---|---|---|
| `listWorkloadIdentities` | read-only + lifecycle | ✅ |
| `createWorkloadIdentity` | lifecycle setup | ✅ |
| `getWorkloadIdentity` | lifecycle | ✅ |
| `updateWorkloadIdentity` | lifecycle | ✅ |
| `createApiKeyCredentialProvider` | lifecycle setup | ✅ |
| `getApiKeyCredentialProvider` | lifecycle | ✅ |
| `listApiKeyCredentialProviders` | lifecycle | ✅ |
| `createWorkloadAccessToken` | lifecycle + pre-provisioned | ✅ / ⏭ |
| `getResourceApiKey` | lifecycle | ✅ |
| `create/getOauth2CredentialProvider` | lifecycle (conditional) | ⏭ |
| `create/getStsCredentialProvider` | lifecycle (conditional) | ⏭ |
| raw `deleteWorkloadIdentity` / `delete*CredentialProvider` | `resourceRegistry` teardown | ✅ (implicit) |

Not covered: `getResourceOauth2Token` (3LO), `getResourceStsToken`,
`completeResourceTokenAuth`.

### MemoryClient (sync)

| Method | Test | Status |
|---|---|---|
| `createSpace` (with `memoryStrategiesBuiltin`) | setup | ✅ |
| `getSpace` / `listSpaces` / `updateSpace` | lifecycle | ✅ |
| `deleteSpace` | teardown | ✅ (implicit) |
| `createMemorySession` | setup | ✅ |
| `addMessages` (2× `TextMessage`) | setup | ✅ |
| `listMessages` / `getLastKMessages` / `getMessage` | lifecycle | ✅ |
| `searchMemories` / `listMemories` | lifecycle | ✅ |
| `deleteMemory` | lifecycle (soft skip when nothing extracted) | ⏭ |

### AsyncMemoryClient / AsyncMemorySession

`createMemorySession`, `addMessages`, `listMessages`, `getLastKMessages`,
`getMessage`, `searchMemories`, `listMemories`, `deleteMemory`, plus the
`AsyncMemorySession` wrapper — ✅ (8 cases). Control-plane methods are shared
with the sync client (transitive coverage).

### GatewayClient

| Method | Status |
|---|---|
| `createGateway` (+ auto IAM agency) | ✅ |
| `getGateway` / `listGateways` / `updateGateway` / `deleteGateway` | ✅ |
| `createGatewayTarget` / `get` / `list` / `update` / `delete` | ✅ |
| `listGateways({limit: 1})` read-only | ✅ |

### RuntimeClient

Control plane (standalone mode via `AGENTARTS_TEST_RUNTIME_AGENT_NAME`):

| Method | Status |
|---|---|
| `findAgentByName` / `findAgentById` / `getAgents({limit: 10})` | ✅ |
| `updateAgent` | ✅ |
| `createAgentEndpoint` / `findAgentEndpoint` / `updateAgentEndpoint` / `deleteAgentEndpoint` | ✅ (endpoint created + cleaned up; skips if the backend requires `targetVersionName`) |
| `createAgent` / `createOrUpdateAgent` / `deleteAgentByName` | 🚫 needs a built image from `deploy` |

Data plane (💰 `RUN_BILLABLE`): `startSession`, `execCommand`, `uploadFiles`,
`downloadFiles`, `stopSession` — 1 case; not covered: `invokeAgent` on a live
agent (only the local V11 mirror invokes without a query).

### CodeInterpreter

Control plane ✅ full: `createCodeInterpreter`, `getCodeInterpreter`,
`listCodeInterpreters`, `updateCodeInterpreter`, `deleteCodeInterpreter`
(teardown).

Data plane 💰 (`codeSession`): `enter`/`exit`, `executeCode`,
`executeCommand`, `uploadFile`/`downloadFile`, `getSession`, `clearContext`.

Not covered: multi-file `uploadFiles`/`downloadFiles`, `installPackages`, raw
`invoke`.

### Auth factories

| Factory (Node signature) | Test | Status |
|---|---|---|
| `requireApiKey({ providerName })` | `test_auth_decorators` | ✅ (ALLOW_CREATE) |
| `requireStsToken({ providerName, agencySessionName })` | same | ⏭ (`AGENTARTS_TEST_STS_AGENCY_URN`) |
| `requireAccessToken` (3LO) | same (`it.skip`) | ⏭ manual |
| `Config.load` / `Config.save` | seeded config | ✅ (implicit) |

Node factories append the injected value as the **last positional argument**
(`into` is accepted but unused for injection, matching TypeScript semantics).

## Toolkit (CLI) tests

The CLI is driven as a subprocess through the built entry
(`node packages/agentarts-sdk/dist/cli.js`); there is no in-process
`CliRunner` equivalent, so both Python invocation styles (CliRunner and
subprocess) are exercised as subprocesses. Every CLI case skips with a hint
while `dist/cli.js` has not been built (`pnpm build`).

| CLI command | File | Status |
|---|---|---|
| `--version` / `--help` | `test_cli_local` | 🟦 |
| `init -n … -t {basic,langchain,langgraph}` | `test_cli_local` | 🟦 |
| `init -p` / invalid name | `test_cli_local` | 🟦 |
| `config` (add) / `config list` | `test_cli_local` | 🟦 |
| `config set` / `config get` | `test_cli_local` | 🟦 |
| `config set-env` / `list-env` / `remove-env` | `test_cli_local` | 🟦 |
| `config set-default` / `remove` | `test_cli_local` | 🟦 |
| `dev` (blocking HTTP server) | `test_cli_local` | 🟦 |
| `memory list` | `test_cli_memory` | ✅ |
| `memory create/list/get/update/delete` | `test_cli_memory` | ✅ (ALLOW_CREATE) |
| `gateway list` | `test_cli_gateway` | ✅ |
| `gateway create` | `test_cli_gateway` | ✅ (ALLOW_CREATE) |
| `invoke --mode cloud` on a deployed agent | `test_cli_deployed_runtime` | 💰 |
| `runtime start/exec/upload/download/stop-session` | `test_cli_deployed_runtime` | 💰 |

The CLI's completion bootstrap touches `~/.agentarts`; every CLI subprocess gets
`HOME`/`USERPROFILE` pointed at a temp dir with `.agentarts/.completion_shown`
pre-created, so the real profile is untouched and stdout stays parseable for
`--output json`.

## Porting notes (Python-only content omitted)

Ported 1:1 except for the following deliberate adaptations:

1. **`conftest.py` → `_helpers.ts`.** Pytest fixtures do not exist in vitest;
   the reusable semantics (credential/tier gates, `runId`, `resourceRegistry`,
   shared clients, `memory_space`, `identity_cleanup`, CLI home/env) are exported
   functions. Session-scoped sharing across files is replaced by file-scoped
   state (vitest module isolation); the run id is still shared through
   `globalThis`.
2. **`deployed_runtime_agent` fixture not ported.** It runs
   `agentarts init → deploy` (Docker build, SWR push, `pip` mirror tweak) and
   `destroy`; that is a long, billable, Docker-dependent setup. Consequently:
   - `test_runtime_agent_lifecycle` runs in **standalone** mode only
     (`AGENTARTS_TEST_RUNTIME_AGENT_NAME`);
   - `test_cli_deployed_runtime` targets an already deployed project via
     `AGENTARTS_TEST_RUNTIME_AGENT_NAME` + `AGENTARTS_TEST_DEPLOY_PROJECT_DIR`
     (Node-port-only variable) instead of deploying inside the test;
   - the Python `.env.example` `AGENTARTS_TEST_PIP_INDEX` knob (Docker build
     acceleration) is dropped.
3. **`google-adk` template dropped.** `AGENT_TEMPLATE_TYPES` is
   `basic`/`langchain`/`langgraph`; the CLI local test loops over those three.
   Template file names also differ between the Python scaffold
   (`agent.py` + `requirements.txt`) and the Node scaffold
   (`agent.ts` + `package.json`), so the `init` assertion checks the invariant
   files (`.agentarts_config.yaml`, `Dockerfile`) plus either entry/dependency
   pair.
4. **CLI invocation.** Python uses `typer.testing.CliRunner` and `monkeypatch`
   of `_auto_install_completion`; here everything is a subprocess with a
   redirected HOME. Output is captured through temp files rather than pipes
   (`stdio: ['ignore', fd, fd]`), because a piped child fails with `EPERM`
   under the Windows DSH sandbox.
5. **`dev` scaffold.** Python's `dev` test reuses the `init` project (uvicorn
   serves `agent.py`). The Node `dev` command loads a TS/JS entrypoint while the
   Python-style `init` scaffold is a deployable Python project, so the test
   writes a minimal `agent.mjs` runtime app + `.agentarts_config.yaml` instead.
6. **WebSocket no-handler case.** Python accepts the connection and closes
   `1011`; the Node runtime rejects the upgrade with `403`, which surfaces as a
   `ws` client error. The test asserts "connection unusable" for either shape.
7. **V11 tampered-signature control.** Python corrupts the `Authorization`
   header and re-sends; Node's `fetch` may not forward a manual `host` header,
   so the equivalent corruption is a wrong signing secret (same observable
   `401`). The query-signing necessity proof is preserved via a
   `V11Signer.prototype.sign` spy in both local and real tests.
8. **`test_upload_content_type_local`** builds tar archives by hand (512-byte
   header + payload) because Node has no stdlib `tarfile`; GNU/PAX/ustar magic
   variants are covered.
9. **pytest markers** (`@pytest.mark.integration`, `slow`) are gone — the
   vitest integration config only globs `tests/integration/**/*.test.ts`, and
   gating replaces `slow`.
10. **`test_readonly_lists` code-interpreter case** calls
    `listCodeInterpreters(null, 1)` (positional Node signature) instead of
    Python's `limit=1` keyword.

## Verification

```bash
# Type-check the test sources (does not write anything).
pnpm exec tsc -p tsconfig.check.json --noEmit

# Run the suite (default tier).
pnpm test:integration
```

The local tests (`test_runtime_app_local`, `test_upload_content_type_local`,
`test_v11_upload_signature`, `toolkit/test_cli_local`) need no credentials and
run unconditionally; everything else skips without the corresponding gates.

