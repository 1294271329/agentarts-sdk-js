/**
 * Unit tests for the toolkit CLI entry point.
 *
 * Ported 1:1 from `tests/unit/toolkit/test_main.py`.
 *
 * `CliRunner` → `buildProgram().parseAsync(args, { from: "user" })`; commander's
 * `--version` / `--help` call `process.exit()`, so the program is created with
 * `exitOverride()` and the thrown `CommanderError` carries the exit code. Output
 * is captured through `configureOutput()` (commander's own writer) and through
 * the toolkit console spies (welcome block).
 *
 * `patch("agentarts.toolkit.main.logging.basicConfig")` →
 * `vi.mock("agentarts-sdk/sdk/utils/logging")` with `setupLogging` replaced.
 *
 * Behaviour difference: Python's `_auto_install_completion()` (and typer's
 * `_OrderedHelpGroup`) have no port; `COMMAND_ORDER` + the commander registration
 * order are the counterpart of `_COMMAND_ORDER`, so the assertions below cover
 * the registration order instead of an auto-completion installer.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  COMMAND_ORDER,
  buildProgram,
  cli,
  setupToolkitLogging,
} from 'agentarts-sdk/toolkit/main';
import * as mainModule from 'agentarts-sdk/toolkit/main';
import { console as toolkitConsole } from 'agentarts-sdk/toolkit/utils/console';

const loggingMocks = vi.hoisted(() => ({ setupLogging: vi.fn() }));

vi.mock('agentarts-sdk/sdk/utils/logging', async (importOriginal) => {
  const actual = await importOriginal<typeof import('agentarts-sdk/sdk/utils/logging')>();
  return { ...actual, setupLogging: loggingMocks.setupLogging };
});

let output: string[];

beforeEach(() => {
  output = [];
  vi.spyOn(toolkitConsole, 'print').mockImplementation((message = '') => {
    output.push(String(message));
  });
  vi.spyOn(toolkitConsole, 'printPanel').mockImplementation(() => undefined);
});

/**
 * Build a program whose output is captured and whose `process.exit()` calls are
 * converted into a thrown `CommanderError`.
 */
function buildCapturingProgram() {
  const program = buildProgram();
  program.exitOverride();
  program.configureOutput({
    writeOut: (text: string) => {
      output.push(text);
    },
    writeErr: (text: string) => {
      output.push(text);
    },
  });
  return program;
}

/** Parse `args` and return the exit code commander would have exited with. */
async function parseAndGetExitCode(args: string[]): Promise<number> {
  const program = buildCapturingProgram();
  try {
    await program.parseAsync(args, { from: 'user' });
    return typeof process.exitCode === 'number' ? process.exitCode : 0;
  } catch (error) {
    return (error as { exitCode?: number }).exitCode ?? 1;
  }
}

describe('setupToolkitLogging', () => {
  it('uses the DEBUG level when verbose', () => {
    setupToolkitLogging(true);

    expect(loggingMocks.setupLogging).toHaveBeenCalledTimes(1);
    expect(loggingMocks.setupLogging).toHaveBeenCalledWith('DEBUG');
  });

  it('uses the INFO level when not verbose', () => {
    setupToolkitLogging(false);

    expect(loggingMocks.setupLogging).toHaveBeenCalledTimes(1);
    expect(loggingMocks.setupLogging).toHaveBeenCalledWith('INFO');
  });
});

describe('auto completion', () => {
  it('is not ported (Python `_auto_install_completion` has no counterpart)', () => {
    // Python installs typer's shell completion on first run and touches a marker
    // file under `~/.agentarts`; commander has no equivalent, so the module
    // exposes no such helper.
    expect('_autoInstallCompletion' in mainModule).toBe(false);
  });
});

describe('command order', () => {
  it('registers the visible commands in COMMAND_ORDER order', () => {
    // Counterpart of `_OrderedHelpGroup.list_commands()`: the help listing keeps
    // the order of `_COMMAND_ORDER` (aliases `deploy`/`configure` are hidden).
    const program = buildProgram();
    const visible = program.commands
      .filter((command) => (command as any)._hidden !== true)
      .map((command) => command.name());

    expect(visible).toEqual(COMMAND_ORDER.filter((name) => visible.includes(name)));
    for (const name of ['init', 'gateway', 'destroy']) {
      expect(visible).toContain(name);
    }
  });
});

describe('cli', () => {
  it('prints the version and exits successfully', async () => {
    const exitCode = await parseAndGetExitCode(['--version']);

    expect(exitCode).toBe(0);
    expect(output.join('')).toContain('agentarts version');
  });

  it('prints the welcome block when no subcommand is given', async () => {
    const exitCode = await parseAndGetExitCode([]);

    expect(exitCode).toBe(0);
    expect(output.join('\n')).toContain('AgentArts CLI');
    expect(output.join('\n')).toContain('Usage:');
  });

  it('accepts the verbose flag together with --help', async () => {
    const exitCode = await parseAndGetExitCode(['--verbose', '--help']);

    expect(exitCode).toBe(0);
    expect(output.join('\n')).toContain('AgentArts CLI');
  });

  it('runs the program built from process-style arguments', async () => {
    await cli(['node', 'agentarts']);

    expect(output.join('\n')).toContain('AgentArts CLI');
  });
});
