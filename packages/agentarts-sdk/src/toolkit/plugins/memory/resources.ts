/**
 * Locate the memory plugin asset tree at runtime.
 *
 * The Python SDK ships the plugin payloads (hook scripts, hook templates,
 * Hermes manifest, the standalone TypeScript MCP server sources) inside the
 * importable package. The Node.js package keeps them under
 * `packages/agentarts-sdk/assets/toolkit/plugins/memory/**` and
 * `scripts/copy-assets.mjs` mirrors that tree into `dist/assets/**` during
 * `pnpm build`, so both layouts must be supported:
 *
 * - built package: `<pkg>/dist/assets/toolkit/plugins/memory/...` (preferred),
 *   falling back to `<pkg>/assets/...` when the copy step did not run;
 * - source runs (`tsx`, `vitest`): `<pkg>/assets/toolkit/plugins/memory/...`,
 *   falling back to a previously built `<pkg>/dist/assets/...`.
 *
 * The package root is derived from `import.meta.url`, so it works no matter
 * where the consuming project lives or how the package is linked
 * (workspace symlink, packed tarball, global install).
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Path of the memory assets inside the assets root (forward slashes). */
const MEMORY_ASSETS_SUBPATH = ['toolkit', 'plugins', 'memory'] as const;

/** Cache of the resolved assets root (the tree is immutable at runtime). */
let assetsRootCache: string | undefined;

/** Absolute directory of this module (`<pkg>/dist|src/toolkit/plugins/memory`). */
function moduleDirectory(): string {
  return dirname(fileURLToPath(import.meta.url));
}

/** True when this module was loaded from a compiled `dist/` tree. */
function isBuiltLayout(): boolean {
  return moduleDirectory().split(sep).includes('dist');
}

/** Directory that holds the memory assets tree, e.g. `<pkg>/dist/assets`. */
function candidateRoots(): string[] {
  const roots: string[] = [];
  const moduleDir = moduleDirectory();
  let current = moduleDir;

  for (;;) {
    const distAssets = join(current, 'dist', 'assets');
    const sourceAssets = join(current, 'assets');
    // Prefer the tree matching the layout this module runs from, so a built
    // package reads `dist/assets` and a source run reads `assets`.
    roots.push(isBuiltLayout() ? distAssets : sourceAssets);
    roots.push(isBuiltLayout() ? sourceAssets : distAssets);

    const parent = dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }
  return roots;
}

/** True when `root` contains the memory assets tree. */
function hasMemoryAssets(root: string): boolean {
  return existsSync(join(root, ...MEMORY_ASSETS_SUBPATH));
}

/**
 * Absolute path of the assets root (the directory containing
 * `toolkit/plugins/memory`).
 *
 * @throws Error when no assets tree can be found next to the package.
 */
export function memoryAssetsRoot(): string {
  if (assetsRootCache !== undefined) {
    return assetsRootCache;
  }
  for (const root of candidateRoots()) {
    if (hasMemoryAssets(root)) {
      assetsRootCache = root;
      return root;
    }
  }
  throw new Error(
    `agentarts-sdk: memory assets not found (run "node scripts/copy-assets.mjs"); ` +
      `looked for ${join(...MEMORY_ASSETS_SUBPATH)} next to ${moduleDirectory()}`,
  );
}

/**
 * Absolute path of a memory asset.
 *
 * @param relativePath Path relative to `assets/toolkit/plugins/memory`, e.g.
 *   `resources/scripts/prompt-submit.mjs`. Forward slashes are accepted on
 *   every platform.
 */
export function getMemoryAssetPath(relativePath: string): string {
  const root = resolve(memoryAssetsRoot(), ...MEMORY_ASSETS_SUBPATH);
  const segments = normalize(relativePath).split(/[\\/]/).filter((part) => part.length > 0 && part !== '.');
  if (isAbsolute(relativePath) || segments.includes('..')) {
    throw new Error(`agentarts-sdk: invalid memory asset path: ${relativePath}`);
  }
  return join(root, ...segments);
}

/**
 * Read a memory asset as UTF-8 text.
 *
 * @param relativePath Path relative to `assets/toolkit/plugins/memory`.
 */
export function readMemoryAsset(relativePath: string): string {
  return readFileSync(getMemoryAssetPath(relativePath), 'utf8');
}

/**
 * Directory that holds the compiled (or, in a source run, TypeScript) modules
 * of the package: `<pkg>/dist` for a built package, `<pkg>/src` otherwise.
 *
 * Used by the installer to point platform MCP configs at the MCP server entry
 * point and to locate the Hermes provider module.
 */
export function memoryModuleRoot(): string {
  const assetsRoot = memoryAssetsRoot();
  return isBuiltLayout() ? dirname(assetsRoot) : join(dirname(assetsRoot), 'src');
}

/**
 * Resolve a package-internal module file (`provider`, `mcp/server`, ...).
 *
 * @param relativeModulePath Module path relative to `toolkit/`, without
 *   extension, e.g. `plugins/memory/mcp/server`.
 * @returns Absolute path of the `.js`/`.ts`/`.mjs` file, preferring the layout
 *   this module runs from. Falls back to the `.js` path when nothing exists
 *   yet (the built package always ships `.js`).
 */
export function resolveMemoryModuleFile(relativeModulePath: string): string {
  const base = join(memoryModuleRoot(), 'toolkit', ...relativeModulePath.split('/'));
  const extensions = isBuiltLayout() ? ['.js', '.ts', '.mjs'] : ['.ts', '.js', '.mjs'];
  for (const extension of extensions) {
    const candidate = `${base}${extension}`;
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return `${base}.js`;
}
