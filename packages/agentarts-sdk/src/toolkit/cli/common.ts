/**
 * Common CLI utilities.
 *
 * Ported from `agentarts/toolkit/cli/common.py`, extended with the primitives
 * the commander-based CLI needs:
 *
 * - {@link commandAction} converts a command handler that returns an exit code
 *   (Python `typer.Exit` semantics) into a commander action, recording non-zero
 *   codes on `process.exitCode` so the entry point can decide what to do;
 * - {@link promptAsk} / {@link promptConfirm} / {@link promptChoice} replace
 *   `rich.prompt` with a shared `node:readline` line reader (a single interface
 *   keeps answers buffered on a piped stdin from being lost between questions);
 * - {@link normalizeRuntimeArgv} maps multi-character short flags such as
 *   `-bt` (accepted by Python's typer) onto the long option, because commander
 *   only supports single-character short flags.
 */

import { createInterface } from 'node:readline';
import type { Interface } from 'node:readline';

import { console, echoError, echoInfo, echoSuccess, echoWarning } from '../utils/console.js';

export { console, echoError, echoInfo, echoSuccess, echoWarning };

/** Convert an unknown error to a message string. */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Error carrying an exit code, the counterpart of `typer.Exit(n)`.
 *
 * Command handlers may either return a number or throw this error; both are
 * translated into `process.exitCode` by {@link commandAction}.
 */
export class CliExitError extends Error {
  /** Process exit code (Python `typer.Exit(code)`). */
  readonly exitCode: number;

  constructor(exitCode = 1, message?: string) {
    super(message ?? `Command exited with code ${exitCode}`);
    this.name = 'CliExitError';
    this.exitCode = exitCode;
  }
}

/**
 * Handle an error and exit (Python `_handle_error`).
 *
 * @throws {CliExitError} Always, with exit code 1.
 */
export function _handleError(message: string): never {
  console.print(`[red]Error: ${message}[/red]`);
  throw new CliExitError(1, message);
}

/** Print a success message (Python `_print_success`). */
export function _printSuccess(message: string): void {
  console.print(`[green]✓ ${message}[/green]`);
}

/**
 * Run a command handler and record its exit code.
 *
 * Non-zero return values (and {@link CliExitError}) are written to
 * `process.exitCode`; unexpected errors are reported and mapped to code 1.
 */
export async function runCommand<A extends any[]>(
  handler: (...args: A) => Promise<number> | number,
  ...args: A
): Promise<void> {
  try {
    const code = await handler(...args);
    if (typeof code === 'number' && code !== 0) {
      process.exitCode = code;
    }
  } catch (error) {
    if (error instanceof CliExitError) {
      process.exitCode = error.exitCode;
      return;
    }
    echoError(errorMessage(error));
    process.exitCode = 1;
  } finally {
    // Release the shared prompt interface so an interactive command cannot keep
    // the process alive after it finished.
    closePromptInput();
  }
}

/**
 * Wrap a command handler as a commander action.
 *
 * The handler returns the process exit code (Python `typer.Exit` semantics) or
 * throws; both end up on `process.exitCode` for the top-level `main` to act on.
 */
export function commandAction<A extends any[]>(
  handler: (...args: A) => Promise<number>,
): (...args: A) => Promise<void> {
  return (...args: A): Promise<void> => runCommand(handler, ...args);
}

/**
 * Rewrite Python-style multi-character short flags into long options.
 *
 * Python's typer accepts `-bt` for `--bearer-token`, while commander requires
 * single-character short flags. The CLI entry point calls this on
 * `process.argv` before parsing (idempotent, in-place).
 *
 * @param argv Argument vector to normalize (defaults to `process.argv`).
 * @returns The same array, for convenience.
 */
export function normalizeRuntimeArgv(argv: string[] = process.argv): string[] {
  const rewrites: Readonly<Record<string, string>> = {
    '-bt': '--bearer-token',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const replacement = rewrites[token];
    if (replacement !== undefined) {
      argv[index] = replacement;
      continue;
    }
    const inline = /^(-bt)=(.+)$/.exec(token);
    if (inline) {
      argv[index] = `--bearer-token=${inline[2]}`;
    }
  }

  return argv;
}

