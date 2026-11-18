/**
 * Unit tests for the runtime config operation.
 *
 * Ported 1:1 from `tests/unit/toolkit/operations/runtime/test_config.py`.
 *
 * `patch("platform.machine")` → `vi.mock("node:os")` with `machine()` stubbed
 * (`detectPlatform()` / `detectArch()` read `os.machine()`);
 * `monkeypatch.chdir(tmp_path)` → `process.cwd()` stubbed to a `mkdtemp()`
 * directory. `pydantic.ValidationError` → the port throws a plain `Error` whose
 * message carries the same constraint text.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { MockInstance } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  CONFIG_FILE_NAME,
  addAgent,
  detectDependencyFile,
  detectPlatform,
  getAgent,
  getConfigFilePath,
  getConfigValue,
  listAgents,
  loadConfig,
  removeAgent,
  saveConfig,
  setConfigValue,
  setDefaultAgent,
} from 'agentarts-sdk/toolkit/operations/runtime/config';
import { createConfigFile } from 'agentarts-sdk/toolkit/operations/runtime/init';
import {
  AgentArtsConfig,
  AgentArtsConfigList,
  AgentArtsRuntimeConfig,
  ArchType,
  ArtifactSourceConfig,
  AuthConfig,
  BaseConfig,
  CustomJWTAuthConfig,
  InboundIdentityConfig,
  LifecycleConfig,
  SessionStorageConfig,
  SfsTurboConfig,
  StorageConfig,
  detectArch,
} from 'agentarts-sdk/toolkit/utils/runtime/config';

const osMocks = vi.hoisted(() => ({ machine: 'x86_64' }));

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, machine: () => osMocks.machine };
});

const SFS_ID = '12345678-1234-1234-1234-123456789012';

const AGENT_CONFIG = `
default_agent: test-agent
agents:
  test-agent:
    base:
      name: test-agent
`;

let tmpDir: string;
let cwdSpy: MockInstance<() => string>;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'agentarts-config-'));
  // Python `monkeypatch.chdir(tmp_path)`: the operation resolves the config file
  // through `process.cwd()`, which is stubbed instead of changing the real
  // working directory (the vitest threads pool shares one process).
  cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
  osMocks.machine = 'x86_64';
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('detectPlatform', () => {
  it('returns a valid platform string', () => {
    expect(['linux/amd64', 'linux/arm64']).toContain(detectPlatform());
  });

  it('defaults an unrecognised architecture to linux/arm64', () => {
    // The AgentArts backend is predominantly arm.
    osMocks.machine = 'riscv64';
    expect(detectPlatform()).toBe('linux/arm64');
  });
});

describe('detectArch', () => {
  it('returns a valid ArchType', () => {
    expect([ArchType.X86_64, ArchType.ARM64]).toContain(detectArch());
  });

  it('detects arm64 for an arm64 machine', () => {
    osMocks.machine = 'arm64';
    expect(detectArch()).toBe(ArchType.ARM64);
  });

  it('detects arm64 for an aarch64 machine', () => {
    osMocks.machine = 'aarch64';
    expect(detectArch()).toBe(ArchType.ARM64);
  });

  it('detects x86_64 for an x86_64 machine', () => {
    osMocks.machine = 'x86_64';
    expect(detectArch()).toBe(ArchType.X86_64);
  });

  it('detects x86_64 for an uppercase AMD64 machine', () => {
    osMocks.machine = 'AMD64';
    expect(detectArch()).toBe(ArchType.X86_64);
  });

  it('defaults an unrecognised architecture to arm64', () => {
    osMocks.machine = 'riscv64';
    expect(detectArch()).toBe(ArchType.ARM64);
  });
});

describe('detectDependencyFile', () => {
  it('detects package.json when it exists', () => {
    writeFileSync(join(tmpDir, 'package.json'), '{"name":"demo"}');

    expect(detectDependencyFile()).toBe('package.json');
  });

  it('defaults to package.json when no manifest exists', () => {
    // Node.js projects always use package.json; the Python implementation
    // sniffed requirements.txt / pyproject.toml / pom.xml.
    expect(detectDependencyFile()).toBe('package.json');
  });
});

describe('getConfigFilePath', () => {
  it('returns the config file path in the current directory', () => {
    expect(getConfigFilePath()).toBe(join(tmpDir, CONFIG_FILE_NAME));
  });
});

describe('loadConfig', () => {
  it('loads an existing configuration file', () => {
    writeFileSync(join(tmpDir, CONFIG_FILE_NAME), AGENT_CONFIG);

    const config = loadConfig();

    expect(config.defaultAgent).toBe('test-agent');
    expect('test-agent' in config.agents).toBe(true);
  });

  it('returns an empty configuration when the file does not exist', () => {
    const config = loadConfig();

    expect(config.defaultAgent).toBeNull();
    expect(config.agents).toEqual({});
  });
});

describe('saveConfig', () => {
  it('saves the configuration to file', () => {
    const config = new AgentArtsConfigList({
      defaultAgent: 'test-agent',
      agents: {
        'test-agent': new AgentArtsConfig({ base: new BaseConfig({ name: 'test-agent' }) }),
      },
    });

    const result = saveConfig(config);

    expect(result).toBe(true);
    expect(readFileSync(join(tmpDir, CONFIG_FILE_NAME), 'utf8')).toContain('test-agent');
  });

  it('creates the configuration file when it does not exist', () => {
    saveConfig(new AgentArtsConfigList());

    expect(readFileSync(join(tmpDir, CONFIG_FILE_NAME), 'utf8')).toContain('default_agent');
  });
});

describe('addAgent', () => {
  it('adds a new agent', async () => {
    const result = await addAgent('new-agent', 'agent:app', { region: 'cn-north-4' });

    expect(result).toBe(true);
    expect('new-agent' in loadConfig().agents).toBe(true);
  });

  it('adds an agent with SWR configuration', async () => {
    const result = await addAgent('test-agent', 'agent:app', {
      swrOrganization: 'test-org',
      swrRepository: 'test-repo',
    });

    expect(result).toBe(true);
    const agent = loadConfig().getAgent('test-agent')!;
    expect(agent.swrConfig.organization).toBe('test-org');
    expect(agent.swrConfig.repository).toBe('test-repo');
  });

  it('includes the storage_config block in the generated YAML', async () => {
    const result = await addAgent('test-agent', 'agent:app', { region: 'cn-north-4' });

    expect(result).toBe(true);
    const content = readFileSync(join(tmpDir, CONFIG_FILE_NAME), 'utf8');
    expect(content).toContain('storage_config:');
    expect(content).toContain('sfs_turbo:');
    expect(content).toContain('sfs_turbo_id:');
    expect(content).toContain('mount_path:');
  });

  it('leaves the SWR repository unset by default', async () => {
    // Python keeps the computed `agent_{name}` prefix out of the stored value.
    await addAgent('myagent', 'agent:app');

    const agent = loadConfig().getAgent('myagent')!;
    expect(agent.swrConfig.repository).toBeNull();
  });

  it('sets the first agent as default', async () => {
    await addAgent('first-agent', 'agent:app');

    expect(loadConfig().defaultAgent).toBe('first-agent');
  });

  it('updates an existing agent', async () => {
    await addAgent('test-agent', 'agent:app', { region: 'cn-north-4' });
    await addAgent('test-agent', 'agent:new_app', { region: 'cn-southwest-2' });

    const agent = loadConfig().getAgent('test-agent')!;
    expect(agent.base.entrypoint).toBe('agent:new_app');
  });

  it('sets the arch from an arm64 environment', async () => {
    osMocks.machine = 'arm64';

    await addAgent('test-agent', 'agent:app');

    const agent = loadConfig().getAgent('test-agent')!;
    expect(agent.base.arch).toBe(ArchType.ARM64);
  });

  it('sets the arch from an x86_64 environment', async () => {
    osMocks.machine = 'x86_64';

    await addAgent('test-agent', 'agent:app');

    const agent = loadConfig().getAgent('test-agent')!;
    expect(agent.base.arch).toBe(ArchType.X86_64);
  });

  it('defaults arch and platform to arm when they are omitted', async () => {
    // The AgentArts backend is predominantly arm, so the field defaults (not the
    // machine detection) prefer arm over x86.
    writeFileSync(
      join(tmpDir, CONFIG_FILE_NAME),
      'default_agent: test-agent\n' +
        'agents:\n' +
        '  test-agent:\n' +
        '    base:\n' +
        '      name: test-agent\n' +
        '      region: cn-southwest-2\n',
    );

    const agent = loadConfig().getAgent('test-agent')!;
    expect(agent.runtime.arch).toBe(ArchType.ARM64);
    expect(agent.base.platform).toBe('linux/arm64');
  });
});

describe('removeAgent', () => {
  it('removes an existing agent', async () => {
    await addAgent('to-remove', 'agent:app');

    const result = removeAgent('to-remove');

    expect(result).toBe(true);
    expect('to-remove' in loadConfig().agents).toBe(false);
  });

  it('returns false for a nonexistent agent', () => {
    expect(removeAgent('nonexistent')).toBe(false);
  });
});

describe('setDefaultAgent', () => {
  it('sets the default agent', async () => {
    await addAgent('agent1', 'agent:app');
    await addAgent('agent2', 'agent:app');

    const result = setDefaultAgent('agent2');

    expect(result).toBe(true);
    expect(loadConfig().defaultAgent).toBe('agent2');
  });

  it('returns false for a nonexistent agent', () => {
    expect(setDefaultAgent('nonexistent')).toBe(false);
  });
});

describe('getAgent', () => {
  it('gets an agent by name', async () => {
    await addAgent('test-agent', 'agent:app');

    const agent = getAgent('test-agent');

    expect(agent).not.toBeNull();
    expect(agent!.base.name).toBe('test-agent');
  });

  it('gets the default agent when the name is omitted', async () => {
    await addAgent('default-agent', 'agent:app');
    setDefaultAgent('default-agent');

    const agent = getAgent();

    expect(agent).not.toBeNull();
    expect(agent!.base.name).toBe('default-agent');
  });
});

describe('setConfigValue', () => {
  it('sets base.region', async () => {
    await addAgent('test-agent', 'agent:app');

    const result = setConfigValue('base.region', 'cn-east-3', 'test-agent');

    expect(result).toBe(true);
    expect(getAgent('test-agent')!.base.region).toBe('cn-east-3');
  });

  it('sets swr_config.organization', async () => {
    await addAgent('test-agent', 'agent:app');

    const result = setConfigValue('swr_config.organization', 'new-org', 'test-agent');

    expect(result).toBe(true);
    expect(getAgent('test-agent')!.swrConfig.organization).toBe('new-org');
  });

  it('renames the agent via base.name', async () => {
    await addAgent('old-name', 'agent:app');
    setDefaultAgent('old-name');

    const result = setConfigValue('base.name', 'new-name', 'old-name');

    expect(result).toBe(true);
    const config = loadConfig();
    expect('new-name' in config.agents).toBe(true);
    expect('old-name' in config.agents).toBe(false);
    expect(config.defaultAgent).toBe('new-name');
  });
});

describe('getConfigValue', () => {
  it('gets base.region', async () => {
    await addAgent('test-agent', 'agent:app', { region: 'cn-north-4' });

    expect(getConfigValue('base.region', 'test-agent')).toBe(true);
  });

  it('returns false for a nonexistent key', async () => {
    await addAgent('test-agent', 'agent:app');

    expect(getConfigValue('nonexistent.key', 'test-agent')).toBe(false);
  });
});

describe('listAgents', () => {
  it('lists all configured agents', async () => {
    await addAgent('agent1', 'agent:app');
    await addAgent('agent2', 'agent:app');

    const agents = listAgents();

    expect(agents).toContain('agent1');
    expect(agents).toContain('agent2');
  });
});

describe('CustomJWTAuthConfig.isEmpty', () => {
  it('is empty when every field is default', () => {
    expect(new CustomJWTAuthConfig().isEmpty()).toBe(true);
  });

  it('is not empty when discoveryUrl is set', () => {
    expect(new CustomJWTAuthConfig({ discoveryUrl: 'https://example.com' }).isEmpty()).toBe(false);
  });

  it('is not empty when allowedAudience is set', () => {
    expect(new CustomJWTAuthConfig({ allowedAudience: ['audience1'] }).isEmpty()).toBe(false);
  });
});

describe('AuthConfig.isEmpty', () => {
  it('is empty when every field is default', () => {
    expect(new AuthConfig().isEmpty()).toBe(true);
  });

  it('is not empty when customJwt has values', () => {
    const config = new AuthConfig({
      customJwt: new CustomJWTAuthConfig({ discoveryUrl: 'https://example.com' }),
    });
    expect(config.isEmpty()).toBe(false);
  });
});

describe('InboundIdentityConfig.toDict', () => {
  it('excludes an empty authorizer configuration', () => {
    const config = new InboundIdentityConfig({
      authorizerType: 'IAM',
      authorizerConfiguration: new AuthConfig(),
    });

    const result = config.toDict();

    expect(result['authorizer_type']).toBe('IAM');
    expect('authorizer_configuration' in result).toBe(false);
  });

  it('includes authorizer configuration when it is not empty', () => {
    const config = new InboundIdentityConfig({
      authorizerType: 'CUSTOM_JWT',
      authorizerConfiguration: new AuthConfig({
        customJwt: new CustomJWTAuthConfig({ discoveryUrl: 'https://example.com' }),
      }),
    });

    expect('authorizer_configuration' in config.toDict()).toBe(true);
  });
});

describe('StorageConfig', () => {
  it('excludes null fields from the SfsTurboConfig dictionary', () => {
    const config = new SfsTurboConfig({ sfsTurboId: SFS_ID, mountPath: '/data' });

    expect(config.toDict()).toEqual({ sfs_turbo_id: SFS_ID, mount_path: '/data' });
  });

  it('serializes an all-default SfsTurboConfig to an empty dictionary', () => {
    expect(new SfsTurboConfig().toDict()).toEqual({});
  });

  it('serializes sfs_turbo as a list', () => {
    const config = new StorageConfig({
      sfsTurbo: new SfsTurboConfig({
        sfsTurboId: SFS_ID,
        sfsPath: '/share/sub',
        mountPath: '/data',
        readOnly: true,
      }),
    });

    expect(config.toDict()).toEqual({
      sfs_turbo: [
        {
          sfs_turbo_id: SFS_ID,
          sfs_path: '/share/sub',
          mount_path: '/data',
          read_only: true,
        },
      ],
    });
  });

  it('serializes a default StorageConfig to an empty dictionary', () => {
    expect(new StorageConfig().toDict()).toEqual({});
  });

  it('serializes session storage only', () => {
    const config = new StorageConfig({
      sessionStorage: new SessionStorageConfig({ mountPath: '/home/user/sessions' }),
    });

    expect(config.toDict()).toEqual({ session_storage: { mount_path: '/home/user/sessions' } });
  });

  it('serializes both fields', () => {
    const config = new StorageConfig({
      sfsTurbo: new SfsTurboConfig({ sfsTurboId: SFS_ID, mountPath: '/data' }),
      sessionStorage: new SessionStorageConfig({ mountPath: '/home/user/sessions' }),
    });

    expect(config.toDict()).toEqual({
      sfs_turbo: [{ sfs_turbo_id: SFS_ID, mount_path: '/data' }],
      session_storage: { mount_path: '/home/user/sessions' },
    });
  });

  it('rejects a non-UUID sfs_turbo_id', () => {
    expect(() => new SfsTurboConfig({ sfsTurboId: 'not-a-uuid', mountPath: '/data' })).toThrow();
  });

  it('exposes a storage_config field on the runtime config', () => {
    const runtime = new AgentArtsRuntimeConfig();

    expect(runtime.storageConfig).not.toBeNull();
    expect(runtime.storageConfig!.sfsTurbo).not.toBeNull();
    expect(runtime.storageConfig!.sfsTurbo!.sfsTurboId).toBeNull();
    expect(runtime.storageConfig!.sfsTurbo!.mountPath).toBeNull();
    expect(runtime.storageConfig!.sfsTurbo!.readOnly).toBeNull();
  });
});

describe('LifecycleConfig', () => {
  it('serializes a default config to an empty dictionary', () => {
    expect(new LifecycleConfig().toDict()).toEqual({});
  });

  it('excludes null fields', () => {
    const config = new LifecycleConfig({ idleSessionTimeoutSec: 900 });
    expect(config.toDict()).toEqual({ idle_session_timeout_sec: 900 });
  });

  it('includes both limits', () => {
    const config = new LifecycleConfig({
      idleSessionTimeoutSec: 600,
      maxAliveTimeSec: 86400,
    });
    expect(config.toDict()).toEqual({
      idle_session_timeout_sec: 600,
      max_alive_time_sec: 86400,
    });
  });

  it('validates the limits', () => {
    expect(() => new LifecycleConfig({ idleSessionTimeoutSec: 59 })).toThrow();
    expect(() => new LifecycleConfig({ idleSessionTimeoutSec: 604801 })).toThrow();
    expect(() => new LifecycleConfig({ maxAliveTimeSec: 59 })).toThrow();
    expect(() => new LifecycleConfig({ maxAliveTimeSec: 604801 })).toThrow();
  });

  it('exposes a typed lifecycle_config on the runtime config', () => {
    const runtime = new AgentArtsRuntimeConfig();

    expect(runtime.lifecycleConfig).toBeInstanceOf(LifecycleConfig);
    expect(runtime.lifecycleConfig!.toDict()).toEqual({});
  });
});

describe('ArtifactSourceConfig.swrInstanceId', () => {
  it('excludes an unset swr_instance_id', () => {
    const config = new ArtifactSourceConfig({ url: 'swr/x:latest' });
    const result = config.toDict();

    expect('swr_instance_id' in result).toBe(false);
    expect(result['url']).toBe('swr/x:latest');
  });

  it('includes a set swr_instance_id', () => {
    const config = new ArtifactSourceConfig({ url: 'swr/x:latest', swrInstanceId: SFS_ID });

    expect(config.toDict()['swr_instance_id']).toBe(SFS_ID);
  });

  it('rejects a non-UUID swr_instance_id', () => {
    expect(
      () => new ArtifactSourceConfig({ url: 'swr/x:latest', swrInstanceId: 'not-a-uuid' }),
    ).toThrow();
  });

  it('includes swr_instance_id in both the init and config YAML', async () => {
    const initDir = join(tmpDir, 'init-proj');
    mkdirSync(initDir);
    createConfigFile(initDir, 'a', 'basic');
    expect(readFileSync(join(initDir, CONFIG_FILE_NAME), 'utf8')).toContain('swr_instance_id:');

    const cfgDir = join(tmpDir, 'cfg-proj');
    mkdirSync(cfgDir);
    cwdSpy.mockReturnValue(cfgDir);
    await addAgent('c', 'agent:app', { region: 'cn-southwest-2' });
    expect(readFileSync(join(cfgDir, CONFIG_FILE_NAME), 'utf8')).toContain('swr_instance_id:');
  });
});
