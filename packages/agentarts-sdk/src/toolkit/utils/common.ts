/**
 * Common utility functions for the CLI.
 *
 * Ported from `agentarts/toolkit/utils/common.py`. The `echo_*` helpers and the
 * shared `console` instance live in `console.ts` (the toolkit output layer) and
 * are re-exported here so imports keep matching the Python module.
 */

export {
  Console,
  console,
  echoError,
  echoInfo,
  echoKeyValue,
  echoStep,
  echoSuccess,
  echoWarning,
  escapeMarkup,
  printPanel,
  printTable,
  supportsColor,
  visibleLength,
} from './console.js';
export type { ConsoleOptions, PanelOptions, TableCell, TableRow } from './console.js';

/** Agent name pattern: starts with a letter, ends with a letter or digit. */
export const AGENT_NAME_PATTERN = /^[a-z][a-z0-9-]*[a-z0-9]$/;

/** Minimum agent name length. */
export const AGENT_NAME_MIN_LENGTH = 2;

/** Maximum agent name length. */
export const AGENT_NAME_MAX_LENGTH = 48;

/**
 * Validate agent name format.
 *
 * Rules:
 * - must start with a lowercase letter;
 * - must end with a lowercase letter or digit;
 * - may contain lowercase letters, digits and hyphens;
 * - length must be between 2 and 48 characters.
 *
 * @param name Agent name to validate.
 * @returns Tuple of `[isValid, errorMessage]`; the message is empty when valid.
 */
export function validateAgentName(name: string): [boolean, string] {
  if (!name) {
    return [false, 'Agent name is required'];
  }

  if (name.length < AGENT_NAME_MIN_LENGTH) {
    return [
      false,
      `Agent name must be at least ${AGENT_NAME_MIN_LENGTH} characters (got ${name.length})`,
    ];
  }

  if (name.length > AGENT_NAME_MAX_LENGTH) {
    return [
      false,
      `Agent name must be at most ${AGENT_NAME_MAX_LENGTH} characters (got ${name.length})`,
    ];
  }

  if (!AGENT_NAME_PATTERN.test(name)) {
    return [
      false,
      'Agent name must start with lowercase letter, ' +
        'end with lowercase letter or digit, ' +
        'and contain only lowercase letters, digits, and hyphens',
    ];
  }

  return [true, ''];
}
