/**
 * Runtime download-files command.
 *
 * Ported from `agentarts/toolkit/cli/runtime/download_files.py`. The rich
 * progress bar is simplified to line output; the command behaviour and exit
 * codes match.
 */

import { Command } from 'commander';

import { ValidationError } from '../../operations/runtime/errors.js';
import { downloadRuntimeFiles } from '../../operations/runtime/download-files.js';
import { commandAction, console, echoError, echoInfo, echoSuccess, errorMessage } from '../common.js';

/** Format a byte count like the Python CLI (`1.50 MB`, `12 bytes`). */
function formatDownloadSize(sizeBytes: number): string {
  const sizeKb = sizeBytes / 1024;
  const sizeMb = sizeKb / 1024;

  if (sizeMb >= 1) {
    return `${sizeMb.toFixed(2)} MB`;
  }
  if (sizeKb >= 1) {
    return `${sizeKb.toFixed(2)} KB`;
  }
  return `${sizeBytes} bytes`;
}

/** Options of the `download-files` command (camelCase of the typer options). */
export interface DownloadFilesCommandOptions {
  /** `--agent/-a`: agent name (required). */
  agent?: string;
  /** `--session/-s`: session ID (required). */
  session?: string;
  /** `--path/-p`: remote file/directory path (required). */
  path: string;
  /** `--output/-o`: local output path. */
  output?: string;
  /** `--recursive`: download a directory as a tar archive. */
  recursive: boolean;
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
 * Download files from the runtime (cloud only).
 *
 * @returns Process exit code (`0` on success, `1` on failure).
 */
export async function downloadFilesCmd(
  options: DownloadFilesCommandOptions,
): Promise<number> {
  try {
    if (!options.path) {
      echoError('Path is required (--path)');
      return 1;
    }

    if (!options.session) {
      echoError('Session ID is required (--session)');
      return 1;
    }

    const downloadMode = options.recursive ? 'directory (tar archive)' : 'single file';
    console.print(`[dim]Download mode: ${downloadMode}[/dim]`);

    echoInfo(
      'Download Files',
      `[cyan]Agent:[/cyan] [white]${options.agent}[/white]\n[cyan]Session:[/cyan] [dim]${options.session}[/dim]\n[cyan]Path:[/cyan] [yellow]${options.path}[/yellow]`,
    );

    console.print(`[dim]Downloading ${options.path}...[/dim]`);

    const result = await downloadRuntimeFiles({
      agentName: options.agent ?? null,
      sessionId: options.session,
      path: options.path,
      output: options.output ?? null,
      recursive: options.recursive,
      bearerToken: options.bearerToken ?? null,
      region: options.region ?? null,
      endpoint: options.endpoint ?? null,
      skipSslVerification: options.skipSslVerification,
      userId: options.userId ?? null,
      timeout: options.timeout,
    });

    console.print('[dim]Download complete[/dim]');

    const sizeBytes = Number(result['size'] ?? 0);

    echoSuccess('Download completed successfully');
    console.print(`  [cyan]Saved to:[/cyan] [bold]${result['saved_path']}[/bold]`);
    console.print(`  [cyan]Size:[/cyan] [dim]${formatDownloadSize(sizeBytes)}[/dim]`);
    console.print(
      `  [cyan]Content-Type:[/cyan] [dim]${result['content_type'] ?? 'unknown'}[/dim]`,
    );
    console.print(`  [cyan]Remote path:[/cyan] [dim]${result['path']}[/dim]`);

    return 0;
  } catch (error) {
    if (error instanceof ValidationError) {
      echoError(`Validation error: ${errorMessage(error)}`);
      return 1;
    }
    echoError(`Failed to download: ${errorMessage(error)}`);
    return 1;
  }
}

/** Build the `download-files` command. */
export function createDownloadFilesCommand(): Command {
  const command = new Command('download-files');

  command
    .description('Download files from runtime (cloud only).')
    .option('-a, --agent <agent>', 'Agent name [required]')
    .option('-s, --session <session>', 'Session ID [required]')
    .option('-p, --path <path>', 'Remote file/directory path [required]', '')
    .option('-o, --output <path>', 'Local output path')
    .option('--recursive', 'Download directory as tar archive', false)
    .option('--bearer-token <token>', 'Bearer token for authentication')
    .option('-r, --region <region>', 'Region name')
    .option('-e, --endpoint <endpoint>', 'Endpoint name')
    .option('-k, --skip-ssl-verification', 'Skip SSL certificate verification', false)
    .option('-u, --user-id <userId>', 'User ID for OAuth2 outbound credentials')
    .option('--timeout <seconds>', 'Request timeout in seconds (default: 900)', (value: string) => Number.parseInt(value, 10), 900)
    .addHelpText(
      'after',
      `
Configuration requirement:
  This command requires file transfer to be enabled on the deployed agent. Set
  file_transfer_config.enabled=true in .agentarts_config.yaml and redeploy, or
  update the configuration on the Huawei Cloud AgentArts console.

Examples:
  # Download single file
  agentarts runtime download-files --agent myagent --session <session-id> --path /tmp/data.txt

  # Download with custom output path
  agentarts runtime download-files -a myagent -s <session-id> -p /tmp/data.txt -o ./local_data.txt

  # Download directory as tar
  agentarts runtime download-files -a myagent -s <session-id> -p /tmp/project --recursive

  # Use bearer token
  agentarts runtime download-files -a myagent -s <session-id> -p /data/file.txt -bt <token>`,
    )
    .action(commandAction(downloadFilesCmd));

  return command;
}

/** Register the `download-files` command on an existing program. */
export function registerDownloadFilesCommand(program: Command): void {
  program.addCommand(createDownloadFilesCommand());
}
