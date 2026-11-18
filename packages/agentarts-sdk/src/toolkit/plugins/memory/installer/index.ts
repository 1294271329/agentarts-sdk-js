/**
 * AgentArts Memory unified installer package.
 *
 * Ported from
 * `agentarts/toolkit/plugins/memory/installer/__init__.py`.
 */

export const VERSION = '1.0.0';

export {
  MCP_REQUIRED_SPEC,
  ensureMcpInstalled,
  installCommand,
  isMcpAvailable,
  needsMcp,
} from './deps.js';
export { installCmd, uninstallCmd, VALID_TARGETS } from './cli.js';
export type { InstallCommandOptions, UninstallCommandOptions } from './cli.js';
export {
  InstallResult,
  PLATFORMS,
  Platform,
  detectAll,
  getPlatform,
  hermesHome,
} from './platforms/index.js';
export {
  ENV_API_KEY,
  ENV_REGION,
  ENV_SPACE_ID,
  MANIFEST_DIR,
  MANIFEST_FILE,
  MCP_SERVER_COMMAND,
  MCP_SERVER_MODULE,
  MCP_SERVER_NAME,
  buildMcpEnv,
  checkEnv,
  confirm,
  expand,
  find,
  interactiveFill,
  listAll,
  load,
  manifestPath,
  mcpServerArgs,
  readJson,
  remove,
  removeHooksKey,
  mergeHooks,
  selectOne,
  setYes,
  stripHooks,
  writeJsonAtomic,
} from './utils.js';
