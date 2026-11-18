/**
 * Shared helpers for the memory installer unit tests.
 *
 * `tests/unit/toolkit/plugins/memory/installer/conftest.py` in the Python suite
 * has no fixtures (it only documents that the package is importable), so the
 * helpers below are the inline replacement for the per-test fixture work the
 * Python tests do through `monkeypatch` and `tmp_path`:
 *
 * - `monkeypatch.setenv("HOME", str(tmp_path))` → {@link stubHome} (plus
 *   `USERPROFILE`, which is what `os.homedir()` reads on Windows);
 * - `monkeypatch.setattr(sys, "platform", ...)` → {@link stubPlatform}
 *   (`process.platform` is a configurable own property; `node:os.platform()`
 *   reads it on every call, so this also drives `_HAS_TTY`, `hermesHome()`,
 *   `getShellRc()` and `writeShellRc()`);
 * - `capsys.readouterr().out` → {@link captureStdout} (the whole toolkit output
 *   layer writes through `process.stdout`, including `echo_*` and every
 *   `Console` instance);
 * - `subprocess.run(...)` fakes → {@link fakeChild} for a mocked `spawn()`.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { vi } from 'vitest';

/** The platform the test process started with (see {@link restorePlatform}). */
const ORIGINAL_PLATFORM: NodeJS.Platform = process.platform;

/** The original `process.stdin` property descriptor (see {@link restoreStdin}). */
const ORIGINAL_STDIN = Object.getOwnPropertyDescriptor(process, 'stdin')!;

/**
 * Stub `process.platform` (Python `monkeypatch.setattr(sys, "platform", ...)`).
 *
 * Module-level constants (`_HAS_TTY` in `utils.ts`) keep the value they captured
 * at import time, exactly like the Python module constants do.
 */
export function stubPlatform(value: NodeJS.Platform | string): void {
  Object.defineProperty(process, 'platform', {
    value,
    configurable: true,
    enumerable: true,
    writable: false,
  });
}

/** Restore the real `process.platform`. */
export function restorePlatform(): void {
  Object.defineProperty(process, 'platform', {
    value: ORIGINAL_PLATFORM,
    configurable: true,
    enumerable: true,
    writable: false,
  });
}

/** Point `os.homedir()` at `home` on every platform. */
export function stubHome(home: string): void {
  vi.stubEnv('HOME', home);
  vi.stubEnv('USERPROFILE', home);
}

/** Replace `process.stdin` (the interactive prompt stdin). */
export function stubStdin(stream: unknown): void {
  Object.defineProperty(process, 'stdin', {
    value: stream,
    configurable: true,
    enumerable: true,
    writable: false,
  });
}

/** Restore the real `process.stdin`. */
export function restoreStdin(): void {
  Object.defineProperty(process, 'stdin', ORIGINAL_STDIN);
}

/** Create a temporary directory (`pytest`'s `tmp_path`). */
export function createTempDir(prefix = 'agentarts-installer-'): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

/** Remove a directory created by {@link createTempDir}. */
export function removeTempDir(directory: string): void {
  rmSync(directory, { recursive: true, force: true });
}

/** Captured stdout plus the concatenated text. */
export interface StdoutCapture {
  /** Every chunk written to `process.stdout`. */
  readonly lines: string[];
  /** All captured output joined into one string. */
  text(): string;
}

/**
 * Capture everything written to `process.stdout` (`capsys.readouterr().out`).
 *
 * Rich markup is stripped by the toolkit console when stdout is not a TTY, so
 * assertions can look for the plain message text.
 */
export function captureStdout(): StdoutCapture {
  const lines: string[] = [];
  vi.spyOn(process.stdout, 'write').mockImplementation(((
    chunk: string | Uint8Array,
  ): boolean => {
    lines.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
    return true;
  }) as unknown as typeof process.stdout.write);
  return { lines, text: () => lines.join('') };
}

/** Minimal `ChildProcess` stand-in for a mocked `spawn()`. */
export interface FakeChild {
  on(event: string, handler: (...args: any[]) => void): FakeChild;
}

/**
 * Build a fake child process that emits `error` or `close` asynchronously.
 *
 * `subprocess.run(cmd, check=False)` returns a completed process with a
 * `returncode`; the Node counterpart settles through the `close` / `error`
 * events, which must fire *after* the listeners are attached.
 */
export function fakeChild(exitCode = 0, error?: Error): FakeChild {
  const handlers: Record<string, Array<(...args: any[]) => void>> = {};
  let scheduled = false;

  const child: FakeChild = {
    on(event: string, handler: (...args: any[]) => void): FakeChild {
      handlers[event] = handlers[event] ?? [];
      handlers[event]!.push(handler);
      if (!scheduled && (event === 'error' || event === 'close')) {
        scheduled = true;
        setImmediate(() => {
          if (error) {
            for (const registered of handlers['error'] ?? []) {
              registered(error);
            }
            return;
          }
          for (const registered of handlers['close'] ?? []) {
            registered(exitCode);
          }
        });
      }
      return child;
    },
  };

  return child;
}
