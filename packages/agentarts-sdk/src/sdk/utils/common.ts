/**
 * Common utility functions.
 */

const RANDOM_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';

/**
 * Generate a random string of the specified length.
 *
 * @param length Length of the random string, default 4, must be between 4 and 64.
 * @throws {Error} If length is less than 4 or greater than 64.
 */
export function generateRandomString(length = 4): string {
  if (length < 4 || length > 64) {
    throw new Error(`Length must be between 4 and 64, got ${length}`);
  }
  let result = '';
  for (let i = 0; i < length; i += 1) {
    result += RANDOM_CHARS[Math.floor(Math.random() * RANDOM_CHARS.length)];
  }
  return result;
}
