/**
 * AgentArts CLI - Runtime Commands.
 *
 * Ported from `agentarts/toolkit/cli/runtime/__init__.py`: the Python package
 * re-exports the `config_app` typer app plus the `deploy`, `dev`, `init` and
 * `invoke` command functions. The commander counterpart exports the factories
 * that build the same commands, the action functions (which return process exit
 * codes), and the aggregate registration helpers used by `toolkit/main.ts`.
 */

import type { Command } from 'commander';

import { createConfigCommand } from './config.js';
import { createRuntimeAppCommand } from './commands.js';
import { createDeployCommand } from './deploy.js';
import { createDestroyCommand } from './destroy.js';
import { createDevCommand } from './dev.js';
import { createInitCommand } from './init.js';
import { createInvokeCommand } from './invoke.js';

export { createConfigCommand, registerConfigCommands } from './config.js';
export type { ConfigCommandOptions } from './config.js';
export {
  main as configMain,
  list,
  setDefault,
  get,
  set,
  remove,
  setEnv,
  removeEnv,
  listEnv,
} from './config.js';

export { createDeployCommand, registerDeployCommands, deploy } from './deploy.js';
export type { DeployCommandOptions } from './deploy.js';

export { createDevCommand, registerDevCommands, dev, parseEnvVar } from './dev.js';
export type { DevCommandOptions } from './dev.js';

export { createDestroyCommand, registerDestroyCommands, destroy } from './destroy.js';
export type { DestroyCommandOptions } from './destroy.js';

export {
  TEMPLATE_DESCRIPTIONS,
  TemplateType,
  createInitCommand,
  init,
  promptForName,
  promptForRegion,
  promptForTemplate,
  registerInitCommands,
} from './init.js';
export type { InitCommandOptions } from './init.js';

export { createInvokeCommand, registerInvokeCommands, invoke } from './invoke.js';
export type { InvokeCommandOptions } from './invoke.js';

export {
  createExecCommand,
  registerExecCommand,
  execCommandCmd,
  validateTimeout,
} from './exec-command.js';
export type { ExecCommandOptions } from './exec-command.js';

export {
  createStartSessionCommand,
  registerStartSessionCommand,
  startSessionCmd,
} from './start-session.js';
export type { StartSessionCommandOptions } from './start-session.js';

export {
  createStopSessionCommand,
  registerStopSessionCommand,
  stopSessionCmd,
} from './stop-session.js';
export type { StopSessionCommandOptions } from './stop-session.js';

export {
  DEFAULT_FILE_MODE,
  DEFAULT_GROUP_ID,
  DEFAULT_USER_ID,
  MAX_FILE_SIZE,
  createUploadFilesCommand,
  registerUploadFilesCommand,
  uploadFilesCmd,
  validateFileMode,
} from './upload-files.js';
export type { UploadFilesCommandOptions } from './upload-files.js';

export {
  createDownloadFilesCommand,
  downloadFilesCmd,
  registerDownloadFilesCommand,
} from './download-files.js';
export type { DownloadFilesCommandOptions } from './download-files.js';

export { createRuntimeAppCommand, registerRuntimeAppCommand } from './commands.js';

/**
 * Build the runtime commands, in the order `toolkit/main.py` registers them:
 * `init`, `config`, `dev`, `launch`, `invoke`, `runtime`, `destroy`.
 */
export function createRuntimeCommands(): Command[] {
  return [
    createInitCommand(),
    createConfigCommand('config'),
    createDevCommand(),
    createDeployCommand('launch'),
    createInvokeCommand(),
    createRuntimeAppCommand('runtime'),
    createDestroyCommand(),
  ];
}

/**
 * Build the hidden runtime aliases (`deploy` for `launch`, `configure` for
 * `config`), mirroring Python's `hidden=True` registrations.
 */
export function createRuntimeAliasCommands(): Command[] {
  return [createDeployCommand('deploy'), createConfigCommand('configure')];
}

/** Register all runtime commands (including the hidden aliases) on `program`. */
export function registerRuntimeCommands(program: Command): void {
  for (const command of createRuntimeCommands()) {
    program.addCommand(command);
  }
  for (const command of createRuntimeAliasCommands()) {
    program.addCommand(command, { hidden: true });
  }
}
