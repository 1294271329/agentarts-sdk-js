import { cpSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const jobs = [
  {
    from: resolve(repoRoot, 'packages/agentarts-sdk/assets'),
    to: resolve(repoRoot, 'packages/agentarts-sdk/dist/assets'),
  },
];

for (const { from, to } of jobs) {
  if (!existsSync(from)) {
    console.log(`[copy-assets] skip missing ${from}`);
    continue;
  }
  cpSync(from, to, { recursive: true });
  console.log(`[copy-assets] ${from} -> ${to}`);
}
