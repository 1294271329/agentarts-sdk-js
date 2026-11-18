/**
 * Runtime upload-files command.
 *
 * Ported from `agentarts/toolkit/cli/runtime/upload_files.py`. The rich progress
 * bar is simplified to line output; the command behaviour and exit codes match.
 */

import { existsSync, statSync } from 'node:fs';
import { basename } from 'node:path';

import { Command } from 'commander';

import { uploadContentType } from '../../../sdk/service/runtime-client.js';
import type { UploadFileSpec } from '../../../sdk/service/runtime-client.js';
import { ValidationError } from '../../operations/runtime/errors.js';
import {
  _checkFileTransferEnabled,
  _resolveAgentInfo,
} from '../../operations/runtime/invoke.js';
import { uploadRuntimeFiles } from '../../operations/runtime/upload-files.js';
import {
  commandAction,
  console,
  echoError,
  echoInfo,
  echoSuccess,
  echoWarning,
  errorMessage,
} from '../common.js';

/** Maximum size of a single uploaded file (100 MB). */
export const MAX_FILE_SIZE = 100 * 1024 * 1024;

/** Default file owner user ID displayed to the user. */
export const DEFAULT_USER_ID = 1000;

/** Default file owner group ID displayed to the user. */
export const DEFAULT_GROUP_ID = 1000;

/** Default file permissions displayed to the user. */
export const DEFAULT_FILE_MODE = '0644';

/** Validate a file mode string as octal (`0644`, `0755`, ...). */
export function validateFileMode(fileMode: string): boolean {
  if (!/^[0-7]+$/.test(fileMode)) {
    return false;
  }
  const modeInt = Number.parseInt(fileMode, 8);
  if (!Number.isFinite(modeInt)) {
    return false;
  }
  return modeInt >= 0 && modeInt <= 0o7777;
}

/** Format a byte count like the Python CLI (`1.5 MB`, `512 bytes`). */
function formatSize(totalSize: number): string {
  if (totalSize >= 1024 * 1024) {
    return `${(totalSize / 1024 / 1024).toFixed(1)} MB`;
  }
  if (totalSize >= 1024) {
    return `${(totalSize / 1024).toFixed(1)} KB`;
  }
  return `${totalSize} bytes`;
}

/** Options of the `upload-files` command (camelCase of the typer options). */
export interface UploadFilesCommandOptions {
  /** `--agent/-a`: agent name (required). */
  agent?: string;
  /** `--session/-s`: session ID (required). */
  session?: string;
  /** `--files/-f`: local file paths (repeatable, required). */
  files?: string[];
  /** `--path/-p`: remote directory path (must end with `/`, default `/tmp/`). */
  path: string;
  /** `--file-user-id`: file owner user ID. */
  fileUserId?: number;
  /** `--file-group-id`: file owner group ID. */
  fileGroupId?: number;
  /** `--file-mode/-m`: file permissions in octal. */
  fileMode?: string;
  /** `--bearer-token/-bt`: bearer token for authentication. */
  bearerToken?: string;
  /** `--region/-r`: region name. */
  region?: string;
  /** `--endpoint/-e`: endpoint name. */
  endpoint?: string;
  /** `--skip-ssl-verification/-k`: skip SSL certificate verification. */
  skipSslVerification: boolean;
  /** `--user-id/-u`: user ID for OAuth2 outbound credentials. */
  userId?: string;
  /** `--timeout`: request timeout in seconds (default 900). */
  timeout: number;
}

/**
 * Upload files to the runtime (cloud only).
 *
 * @returns Process exit code (`0` on success, `1` on failure).
 */
