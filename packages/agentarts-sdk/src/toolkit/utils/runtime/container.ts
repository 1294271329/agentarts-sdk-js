/**
 * Container operations for Docker.
 *
 * Ported from `agentarts/toolkit/utils/runtime/container.py`. Provides functions
 * for building, tagging, pushing and running Docker images.
 *
 * Python's `subprocess.run(..., capture_output=True)` maps to a promisified
 * `execFile` returning `{ stdout, stderr, code }`; the streaming
 * `subprocess.Popen` loops map to `spawn` plus a line reader. There is no Docker
 * SDK dependency: the `docker` CLI is invoked directly.
 */

import { execFile, spawn } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import type { Readable } from 'node:stream';
import { promisify } from 'node:util';

import { console, escapeMarkup } from '../console.js';
import { renderDockerfile } from '../templates/docker/index.js';

/** Result of a captured command run (Python `subprocess.CompletedProcess`). */
export interface CommandResult {
  stdout: string;
  stderr: string;
  code: number;
}

interface RunCommandOptions {
  timeout?: number;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

const DEFAULT_MAX_BUFFER = 16 * 1024 * 1024;

const execFileAsync = promisify(execFile) as unknown as (
  file: string,
  args: readonly string[],
  options: {
    encoding: 'utf8';
    timeout?: number;
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    maxBuffer?: number;
    windowsHide?: boolean;
  },
) => Promise<{ stdout: string; stderr: string }>;

/**
 * Run a command and capture its output.
 *
 * Counterpart of `subprocess.run(..., capture_output=True, text=True)`; the
 * returned promise never rejects 鈥?failures surface through `code`.
 */
async function runCommand(
  command: string,
  args: readonly string[],
  options: RunCommandOptions = {},
): Promise<CommandResult> {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      encoding: 'utf8',
      timeout: options.timeout,
      cwd: options.cwd,
      env: options.env,
      maxBuffer: DEFAULT_MAX_BUFFER,
      windowsHide: true,
    });
    return { stdout: stdout ?? '', stderr: stderr ?? '', code: 0 };
  } catch (error) {
    const failure = error as NodeJS.ErrnoException & {
      stdout?: string;
      stderr?: string;
      killed?: boolean;
    };
    const rawCode = failure.code;
    const code = typeof rawCode === 'number' ? rawCode : failure.killed ? 124 : 1;
    let stderr = failure.stderr ?? '';
    if (failure.killed && !stderr) {
      stderr = `Command timed out after ${Math.round((options.timeout ?? 0) / 1000)} seconds`;
    }
    return {
      stdout: failure.stdout ?? '',
      stderr: stderr || failure.message || String(error),
      code,
    };
  }
}

interface StreamedCommandResult {
  code: number;
  timedOut: boolean;
  spawnError: Error | null;
}

/**
 * Run a command, forwarding every output line to `onLine`.
 *
 * Counterpart of `subprocess.Popen(stdout=PIPE, stderr=STDOUT)` iteration: both
 * streams are forwarded, and the child is killed when `timeout` elapses.
 */
function runStreamingCommand(
  command: string,
  args: readonly string[],
  onLine: (line: string) => void,
  options: RunCommandOptions = {},
): Promise<StreamedCommandResult> {
  return new Promise<StreamedCommandResult>((resolvePromise) => {
    let child;
    try {
      child = spawn(command, args as string[], {
        cwd: options.cwd,
        env: options.env,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });
    } catch (error) {
      resolvePromise({ code: 127, timedOut: false, spawnError: error as Error });
      return;
    }

    let settled = false;
    let timedOut = false;
    const timers: NodeJS.Timeout[] = [];

    const settle = (result: StreamedCommandResult): void => {
      if (settled) {
        return;
      }
      settled = true;
      for (const timer of timers) {
        clearTimeout(timer);
      }
      resolvePromise(result);
    };

    if (options.timeout !== undefined && options.timeout > 0) {
      timers.push(
        setTimeout(() => {
          timedOut = true;
          child.kill('SIGTERM');
          timers.push(
            setTimeout(() => {
              child.kill('SIGKILL');
            }, 1000),
          );
        }, options.timeout),
      );
    }

    for (const stream of [child.stdout, child.stderr]) {
      if (stream === null) {
        continue;
      }
      const reader = createInterface({ input: stream as Readable, crlfDelay: Infinity });
      reader.on('line', (line: string) => onLine(line));
    }

    child.on('error', (error: Error) => settle({ code: 127, timedOut, spawnError: error }));
    child.on('close', (code: number | null) =>
      settle({ code: code ?? 1, timedOut, spawnError: null }),
    );
  });
}