// ---------------------------------------------------------------------------
// Interactive prompts (rich.prompt counterpart)
// ---------------------------------------------------------------------------

/**
 * Strip rich-style markup tags from `text`.
 *
 * `rich.prompt.Prompt.ask()` renders markup in its question; readline prints
 * raw text, so the tags are removed before prompting.
 */
export function stripMarkup(text: string): string {
  return String(text).replace(/\\?\[(?:\/)?[a-z][a-z0-9 _=.-]*\]/gi, '');
}

/**
 * Shared readline interface used by the prompts.
 *
 * A single interface is kept for the whole command so answers buffered on a
 * piped stdin are not discarded between questions; {@link closePromptInput}
 * releases it when the command finishes (an open interface keeps the event loop
 * alive).
 */
let promptInterface: Interface | null = null;
let promptIterator: AsyncIterator<string> | null = null;

/** Get (and lazily create) the shared line iterator. */
function getPromptIterator(): AsyncIterator<string> {
  if (promptInterface === null) {
    promptInterface = createInterface({
      input: process.stdin,
      output: process.stdout,
      crlfDelay: Infinity,
    });
    promptIterator = promptInterface[Symbol.asyncIterator]();
  }
  return promptIterator as AsyncIterator<string>;
}

/** Close the shared prompt interface (safe to call when unused). */
export function closePromptInput(): void {
  if (promptInterface !== null) {
    promptInterface.close();
  }
  promptInterface = null;
  promptIterator = null;
}

/** Read the next input line; `null` on EOF. */
async function readLine(): Promise<string | null> {
  const result = await getPromptIterator().next();
  return result.done ? null : String(result.value);
}

/**
 * Ask a question and return the trimmed answer.
 *
 * An empty answer falls back to `defaultValue`, like `rich.prompt.Prompt.ask`.
 */
export async function promptAsk(question: string, defaultValue = ''): Promise<string> {
  return ask(question, defaultValue, true);
}

/** Shared question implementation; `strip` controls rich-markup handling. */
async function ask(question: string, defaultValue: string, strip: boolean): Promise<string> {
  const suffix = defaultValue ? ` (${defaultValue})` : '';
  const text = strip ? stripMarkup(question) : question;
  process.stdout.write(`${text}${suffix}: `);

  const line = await readLine();
  if (line === null) {
    return defaultValue;
  }

  const trimmed = line.trim();
  return trimmed.length > 0 ? trimmed : defaultValue;
}

/**
 * Ask a yes/no question (rich `Confirm.ask`).
 *
 * @param question Question text.
 * @param defaultValue Answer used for an empty response.
 */
export async function promptConfirm(question: string, defaultValue = false): Promise<boolean> {
  const hint = defaultValue ? '[Y/n]' : '[y/N]';
  const answer = (await ask(`${question} ${hint}`, '', false)).trim().toLowerCase();

  if (!answer) {
    return defaultValue;
  }
  if (['y', 'yes', 'true'].includes(answer)) {
    return true;
  }
  if (['n', 'no', 'false'].includes(answer)) {
    return false;
  }
  return defaultValue;
}

/**
 * Ask the user to pick one of `choices` (rich `Prompt.ask(..., choices=...)`).
 *
 * Invalid answers are re-prompted, like rich does.
 */
export async function promptChoice(
  question: string,
  choices: readonly string[],
  defaultValue?: string,
): Promise<string> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const answer = (await promptAsk(question, defaultValue ?? '')).trim();
    if (choices.includes(answer)) {
      return answer;
    }
    if (!answer && defaultValue !== undefined && choices.includes(defaultValue)) {
      return defaultValue;
    }
    echoWarning(`Please select one of: ${choices.join(', ')}`);
  }
  return defaultValue ?? choices[0] ?? '';
}