export async function uploadFilesCmd(options: UploadFilesCommandOptions): Promise<number> {
  try {
    if (!options.files || options.files.length === 0) {
      echoError('Files are required (-f)');
      return 1;
    }

    if (!options.session) {
      echoError('Session ID is required (--session)');
      return 1;
    }

    if (!options.path.endsWith('/')) {
      echoError(`Remote path must be a directory and end with '/': ${options.path}`);
      return 1;
    }

    if (options.fileMode !== undefined && !validateFileMode(options.fileMode)) {
      echoError(`Invalid file mode: ${options.fileMode}. Must be valid octal (e.g., 0644, 0755)`);
      return 1;
    }

    const fileList: UploadFileSpec[] = [];
    let totalSize = 0;
    for (const item of options.files) {
      const localPath = item.trim();

      if (!existsSync(localPath)) {
        echoError(`Local file not found: ${localPath}`);
        return 1;
      }

      const fileSize = statSync(localPath).size;
      if (fileSize > MAX_FILE_SIZE) {
        echoError(
          `File too large: ${localPath} (${(fileSize / 1024 / 1024).toFixed(1)}MB, max 100MB)`,
        );
        return 1;
      }

      totalSize += fileSize;
      fileList.push({ localFile: localPath });
    }

    let uploadMode: string;
    if (fileList.length === 1) {
      // Mirror the actual Content-Type the data plane will send: tar goes on the
      // application/x-tar channel, everything else on octet-stream.
      const onlyFile = fileList[0].localFile ?? null;
      const contentType = uploadContentType(onlyFile);
      uploadMode = `streaming (${contentType})`;
    } else {
      uploadMode = 'multipart';
    }
    console.print(`[dim]Upload mode: ${uploadMode}[/dim]`);
    console.print(`[dim]Total size: ${formatSize(totalSize)}[/dim]`);

    const displayFileUserId = options.fileUserId ?? DEFAULT_USER_ID;
    const displayFileGroupId = options.fileGroupId ?? DEFAULT_GROUP_ID;
    const displayFileMode = options.fileMode ?? DEFAULT_FILE_MODE;

    const userIdNote = options.fileUserId !== undefined ? '' : ' (default)';
    const groupIdNote = options.fileGroupId !== undefined ? '' : ' (default)';
    const modeNote = options.fileMode !== undefined ? '' : ' (default)';

    echoInfo(
      'Upload Files',
      `[cyan]Agent:[/cyan] [white]${options.agent}[/white]\n[cyan]Session:[/cyan] [dim]${options.session}[/dim]\n[cyan]Files:[/cyan] [yellow]${fileList.length}[/yellow]\n[cyan]File User ID:[/cyan] [dim]${displayFileUserId}${userIdNote}[/dim]\n[cyan]File Group ID:[/cyan] [dim]${displayFileGroupId}${groupIdNote}[/dim]\n[cyan]File Mode:[/cyan] [dim]${displayFileMode}${modeNote}[/dim]`,
    );

    const [resolvedName, resolvedRegion, agentId] = _resolveAgentInfo(
      options.agent ?? null,
      options.region ?? null,
    );
    if (resolvedName) {
      await _checkFileTransferEnabled(
        resolvedName,
        resolvedRegion || '',
        agentId,
        !options.skipSslVerification,
      );
    }

    console.print(`[dim]Uploading ${fileList.length} files...[/dim]`);

    const result = await uploadRuntimeFiles({
      agentName: options.agent ?? null,
      sessionId: options.session,
      files: fileList,
      path: options.path,
      fileUserId: options.fileUserId ?? null,
      fileGroupId: options.fileGroupId ?? null,
      fileMode: options.fileMode ?? null,
      bearerToken: options.bearerToken ?? null,
      region: options.region ?? null,
      endpoint: options.endpoint ?? null,
      skipSslVerification: options.skipSslVerification,
      userId: options.userId ?? null,
      timeout: options.timeout,
    });

    console.print('[dim]Upload complete[/dim]');

    echoSuccess(`Uploaded ${fileList.length} files successfully`);
    console.print(`[cyan]File User ID:[/cyan] [dim]${displayFileUserId}${userIdNote}[/dim]`);
    console.print(`[cyan]File Group ID:[/cyan] [dim]${displayFileGroupId}${groupIdNote}[/dim]`);
    console.print(`[cyan]File Mode:[/cyan] [dim]${displayFileMode}${modeNote}[/dim]`);

    for (const fileSpec of fileList) {
      const filename = basename(fileSpec.localFile ?? '');
      console.print(`  [green]✓[/green] ${options.path}${filename}`);
    }

    console.print();
    console.print('[cyan]API Response:[/cyan]');
    console.print(`[dim]${JSON.stringify(result, null, 2)}[/dim]`);

    return 0;
  } catch (error) {
    if (error instanceof ValidationError) {
      echoError(`Validation error: ${errorMessage(error)}`);
      if (errorMessage(error).toLowerCase().includes('file transfer is not enabled')) {
        echoWarning(
          'The file_transfer_config.enabled parameter cannot be modified for existing agents. ' +
            'You need to create a new agent with file transfer enabled.',
        );
      }
      return 1;
    }
    if ((error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT') {
      echoError(`File error: ${errorMessage(error)}`);
      return 1;
    }
    echoError(`Failed to upload files: ${errorMessage(error)}`);
    return 1;
  }
}

/** Build the `upload-files` command. */
export function createUploadFilesCommand(): Command {
  const command = new Command('upload-files');

  command
    .description('Upload files to runtime (cloud only).')
    .option('-a, --agent <agent>', 'Agent name [required]')
    .option('-s, --session <session>', 'Session ID [required]')
    .option(
      '-f, --files <file>',
      'Local file path to upload. Can be specified multiple times for multiple files [required]',
      (value: string, previous: string[]) => [...previous, value],
      [] as string[],
    )
    .option(
      '-p, --path <path>',
      "Remote directory path to upload files to. Must end with '/' (e.g., /tmp/). Default: /tmp/",
      '/tmp/',
    )
    .option('--file-user-id <id>', 'File owner user ID (default: 1000)', (value: string) =>
      Number.parseInt(value, 10),
    )
    .option('--file-group-id <id>', 'File owner group ID (default: 1000)', (value: string) =>
      Number.parseInt(value, 10),
    )
    .option('-m, --file-mode <mode>', 'File permissions in octal (default: 0644)')
    .option('--bearer-token <token>', 'Bearer token for authentication')
    .option('-r, --region <region>', 'Region name')
    .option('-e, --endpoint <endpoint>', 'Endpoint name')
    .option('-k, --skip-ssl-verification', 'Skip SSL certificate verification', false)
    .option('-u, --user-id <userId>', 'User ID for OAuth2 outbound credentials')
    .option(
      '--timeout <seconds>',
      'Request timeout in seconds (default: 900)',
      (value: string) => Number.parseInt(value, 10),
      900,
    )
    .addHelpText(
      'after',
      `
Configuration requirement:
  This command requires file transfer to be enabled on the deployed agent. Set
  file_transfer_config.enabled=true in .agentarts_config.yaml and redeploy, or
  update the configuration on the Huawei Cloud AgentArts console.

Examples:
  # Single file (uploaded to default /tmp/)
  agentarts runtime upload-files --agent myagent --session <session-id> -f file1.txt

  # Multiple files (use -f multiple times)
  agentarts runtime upload-files --agent myagent --session <session-id> -f file1.txt -f file2.txt

  # Specify remote directory path (must end with '/')
  agentarts runtime upload-files --agent myagent --session <session-id> -f file1.txt -p /app/data/

  # With custom permissions / owner / OAuth user
  agentarts runtime upload-files --agent myagent --session <session-id> -f script.sh --file-mode 0755
  agentarts runtime upload-files --agent myagent --session <session-id> -f data.txt --file-user-id 1001 --file-group-id 1001
  agentarts runtime upload-files --agent myagent --session <session-id> -f data.txt --user-id oauth-user-123`,
    )
    .action(commandAction(uploadFilesCmd));

  return command;
}

/** Register the `upload-files` command on an existing program. */
export function registerUploadFilesCommand(program: Command): void {
  program.addCommand(createUploadFilesCommand());
}
