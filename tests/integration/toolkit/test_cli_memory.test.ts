/**
 * Memory CLI e2e tests.
 *
 * Ported 1:1 from `tests/integration/toolkit/test_cli_memory.py`.
 *
 * Invokes the real `agentarts memory` CLI as a subprocess (reliable stdout
 * capture for `--output json` parsing). The default region for the memory CLI
 * is cn-north-4, so `--region` is passed explicitly to match the account under
 * test.
 *
 * Node port note: the CLI is driven through the built entry
 * (`node packages/agentarts-sdk/dist/cli.js`); every case skips when `dist/`
 * has not been built yet.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  allowCreate,
  cloudRegion,
  createCliHome,
  hasCloudCredentials,
  isCliReady,
  resourceName,
  resourceRegistry,
  runCli,
} from '../_helpers.js';
import type { CliHome } from '../_helpers.js';

const CLI_READY = isCliReady();
const describeIntegration = hasCloudCredentials() ? describe : describe.skip;
const describeCreate = hasCloudCredentials() && allowCreate() ? describe : describe.skip;

/** Pull the JSON object out of stdout (operation INFO logs precede it). */
function extractJson(text: string): Record<string, any> {
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] !== '{') {
      continue;
    }
    try {
      return JSON.parse(text.slice(index)) as Record<string, any>;
    } catch {
      // keep looking for a parseable object
    }
  }
  throw new Error(`no JSON object found in output:\n${JSON.stringify(text)}`);
}

describeIntegration('memory CLI (default tier)', () => {
  let home: CliHome;

  beforeAll(async () => {
    home = await createCliHome();
  });

  afterAll(async () => {
    await home.dispose();
  });

  it.skipIf(!CLI_READY)('memory list --limit 1 succeeds (read-only)', () => {
    const result = runCli(
      ['memory', 'list', '--limit', '1', '--region', cloudRegion()],
      { env: home.env, timeoutMs: 180_000 },
    );
    expect(result.status, result.stderr).toBe(0);
  });
});

describeCreate('memory CLI (ALLOW_CREATE tier)', () => {
  let home: CliHome;

  beforeAll(async () => {
    home = await createCliHome();
  });

  afterAll(async () => {
    await resourceRegistry.cleanupAll();
    await home.dispose();
  });

  it.skipIf(!CLI_READY)('memory create/list/get/update/delete lifecycle', () => {
    const region = cloudRegion();
    const name = resourceName('cli-space');

    // create (JSON output -> extract the space id)
    const created = runCli(
      [
        'memory',
        'create',
        name,
        '--strategies',
        'semantic',
        '--region',
        region,
        '--output',
        'json',
      ],
      { env: home.env, timeoutMs: 180_000 },
    );
    expect(created.status, created.stderr).toBe(0);
    const spaceId = extractJson(created.stdout)['id'];
    expect(spaceId).toBeTruthy();

    resourceRegistry.register(
      () =>
        runCli(['memory', 'delete', String(spaceId), '--force', '--region', region], {
          env: home.env,
        }),
      `cli-space:${spaceId}`,
    );

    // list / get / update / delete through the CLI
    expect(
      runCli(['memory', 'list', '--limit', '1', '--region', region], { env: home.env }).status,
    ).toBe(0);
    expect(runCli(['memory', 'get', String(spaceId), '--region', region], { env: home.env }).status).toBe(0);
    expect(
      runCli(
        [
          'memory',
          'update',
          String(spaceId),
          '--description',
          'updated by cli',
          '--region',
          region,
        ],
        { env: home.env },
      ).status,
    ).toBe(0);
    expect(
      runCli(['memory', 'delete', String(spaceId), '--force', '--region', region], {
        env: home.env,
      }).status,
    ).toBe(0);
  });
});
