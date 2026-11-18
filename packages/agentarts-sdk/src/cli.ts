#!/usr/bin/env node
/**
 * `agentarts` bin entry point.
 *
 * Mirrors the Python console script (`agentarts = "agentarts.toolkit.main:cli"`):
 * the command tree lives in `toolkit/main.ts`, this file only starts it.
 */

import { cli } from './toolkit/main.js';

await cli();
