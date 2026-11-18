/**
 * Unit tests for the Dockerfile rendered by the AgentArts CLI.
 *
 * Ported 1:1 from `tests/unit/toolkit/utils/test_docker_template.py`.
 */

import { describe, it, expect } from 'vitest';

import { renderDockerfile } from 'agentarts-sdk/toolkit/utils/templates/docker/index';

describe('renderDockerfile', () => {
  it('makes /app readable regardless of the build host umask', () => {
    // `COPY . .` carries the build host's umask into the image.
    //
    // On EulerOS (umask 0027) that is 0640/0750, and chown only fixes ownership.
    // The image must therefore widen the mode bits, otherwise any runtime UID
    // other than appuser cannot read /app and the container never starts.
    const dockerfile = renderDockerfile();

    expect(dockerfile).toContain('chmod -R a+rX /app');
    expect(dockerfile.indexOf('COPY . .')).toBeLessThan(dockerfile.indexOf('chmod -R a+rX /app'));
    expect(dockerfile.indexOf('chmod -R a+rX /app')).toBeLessThan(dockerfile.indexOf('USER appuser'));
  });
});
