/**
 * Gateway CLI e2e tests.
 *
 * Ported 1:1 from `tests/integration/toolkit/test_cli_gateway.py`.
 *
 * Invokes the real `agentarts gateway` CLI as a subprocess. The read-only
 * `gateway list` runs in the default tier; the gateway create lifecycle
 * (ALLOW_CREATE) exercises the auto-IAM-agency path.
 *
 * Node port note: the CLI is driven through the built entry
 * (`node packages/agentarts-sdk/dist/cli.js`); every case skips when `dist/`
 * has not been built yet.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  allowCreate,
  createCliHome,
  hasCloudCredentials,
  isCliReady,
  resourceName,
  runCli,
} from '../_helpers.js';
import type { CliHome } from '../_helpers.js';

const CLI_READY = isCliReady();
const describeIntegration = hasCloudCredentials() ? describe : describe.skip;
const describeCreate = hasCloudCredentials() && allowCreate() ? describe : describe.skip;

describeIntegration('gateway CLI (default tier)', () => {
  let home: CliHome;

  beforeAll(async () => {
    home = await createCliHome();
  });

  afterAll(async () => {
    await home.dispose();
  });

  it.skipIf(!CLI_READY)('gateway list --limit 1 succeeds (read-only)', () => {
    const result = runCli(['gateway', 'list', '--limit', '1'], {
      env: home.env,
      timeoutMs: 180_000,
    });
    expect(result.status, result.stderr).toBe(0);
  });
});

describeCreate('gateway CLI (ALLOW_CREATE tier)', () => {
  let home: CliHome;

  beforeAll(async () => {
    home = await createCliHome();
  });

  afterAll(async () => {
    await home.dispose();
  });

  it.skipIf(!CLI_READY)('gateway create exercises the auto-agency path', () => {
    const name = resourceName('cli-gw');
    const result = runCli(
      ['gateway', 'create', '--name', name, '--description', 'aa-it'],
      { env: home.env, timeoutMs: 300_000 },
    );
    expect(result.status, result.stderr).toBe(0);
  });
});
