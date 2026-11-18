import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));
const p = (rel: string): string => resolve(root, rel);

export default [
  { find: /^agentarts-sdk$/, replacement: p('packages/agentarts-sdk/src/index.ts') },
  { find: /^agentarts-sdk\/sdk$/, replacement: p('packages/agentarts-sdk/src/sdk/index.ts') },
  {
    find: /^agentarts-sdk\/toolkit$/,
    replacement: p('packages/agentarts-sdk/src/toolkit/index.ts'),
  },
  { find: /^agentarts-sdk\/(.*)$/, replacement: p('packages/agentarts-sdk/src/$1') },
  {
    find: /^huaweicloud-sdk-agentidentity$/,
    replacement: p('packages/huaweicloud-sdk-agentidentity/src/index.ts'),
  },
];
