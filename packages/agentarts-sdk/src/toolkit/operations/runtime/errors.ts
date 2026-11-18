/**
 * Error types shared by the runtime operations.
 *
 * The Python operations raise `ValueError` for validation failures and let the
 * CLI translate them into `Validation error: …` messages. JavaScript has no
 * `ValueError`, so this module provides the counterpart class.
 */

/**
 * A validation failure (Python `ValueError`).
 *
 * The CLI catches this type to print `Validation error: <message>` while other
 * failures are reported as operation errors.
 */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}
