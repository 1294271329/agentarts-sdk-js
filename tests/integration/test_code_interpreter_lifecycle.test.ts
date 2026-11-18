/**
 * Code Interpreter control-plane lifecycle (ALLOW_CREATE tier).
 *
 * Ported 1:1 from `tests/integration/test_code_interpreter_lifecycle.py`.
 *
 * Creates a code-interpreter resource, exercises get/list/update, then deletes
 * it. This is control-plane only — NO sandbox session is started, so it does
 * not cost money. The billable sandbox session lives in
 * `test_code_interpreter_session.test.ts`.
 */

import { afterAll, beforeAll, describe, it, expect } from 'vitest';

import { CodeInterpreter } from 'agentarts-sdk';

import {
  allowCreate,
  cloudRegion,
  hasCloudCredentials,
  resourceName,
  resourceRegistry,
} from './_helpers.js';

const describeLifecycle = hasCloudCredentials() && allowCreate() ? describe : describe.skip;

describeLifecycle('code interpreter lifecycle (ALLOW_CREATE tier)', () => {
  let client: CodeInterpreter;
  let codeInterpreterId: string;

  beforeAll(async () => {
    // `uniqueName` satisfies [a-z][a-z0-9-]{0,38}[a-z0-9].
    const name = resourceName('ci');
    client = new CodeInterpreter(cloudRegion());
    const created = await client.createCodeInterpreter(name, 'API_KEY', `${name}-ak`);
    codeInterpreterId = String(created['id']);
    resourceRegistry.register(
      () => client.deleteCodeInterpreter(codeInterpreterId),
      `code_interpreter:${codeInterpreterId}`,
    );
  });

  afterAll(async () => {
    await resourceRegistry.cleanupAll();
  });

  it('getCodeInterpreter returns the created resource', async () => {
    const got = await client.getCodeInterpreter(codeInterpreterId);
    expect(got['id']).toBe(codeInterpreterId);
  });

  it('listCodeInterpreters returns a page', async () => {
    const result = await client.listCodeInterpreters(null, 10);
    expect(typeof result).toBe('object');
    expect(result).not.toBeNull();
  });

  it('updateCodeInterpreter updates the tags', async () => {
    const updated = await client.updateCodeInterpreter(codeInterpreterId, null, [
      { key: 'env', value: 'aa-it' },
    ]);
    expect(typeof updated).toBe('object');
  });
});
