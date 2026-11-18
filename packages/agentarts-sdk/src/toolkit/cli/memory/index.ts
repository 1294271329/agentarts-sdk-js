/**
 * Memory CLI module.
 *
 * Ported from `agentarts/toolkit/cli/memory/__init__.py`.
 */

import { buildMemoryCommand } from './commands.js';

export * from './commands.js';

/** The `agentarts memory` command tree (Python `memory_app`). */
export const memoryApp = buildMemoryCommand();