/** Strip trailing whitespace (Python `str.rstrip()`). */
function rstrip(line: string): string {
  return line.replace(/\s+$/, '');
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Check if Docker is available and running. */
export async function checkDockerAvailable(): Promise<boolean> {
  const result = await runCommand('docker', ['info'], { timeout: 30_000 });
  return result.code === 0;
}

/** Check if a Dockerfile exists in the current directory. */
export function checkDockerfileExists(): boolean {
  return existsSync(join(process.cwd(), 'Dockerfile'));
}

/**
 * Build a Docker image with real-time output.
 *
 * @param imageName Image name.
 * @param imageTag Image tag.
 * @param dockerfilePath Path to the Dockerfile.
 * @param buildContext Build context path.
 * @returns `true` on success, `false` otherwise.
 */
export async function buildDockerImage(
  imageName: string,
  imageTag = 'latest',
  dockerfilePath = 'Dockerfile',
  buildContext = '.',
): Promise<boolean> {
  const fullImageName = `${imageName}:${imageTag}`;

  console.print(`\n[bold]Building Docker image:[/bold] [cyan]${fullImageName}[/cyan]`);

  const stepPattern = /^Step\s+(\d+)\/(\d+)\s*:\s*(.+)$/;

  try {
    const outputLines: string[] = [];
    const errorLines: string[] = [];

    const result = await runStreamingCommand(
      'docker',
      ['build', '-t', fullImageName, '-f', dockerfilePath, buildContext],
      (rawLine) => {
        const line = rstrip(rawLine);
        outputLines.push(line);

        const match = stepPattern.exec(line);
        if (match) {
          const stepNum = Number(match[1]);
          const totalSteps = Number(match[2]);
          const stepDesc = match[3];
          console.print(
            `  [yellow]鈻禰/yellow] Step ${stepNum}/${totalSteps}: [white]${escapeMarkup(stepDesc)}[/white]`,
          );
        } else if (line.includes('Successfully built') || line.includes('Successfully tagged')) {
          console.print(`  [green]鉁揫/green] ${escapeMarkup(line.trim())}`);
        } else if (line.trim()) {
          const lower = line.toLowerCase();
          if (lower.includes('error')) {
            errorLines.push(line);
            console.print(`  [red]鉁?${escapeMarkup(line)}[/red]`);
          } else if (lower.includes('warning') && lower.includes('warning:')) {
            console.print(`  [yellow]! ${escapeMarkup(line)}[/yellow]`);
          }
        }
      },
    );

    if (result.spawnError !== null) {
      console.print(`[red]Error: Failed to build Docker image: ${result.spawnError.message}[/red]`);
      return false;
    }

    if (result.timedOut) {
      console.print('[red]Error: Docker build timed out[/red]');
      return false;
    }

    if (result.code !== 0) {
      console.print('\n[red]Error building image:[/red]');
      if (errorLines.length > 0) {
        console.print('[dim]Error details:[/dim]');
        for (const line of errorLines.slice(-10)) {
          console.print(`  [red]${escapeMarkup(line)}[/red]`);
        }
      } else {
        console.print('[dim]Last 15 lines of output:[/dim]');
        for (const line of outputLines.slice(-15)) {
          console.print(`  [dim]${escapeMarkup(line)}[/dim]`);
        }
      }
      return false;
    }

    console.print(
      `\n[green]鉁?Done:[/green] Image [cyan]${fullImageName}[/cyan] built successfully`,
    );
    return true;
  } catch (error) {
    console.print(`[red]Error: Failed to build Docker image: ${errorMessage(error)}[/red]`);
    return false;
  }
}

/**
 * Tag a Docker image.
 *
 * @param sourceImage Source image name.
 * @param targetImage Target image name.
 * @returns `true` on success, `false` otherwise.
 */
export async function tagImage(sourceImage: string, targetImage: string): Promise<boolean> {
  console.print(
    `[bold]Tagging image:[/bold] [cyan]${sourceImage}[/cyan] -> [cyan]${targetImage}[/cyan]`,
  );

  try {
    const result = await runCommand('docker', ['tag', sourceImage, targetImage], {
      timeout: 30_000,
    });

    if (result.code !== 0) {
      console.print('[red]Error tagging image:[/red]');
      console.printPlain(result.stderr);
      return false;
    }

    console.print('[green]鉁?Done:[/green] Image tagged successfully');
    return true;
  } catch (error) {
    console.print(`[red]Error: Failed to tag image: ${errorMessage(error)}[/red]`);
    return false;
  }
}

/**
 * Push a Docker image to the registry with real-time output.
 *
 * @param image Image name to push.
 * @returns `true` on success, `false` otherwise.
 */
export async function pushImage(image: string): Promise<boolean> {
  console.print(`\n[bold]Pushing image:[/bold] [cyan]${image}[/cyan]`);

  try {
    const outputLines: string[] = [];
    const errorLines: string[] = [];
    const digestPattern = /digest:\s*(sha256:[a-f0-9]+)/;

    const result = await runStreamingCommand('docker', ['push', image], (rawLine) => {
      const line = rstrip(rawLine);
      outputLines.push(line);

      if (line.includes('Pushed')) {
        console.print(`  [green]鉁揫/green] ${escapeMarkup(line)}`);
      } else if (line.includes('Layer already exists')) {
        console.print('  [dim]鈼媅/dim] Layer exists (skipped)');
      } else if (digestPattern.test(line)) {
        const match = digestPattern.exec(line);
        console.print(`  [green]鉁揫/green] Digest: [cyan]${match?.[1] ?? ''}[/cyan]`);
      } else if (line.trim()) {
        const lower = line.toLowerCase();
        if (lower.includes('error') || lower.includes('denied')) {
          errorLines.push(line);
          console.print(`  [red]鉁?${escapeMarkup(line)}[/red]`);
        }
      }
    });

    if (result.spawnError !== null) {
      console.print(`[red]Error: Failed to push image: ${result.spawnError.message}[/red]`);
      return false;
    }

    if (result.timedOut) {
      console.print('[red]Error: Docker push timed out[/red]');
      return false;
    }

    if (result.code !== 0) {
      console.print('\n[red]Error pushing image:[/red]');
      if (errorLines.length > 0) {
        for (const line of errorLines) {
          console.print(`  [red]${escapeMarkup(line)}[/red]`);
        }
      } else {
        for (const line of outputLines.slice(-10)) {
          console.print(`  [red]${escapeMarkup(line)}[/red]`);
        }
      }
      return false;
    }

    console.print('[green]鉁?Done:[/green] Image pushed successfully');
    return true;
  } catch (error) {
    console.print(`[red]Error: Failed to push image: ${errorMessage(error)}[/red]`);
    return false;
  }
}

/**
 * Log in to a Docker registry.
 *
 * @param registry Registry URL.
 * @param username Username.
 * @param password Password.
 * @returns `true` on success, `false` otherwise.
 */
export async function loginToRegistry(
  registry: string,
  username: string,
  password: string,
): Promise<boolean> {
  console.print(`\n[bold]Logging in to registry:[/bold] [cyan]${registry}[/cyan]`);

  try {
    const result = await runCommand(
      'docker',
      ['login', '-u', username, '-p', password, registry],
      { timeout: 60_000 },
    );

    if (result.code !== 0) {
      console.print('[red]Error logging in:[/red]');
      console.printPlain(result.stderr);
      return false;
    }

    console.print('[green]鉁?Done:[/green] Logged in to registry successfully');
    return true;
  } catch (error) {
    console.print(`[red]Error: Failed to login: ${errorMessage(error)}[/red]`);
    return false;
  }
}

/**
 * Run a Docker container locally.
 *
 * @param imageName Image name.
 * @param imageTag Image tag.
 * @param port Port to expose.
 * @param containerName Container name.
 * @param detach Run in detached mode.
 * @returns `true` on success, `false` otherwise.
 */
export async function runContainer(
  imageName: string,
  imageTag = 'latest',
  port = 8080,
  containerName: string | null = null,
  detach = true,
): Promise<boolean> {
  const fullImageName = `${imageName}:${imageTag}`;

  const name = containerName ?? imageName.replace(/\//g, '-').replace(/:/g, '-');

  console.print(`\n[bold]Running container:[/bold] [cyan]${name}[/cyan]`);

  try {
    const args = ['run', '-p', `${port}:${port}`, '--name', name];
    if (detach) {
      args.push('-d');
    }
    args.push(fullImageName);

    const result = await runCommand('docker', args, { timeout: 60_000 });

    if (result.code !== 0) {
      console.print('[red]Error running container:[/red]');
      console.printPlain(result.stderr);
      return false;
    }

    const containerId = result.stdout.trim();
    console.print(`[green]鉁?Done:[/green] Container [cyan]${name}[/cyan] started`);
    console.print(`[dim]Container ID: ${containerId.slice(0, 12)}[/dim]`);
    console.print(
      `\n[bold]Access your agent at:[/bold] [link]http://localhost:${port}[/link]`,
    );
    return true;
  } catch (error) {
    console.print(`[red]Error: Failed to run container: ${errorMessage(error)}[/red]`);
    return false;
  }
}

/**
 * Generate a Dockerfile from the template.
 *
 * @param baseImage Base Docker image.
 * @param dependencyFile Path to the dependency file (e.g. requirements.txt).
 * @param entrypoint Entrypoint in `module:function` form (e.g. `app:main`).
 * @param port Port to expose.
 * @param outputPath Output path for the Dockerfile.
 * @param region Huawei Cloud region (e.g. `cn-southwest-2`).
 * @returns `true` on success, `false` otherwise.
 */
export function generateDockerfile(
  baseImage = 'node:22-slim',
  dependencyFile: string | null = null,
  entrypoint: string | null = null,
  port = 8080,
  outputPath = 'Dockerfile',
  region: string | null = null,
): boolean {
  console.print(`\n[bold]Generating Dockerfile:[/bold] [cyan]${outputPath}[/cyan]`);

  const content = renderDockerfile(baseImage, dependencyFile, entrypoint, port, 'appuser', 1000, 1000, region);

  const dockerfilePath = resolve(process.cwd(), outputPath);

  try {
    writeFileSync(dockerfilePath, content, 'utf8');
    console.print(`[green]鉁?Done:[/green] Dockerfile generated at [cyan]${dockerfilePath}[/cyan]`);
    return true;
  } catch (error) {
    console.print(`[red]Error: Failed to write Dockerfile: ${errorMessage(error)}[/red]`);
    return false;
  }
}

