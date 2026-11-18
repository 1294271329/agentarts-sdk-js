/**
 * Global test setup.
 *
 * The Python suite configures logging via `agentarts.sdk.utils.logging`;
 * the TypeScript port keeps logging silent by default during tests unless
 * AGENTARTS_LOG_LEVEL is explicitly set.
 */
if (!process.env.AGENTARTS_LOG_LEVEL) {
  process.env.AGENTARTS_LOG_LEVEL = 'ERROR';
}

// Avoid accidental real cloud calls from unit tests.
if (!process.env.AGENTARTS_TEST_OFFLINE) {
  process.env.AGENTARTS_TEST_OFFLINE = '1';
}
