/**
 * Unit tests for the runtime init operation.
 *
 * Ported 1:1 from `tests/unit/toolkit/operations/runtime/test_init.py`.
 *
 * Behaviour differences of the Node.js port (Java and Google ADK support were
 * dropped, see `toolkit/operations/runtime/init.ts`):
 * - `TEMPLATES` has no `google-adk` / `java-*` entry and `getTemplateEnvVars()`
 *   returns `[]` for `google-adk`;
 * - `createDockerfile()` always renders the Python image (no Temurin template).
 * The assertions below check the ported behaviour and say so where they differ.
 *
 * `patch("platform.machine")` 鈫?`vi.mock("node:os")` with `machine()` stubbed
 * (`detectPlatform()` reads `os.machine()`); `tmp_path` 鈫?`mkdtemp()`.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  TEMPLATES,
  createAgentFile,
  createConfigFile,
  createDockerfile,
  createRequirementsFile,
  detectPlatform,
  getTemplateEnvVars,
  initProject,
} from 'agentarts-sdk/toolkit/operations/runtime/init';

const osMocks = vi.hoisted(() => ({ machine: 'x86_64' }));

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, machine: () => osMocks.machine };
});

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'agentarts-init-'));
  osMocks.machine = 'x86_64';
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('detectPlatform', () => {
  it('returns a valid platform string', () => {
    expect(['linux/amd64', 'linux/arm64']).toContain(detectPlatform());
  });

  it('returns linux/amd64 for x86_64', () => {
    osMocks.machine = 'x86_64';
    expect(detectPlatform()).toBe('linux/amd64');
  });

  it('returns linux/arm64 for aarch64', () => {
    osMocks.machine = 'aarch64';
    expect(detectPlatform()).toBe('linux/arm64');
  });

  it('returns linux/amd64 for amd64', () => {
    osMocks.machine = 'amd64';
    expect(detectPlatform()).toBe('linux/amd64');
  });

  it('defaults an unrecognised architecture to linux/arm64', () => {
    // The AgentArts backend is predominantly arm.
    osMocks.machine = 'riscv64';
    expect(detectPlatform()).toBe('linux/arm64');
  });
});

describe('getTemplateEnvVars', () => {
  it('reports no environment variables for the basic template', () => {
    expect(getTemplateEnvVars('basic')).toEqual([]);
  });

  it('reports the environment variables of the langgraph template', () => {
    const result = getTemplateEnvVars('langgraph');

    expect(result).toHaveLength(3);
    const keys = result.map((variable) => variable.key);
    expect(keys).toContain('OPENAI_API_KEY');
    expect(keys).toContain('OPENAI_MODEL_NAME');
    expect(keys).toContain('OPENAI_BASE_URL');
  });

  it('reports the environment variables of the langchain template', () => {
    expect(getTemplateEnvVars('langchain')).toHaveLength(3);
  });

  it('reports no environment variables for the google-adk template (not ported)', () => {
    // Python: the google-adk template declares GOOGLE_API_KEY and
    // GOOGLE_MODEL_NAME. The template is not bundled with the Node.js port, so
    // the list is empty like `basic`.
    expect(getTemplateEnvVars('google-adk')).toEqual([]);
  });

  it('returns an empty list for an unknown template', () => {
    expect(getTemplateEnvVars('unknown')).toEqual([]);
  });
});

describe('createDockerfile', () => {
  it('writes the region environment variable', () => {
    createDockerfile(tmpDir, 'basic', 'test-agent', 'cn-north-4');

    const dockerfilePath = join(tmpDir, 'Dockerfile');
    expect(existsSync(dockerfilePath)).toBe(true);
    expect(readFileSync(dockerfilePath, 'utf8')).toContain('HUAWEICLOUD_SDK_REGION=cn-north-4');
  });

  it('defaults the region to cn-southwest-2', () => {
    createDockerfile(tmpDir, 'basic', 'test-agent');

    expect(readFileSync(join(tmpDir, 'Dockerfile'), 'utf8')).toContain(
      'HUAWEICLOUD_SDK_REGION=cn-southwest-2',
    );
  });

  it('contains all required sections', () => {
    createDockerfile(tmpDir, 'basic', 'test-agent', 'cn-north-4');

    const content = readFileSync(join(tmpDir, 'Dockerfile'), 'utf8');
    expect(content).toContain('FROM node:22-slim');
    expect(content).toContain('WORKDIR /app');
    expect(content).toContain('EXPOSE 8080');
    expect(content).toContain('agent');
  });

  it('always renders the node image for java templates (java support dropped)', () => {
    // Python renders `eclipse-temurin:17-jre` plus `COPY target/my-agent.jar
    // app.jar` for `java-basic`; the Java renderer was not ported, so the
    // Node.js image (with the entrypoint) is used for every template.
    createDockerfile(tmpDir, 'java-basic', 'my-agent', 'cn-north-4');

    const content = readFileSync(join(tmpDir, 'Dockerfile'), 'utf8');
    expect(content).toContain('FROM node:22-slim');
    expect(content).toContain('HUAWEICLOUD_SDK_REGION=cn-north-4');
    expect(content).toContain('CMD [');
  });
});

describe('createConfigFile', () => {
  it('writes the configuration file', () => {
    createConfigFile(tmpDir, 'test-agent', 'basic', {
      region: 'cn-north-4',
      swrOrg: 'test-org',
      swrRepo: 'test-repo',
    });

    const configPath = join(tmpDir, '.agentarts_config.yaml');
    expect(existsSync(configPath)).toBe(true);

    const content = readFileSync(configPath, 'utf8');
    expect(content).toContain('test-agent');
    expect(content).toContain('cn-north-4');
    expect(content).toContain('test-org');
    expect(content).toContain('test-repo');
  });

  it('uses agent_{name} as the default SWR repository', () => {
    createConfigFile(tmpDir, 'myagent', 'basic');

    expect(readFileSync(join(tmpDir, '.agentarts_config.yaml'), 'utf8')).toContain(
      'agent_myagent',
    );
  });

  it('includes the region', () => {
    createConfigFile(tmpDir, 'test-agent', 'basic', { region: 'cn-east-3' });

    expect(readFileSync(join(tmpDir, '.agentarts_config.yaml'), 'utf8')).toContain('cn-east-3');
  });

  it('includes the storage_config / sfs_turbo block', () => {
    createConfigFile(tmpDir, 'test-agent', 'basic');

    const content = readFileSync(join(tmpDir, '.agentarts_config.yaml'), 'utf8');
    expect(content).toContain('storage_config:');
    expect(content).toContain('sfs_turbo:');
    expect(content).toContain('sfs_turbo_id:');
    expect(content).toContain('mount_path:');
  });

  it('includes the lifecycle_config block without overriding service defaults', () => {
    createConfigFile(tmpDir, 'test-agent', 'basic');

    const content = readFileSync(join(tmpDir, '.agentarts_config.yaml'), 'utf8');
    expect(content).toContain('lifecycle_config:');
    expect(content).toContain('idle_session_timeout_sec: null');
    expect(content).toContain('max_alive_time_sec: null');
  });
});

describe('createAgentFile', () => {
  it('writes agent.ts', () => {
    createAgentFile(tmpDir, 'basic', 'test-agent');

    expect(existsSync(join(tmpDir, 'agent.ts'))).toBe(true);
  });

  it('falls back to the basic template for an unknown template', () => {
    createAgentFile(tmpDir, 'unknown-template', 'test-agent');

    expect(existsSync(join(tmpDir, 'agent.ts'))).toBe(true);
  });
});

describe('createPackageJsonFile', () => {
  it('writes package.json', () => {
    createRequirementsFile(tmpDir, 'basic');

    expect(existsSync(join(tmpDir, 'package.json'))).toBe(true);
  });

  it('requires the agentarts-sdk package', () => {
    createRequirementsFile(tmpDir, 'basic');

    expect(readFileSync(join(tmpDir, 'package.json'), 'utf8')).toContain('agentarts-sdk');
  });
});

describe('initProject', () => {
  it('fails when the target directory already exists', async () => {
    mkdirSync(join(tmpDir, 'existing-project'));

    const result = await initProject({
      template: 'basic',
      name: 'existing-project',
      path: tmpDir,
    });

    expect(result).toBe(false);
  });

  it('creates the complete project structure', async () => {
    const result = await initProject({
      template: 'basic',
      name: 'test-project',
      path: tmpDir,
      region: 'cn-north-4',
    });

    expect(result).toBe(true);

    const projectPath = join(tmpDir, 'test-project');
    expect(existsSync(projectPath)).toBe(true);
    expect(existsSync(join(projectPath, 'agent.ts'))).toBe(true);
    expect(existsSync(join(projectPath, 'package.json'))).toBe(true);
    expect(existsSync(join(projectPath, '.agentarts_config.yaml'))).toBe(true);
    expect(existsSync(join(projectPath, 'Dockerfile'))).toBe(true);
  });

  it('accepts custom SWR settings', async () => {
    const result = await initProject({
      template: 'basic',
      name: 'test-project',
      path: tmpDir,
      swrOrg: 'custom-org',
      swrRepo: 'custom-repo',
    });

    expect(result).toBe(true);

    const configContent = readFileSync(
      join(tmpDir, 'test-project', '.agentarts_config.yaml'),
      'utf8',
    );
    expect(configContent).toContain('custom-org');
    expect(configContent).toContain('custom-repo');
  });
});

describe('TEMPLATES', () => {
  it('contains the ported template types', () => {
    expect('basic' in TEMPLATES).toBe(true);
    expect('langchain' in TEMPLATES).toBe(true);
    expect('langgraph' in TEMPLATES).toBe(true);
    // Python also has `google-adk`; it is not bundled with the Node.js port.
    expect('google-adk' in TEMPLATES).toBe(false);
  });
});

