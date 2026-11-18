/**
 * AgentArts configuration models.
 *
 * Ported from `agentarts/toolkit/utils/runtime/config.py`. The Python models
 * are Pydantic `BaseModel`s; here they are plain classes with
 * `toDict()`/`fromDict()`:
 *
 * - properties are camelCase, `toDict()` emits the wire (snake_case) names;
 * - every model accepts a `Partial` initializer, and, for convenience, also
 *   unserialized snake_case keys (so `fromDict()` round-trips a config file);
 * - Pydantic `extra="allow"` is honoured: unknown keys are kept on the instance
 *   and re-serialized, which matters for e.g. `base.arch` written by
 *   `agentarts config`;
 * - Pydantic field validators are preserved (port range, UUID patterns,
 *   lifecycle limits) and throw `Error` where Pydantic raises
 *   `ValidationError`.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import * as os from 'node:os';

import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

/** Loose dictionary used for (de)serialization, mirroring `dict[str, Any]`. */
export type ConfigDict = Record<string, any>;

/** Wire name / camelCase property name pair of a serialized field. */
type FieldPair = readonly [wire: string, prop: string];

const UUID_PATTERN =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

const LIFECYCLE_MIN_SEC = 60;
const LIFECYCLE_MAX_SEC = 604800;

// ---------------------------------------------------------------------------
// Serialization helpers (Pydantic `model_dump(mode="json")` equivalents)
// ---------------------------------------------------------------------------

function snakeCase(name: string): string {
  return name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
}

function camelCase(name: string): string {
  return name.replace(/_([a-z0-9])/g, (_match, char: string) => char.toUpperCase());
}

/** Read an initializer value by camelCase name, falling back to the wire name. */
function initValue(init: ConfigDict | undefined, camel: string, wire?: string): any {
  if (!init) {
    return undefined;
  }
  if (init[camel] !== undefined) {
    return init[camel];
  }
  const wireName = wire ?? snakeCase(camel);
  if (init[wireName] !== undefined) {
    return init[wireName];
  }
  return undefined;
}

/** Read a dictionary value by wire name, falling back to the camelCase name. */
function dictValue(dict: ConfigDict | null | undefined, wire: string, camel?: string): any {
  if (!dict) {
    return undefined;
  }
  if (dict[wire] !== undefined) {
    return dict[wire];
  }
  const camelName = camel ?? camelCase(wire);
  if (dict[camelName] !== undefined) {
    return dict[camelName];
  }
  return undefined;
}

/** Collect unknown keys of a dict so Pydantic's `extra="allow"` is preserved. */
function extrasOf(dict: ConfigDict | null | undefined, fields: readonly FieldPair[]): ConfigDict {
  const extras: ConfigDict = {};
  if (!dict) {
    return extras;
  }
  const known = new Set<string>();
  for (const [wire, prop] of fields) {
    known.add(wire);
    known.add(prop);
  }
  for (const [key, value] of Object.entries(dict)) {
    if (!known.has(key)) {
      extras[key] = value;
    }
  }
  return extras;
}

/** Store unknown initializer keys on the instance (Pydantic `extra="allow"`). */
function applyExtras(target: object, init: ConfigDict | undefined, fields: readonly FieldPair[]): void {
  if (!init) {
    return;
  }
  const extras = extrasOf(init, fields);
  for (const [key, value] of Object.entries(extras)) {
    if (key in target) {
      continue;
    }
    (target as ConfigDict)[key] = value;
  }
}

function dumpValue(value: any): any {
  if (Array.isArray(value)) {
    return value.map((item) => dumpValue(item));
  }
  if (value !== null && typeof value === 'object') {
    const fields = (value.constructor as any)?.fields;
    if (Array.isArray(fields)) {
      return dumpPlain(value);
    }
    const dict: ConfigDict = {};
    for (const [key, item] of Object.entries(value)) {
      dict[key] = dumpValue(item);
    }
    return dict;
  }
  return value;
}

/**
 * Serialize declared fields (plus extras) exactly like Pydantic's
 * `model_dump(mode="json")`: values are kept as-is, including `null`.
 */
function dumpPlain(model: object, fields?: readonly FieldPair[]): ConfigDict {
  const spec: readonly FieldPair[] =
    fields ?? ((model.constructor as any).fields as readonly FieldPair[]) ?? [];
  const dict: ConfigDict = {};
  const declared = new Set<string>();
  for (const [wire, prop] of spec) {
    dict[wire] = dumpValue((model as ConfigDict)[prop]);
    declared.add(prop);
  }
  for (const key of Object.keys(model)) {
    if (!declared.has(key)) {
      dict[key] = dumpValue((model as ConfigDict)[key]);
    }
  }
  return dict;
}

/**
 * Drop `null`/`undefined` entries (`exclude_none=True`).
 *
 * Pydantic's `exclude_none` applies recursively to nested models and dicts, so
 * nested objects are filtered too.
 */
function excludeNone(data: ConfigDict): ConfigDict {
  return excludeNoneDeep(data) as ConfigDict;
}

function excludeNoneDeep(value: any): any {
  if (Array.isArray(value)) {
    return value.map((item) => excludeNoneDeep(item));
  }
  if (value !== null && typeof value === 'object') {
    const result: ConfigDict = {};
    for (const [key, item] of Object.entries(value)) {
      if (item === null || item === undefined) {
        continue;
      }
      result[key] = excludeNoneDeep(item);
    }
    return result;
  }
  return value;
}

/**
 * Drop `null`/`undefined` entries and empty lists/dicts.
 *
 * Counterpart of Python's
 * `{k: v for k, v in data.items() if v not in ([], {})}` which is applied after
 * `model_dump(exclude_none=True)`.
 */
function dropEmpty(data: ConfigDict): ConfigDict {
  const result: ConfigDict = {};
  for (const [key, value] of Object.entries(data)) {
    if (value === null || value === undefined) {
      continue;
    }
    if (Array.isArray(value) && value.length === 0) {
      continue;
    }
    if (
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      Object.keys(value).length === 0
    ) {
      continue;
    }
    result[key] = value;
  }
  return result;
}

function coerceInt(value: any, field: string): number {
  const num = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isInteger(num)) {
    throw new Error(`Invalid ${field}: ${String(value)} (must be an integer)`);
  }
  return num;
}

function enumValue(enumType: Record<string, string>, value: any, field: string, fallback: string): string {
  if (value === undefined || value === null) {
    return fallback;
  }
  const stringValue = String(value);
  const allowed = Object.values(enumType);
  if (!allowed.includes(stringValue)) {
    throw new Error(`Invalid ${field}: ${stringValue} (expected one of ${allowed.join(', ')})`);
  }
  return stringValue;
}

function nestedValue<T extends { toDict(): ConfigDict }>(
  init: ConfigDict | undefined,
  camel: string,
  wire: string,
  factory: { fromDict(dict?: ConfigDict | null): T },
  fallback: T | null,
): T | null {
  const value = initValue(init, camel, wire);
  if (value === undefined) {
    return fallback;
  }
  if (value === null) {
    return null;
  }
  if (typeof (value as any).toDict === 'function') {
    return value as T;
  }
  return factory.fromDict(value as ConfigDict);
}

function nestedListValue<T extends { toDict(): ConfigDict }>(
  init: ConfigDict | undefined,
  camel: string,
  wire: string,
  factory: { fromDict(dict?: ConfigDict | null): T },
  fallback: T[] | null,
): T[] | null {
  const value = initValue(init, camel, wire);
  if (value === undefined) {
    return fallback;
  }
  if (value === null) {
    return null;
  }
  return (value as any[]).map((item) =>
    item && typeof item.toDict === 'function' ? (item as T) : factory.fromDict(item as ConfigDict),
  );
}

function listValue(value: any, fallback: string[] | null): string[] | null {
  if (value === undefined) {
    return fallback;
  }
  if (value === null) {
    return null;
  }
  return (value as any[]).map((item) => String(item));
}

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/** Network protocol. */
export enum NetworkProtocol {
  HTTP = 'HTTP',
  MCP = 'MCP',
  WEBSOCKET = 'WEBSOCKET',
}

/** URL match type for invoke configuration. */
export enum UrlMatchType {
  ACCURATE_MATCH = 'ACCURATE_MATCH',
  PREFIX_MATCH = 'PREFIX_MATCH',
}

/** Architecture type. */
export enum ArchType {
  ARM64 = 'arm64',
  X86_64 = 'x86_64',
}

/** Authentication type. */
export enum AuthType {
  IAM = 'IAM',
  API_KEY = 'API_KEY',
  CUSTOM_JWT = 'CUSTOM_JWT',
}

/**
 * Detect the current machine architecture.
 *
 * Python uses `platform.machine()`; Node's counterpart is `os.machine()`, with
 * `process.arch` as a fallback when the platform reports nothing.
 */
export function detectArch(): ArchType {
  let machine = '';
  try {
    machine = (os.machine() ?? '').toLowerCase();
  } catch {
    machine = '';
  }
  if (!machine) {
    machine = process.arch.toLowerCase();
  }
  if (machine === 'aarch64' || machine === 'arm64' || machine === 'arm') {
    return ArchType.ARM64;
  }
  if (machine === 'x86_64' || machine === 'amd64' || machine === 'x64' || machine === 'ia32') {
    return ArchType.X86_64;
  }
  // Unknown architecture: default to arm64 — the AgentArts backend is
  // predominantly arm, so an unrecognised machine is more likely to target
  // arm than x86.
  return ArchType.ARM64;
}

// ---------------------------------------------------------------------------
// Base / SWR configuration
// ---------------------------------------------------------------------------

/** Base configuration with region and environment. */
export class BaseConfig {
  static readonly fields: readonly FieldPair[] = [
    ['name', 'name'],
    ['entrypoint', 'entrypoint'],
    ['dependency_file', 'dependencyFile'],
    ['region', 'region'],
    ['platform', 'platform'],
    ['language', 'language'],
    ['container_runtime', 'containerRuntime'],
    ['base_image', 'baseImage'],
  ];

  [key: string]: any;

  /** Name of the AgentArts runtime. */
  name: string | null;
  /** Entrypoint of the AgentArts runtime. */
  entrypoint: string | null;
  /** Path to dependency file (e.g. requirements.txt, pyproject.toml, pom.xml). */
  dependencyFile: string | null;
  /** Huawei Cloud region. */
  region: string | null;
  /** Platform of the AgentArts runtime. */
  platform: string;
  /** Language of the AgentArts runtime. */
  language: string;
  /** Container runtime of the AgentArts runtime. */
  containerRuntime: string;
  /** Base image of the AgentArts runtime. */
  baseImage: string;

  constructor(init?: Partial<BaseConfig> & ConfigDict) {
    const data = init as ConfigDict | undefined;
    this.name = initValue(data, 'name') ?? null;
    this.entrypoint = initValue(data, 'entrypoint') ?? null;
    this.dependencyFile = initValue(data, 'dependencyFile', 'dependency_file') ?? null;
    this.region = initValue(data, 'region') ?? null;
    this.platform = initValue(data, 'platform') ?? 'linux/arm64';
    this.language = initValue(data, 'language') ?? 'nodejs';
    this.containerRuntime = initValue(data, 'containerRuntime', 'container_runtime') ?? 'docker';
    this.baseImage = initValue(data, 'baseImage', 'base_image') ?? 'node:22-slim';
    applyExtras(this, data, BaseConfig.fields);
  }

  /** Convert configuration to dictionary. */
  toDict(): ConfigDict {
    return dumpPlain(this);
  }

  static fromDict(dict?: ConfigDict | null): BaseConfig {
    const data = dict ?? {};
    return new BaseConfig({
      name: dictValue(data, 'name'),
      entrypoint: dictValue(data, 'entrypoint'),
      dependencyFile: dictValue(data, 'dependency_file', 'dependencyFile'),
      region: dictValue(data, 'region'),
      platform: dictValue(data, 'platform'),
      language: dictValue(data, 'language'),
      containerRuntime: dictValue(data, 'container_runtime', 'containerRuntime'),
      baseImage: dictValue(data, 'base_image', 'baseImage'),
      ...extrasOf(data, BaseConfig.fields),
    });
  }
}

/** Huawei Cloud SWR (SoftWare Repository) configuration. */
export class SWRConfig {
  static readonly fields: readonly FieldPair[] = [
    ['organization_auto_create', 'organizationAutoCreate'],
    ['organization', 'organization'],
    ['repository_auto_create', 'repositoryAutoCreate'],
    ['repository', 'repository'],
  ];

  [key: string]: any;

  /** Whether to automatically create the SWR organization if it doesn't exist. */
  organizationAutoCreate: boolean;
  /** SWR organization name. */
  organization: string | null;
  /** Whether to automatically create the SWR repository if it doesn't exist. */
  repositoryAutoCreate: boolean;
  /** SWR repository name. */
  repository: string | null;

  constructor(init?: Partial<SWRConfig> & ConfigDict) {
    const data = init as ConfigDict | undefined;
    this.organizationAutoCreate = initValue(data, 'organizationAutoCreate', 'organization_auto_create') ?? false;
    this.organization = initValue(data, 'organization') ?? null;
    this.repositoryAutoCreate = initValue(data, 'repositoryAutoCreate', 'repository_auto_create') ?? false;
    this.repository = initValue(data, 'repository') ?? null;
    applyExtras(this, data, SWRConfig.fields);
  }

  /** Convert configuration to dictionary. */
  toDict(): ConfigDict {
    return dumpPlain(this);
  }

  static fromDict(dict?: ConfigDict | null): SWRConfig {
    const data = dict ?? {};
    return new SWRConfig({
      organizationAutoCreate: dictValue(data, 'organization_auto_create', 'organizationAutoCreate'),
      organization: dictValue(data, 'organization'),
      repositoryAutoCreate: dictValue(data, 'repository_auto_create', 'repositoryAutoCreate'),
      repository: dictValue(data, 'repository'),
      ...extrasOf(data, SWRConfig.fields),
    });
  }
}

// ---------------------------------------------------------------------------
// Invoke configuration
// ---------------------------------------------------------------------------

/** File transfer configuration. */
export class FileTransferConfig {
  static readonly fields: readonly FieldPair[] = [['enabled', 'enabled']];

  [key: string]: any;

  /** Whether to enable file upload/download functionality. */
  enabled: boolean;

  constructor(init?: Partial<FileTransferConfig> & ConfigDict) {
    const data = init as ConfigDict | undefined;
    this.enabled = initValue(data, 'enabled') ?? false;
    applyExtras(this, data, FileTransferConfig.fields);
  }

  /** Convert configuration to dictionary. */
  toDict(): ConfigDict {
    return dumpPlain(this);
  }

  static fromDict(dict?: ConfigDict | null): FileTransferConfig {
    const data = dict ?? {};
    return new FileTransferConfig({
      enabled: dictValue(data, 'enabled'),
      ...extrasOf(data, FileTransferConfig.fields),
    });
  }
}

/** Invoke configuration. */
export class InvokeConfig {
  static readonly fields: readonly FieldPair[] = [
    ['protocol', 'protocol'],
    ['port', 'port'],
    ['file_transfer_config', 'fileTransferConfig'],
    ['url_match_type', 'urlMatchType'],
  ];

  [key: string]: any;

  /** Server protocol for deployment, either HTTP, MCP or WEBSOCKET. */
  protocol: NetworkProtocol | string;
  /** Port number of the server. */
  port: number;
  /** File transfer configuration for upload/download functionality. */
  fileTransferConfig: FileTransferConfig | null;
  /** URL match type: ACCURATE_MATCH or PREFIX_MATCH. */
  urlMatchType: UrlMatchType | string;

  constructor(init?: Partial<InvokeConfig> & ConfigDict) {
    const data = init as ConfigDict | undefined;
    this.protocol = enumValue(NetworkProtocol, initValue(data, 'protocol'), 'protocol', NetworkProtocol.HTTP);
    const port = initValue(data, 'port');
    this.port = port === undefined || port === null ? 8080 : coerceInt(port, 'port');
    if (this.port < 1 || this.port > 65535) {
      throw new Error(`Invalid port: ${this.port} (must be between 1 and 65535)`);
    }
    this.fileTransferConfig = nestedValue(
      data,
      'fileTransferConfig',
      'file_transfer_config',
      FileTransferConfig,
      null,
    );
    this.urlMatchType = enumValue(
      UrlMatchType,
      initValue(data, 'urlMatchType', 'url_match_type'),
      'url_match_type',
      UrlMatchType.ACCURATE_MATCH,
    );
    applyExtras(this, data, InvokeConfig.fields);
  }

  /** Convert configuration to dictionary. */
  toDict(): ConfigDict {
    return dumpPlain(this);
  }

  static fromDict(dict?: ConfigDict | null): InvokeConfig {
    const data = dict ?? {};
    return new InvokeConfig({
      protocol: dictValue(data, 'protocol'),
      port: dictValue(data, 'port'),
      fileTransferConfig: dictValue(data, 'file_transfer_config', 'fileTransferConfig'),
      urlMatchType: dictValue(data, 'url_match_type', 'urlMatchType'),
      ...extrasOf(data, InvokeConfig.fields),
    });
  }
}

// ---------------------------------------------------------------------------
// Network configuration
// ---------------------------------------------------------------------------

/** VPC configuration. */
export class VpcConfig {
  static readonly fields: readonly FieldPair[] = [
    ['vpc_id', 'vpcId'],
    ['subnet_id', 'subnetId'],
    ['security_group_id', 'securityGroupId'],
  ];

  [key: string]: any;

  /** VPC ID. */
  vpcId: string | null;
  /** Subnet ID. */
  subnetId: string | null;
  /** Security group IDs. */
  securityGroupId: string[] | null;

  constructor(init?: Partial<VpcConfig> & ConfigDict) {
    const data = init as ConfigDict | undefined;
    this.vpcId = initValue(data, 'vpcId', 'vpc_id') ?? null;
    this.subnetId = initValue(data, 'subnetId', 'subnet_id') ?? null;
    this.securityGroupId = listValue(initValue(data, 'securityGroupId', 'security_group_id'), []);
    applyExtras(this, data, VpcConfig.fields);
  }

  /** Convert configuration to dictionary. */
  toDict(): ConfigDict {
    return dropEmpty(excludeNone(dumpPlain(this)));
  }

  static fromDict(dict?: ConfigDict | null): VpcConfig {
    const data = dict ?? {};
    return new VpcConfig({
      vpcId: dictValue(data, 'vpc_id', 'vpcId'),
      subnetId: dictValue(data, 'subnet_id', 'subnetId'),
      securityGroupId: dictValue(data, 'security_group_id', 'securityGroupId'),
      ...extrasOf(data, VpcConfig.fields),
    });
  }
}

/** Network endpoint configuration. */
export class NetworkConfig {
  static readonly fields: readonly FieldPair[] = [
    ['network_mode', 'networkMode'],
    ['vpc_config', 'vpcConfig'],
  ];

  [key: string]: any;

  /** Network mode, e.g. 'VPC' or 'PUBLIC'. */
  networkMode: string;
  /** VPC configuration details. */
  vpcConfig: VpcConfig | null;

  constructor(init?: Partial<NetworkConfig> & ConfigDict) {
    const data = init as ConfigDict | undefined;
    this.networkMode = initValue(data, 'networkMode', 'network_mode') ?? 'PUBLIC';
    this.vpcConfig = nestedValue(data, 'vpcConfig', 'vpc_config', VpcConfig, new VpcConfig());
    applyExtras(this, data, NetworkConfig.fields);
  }

  /** Convert configuration to dictionary. */
  toDict(): ConfigDict {
    return dropEmpty(excludeNone(dumpPlain(this)));
  }

  static fromDict(dict?: ConfigDict | null): NetworkConfig {
    const data = dict ?? {};
    return new NetworkConfig({
      networkMode: dictValue(data, 'network_mode', 'networkMode'),
      vpcConfig: dictValue(data, 'vpc_config', 'vpcConfig'),
      ...extrasOf(data, NetworkConfig.fields),
    });
  }
}

// ---------------------------------------------------------------------------
// Storage configuration
// ---------------------------------------------------------------------------

/** SFS Turbo storage configuration. */
export class SfsTurboConfig {
  static readonly fields: readonly FieldPair[] = [
    ['sfs_turbo_id', 'sfsTurboId'],
    ['sfs_path', 'sfsPath'],
    ['mount_path', 'mountPath'],
    ['read_only', 'readOnly'],
  ];

  [key: string]: any;

  /** SFS Turbo ID (UUID format, required when storage_config is set). */
  sfsTurboId: string | null;
  /** SFS Turbo shared path inside the file system. */
  sfsPath: string | null;
  /** Container mount path (required when storage_config is set). */
  mountPath: string | null;
  /** Whether to mount the share read-only. */
  readOnly: boolean | null;

  constructor(init?: Partial<SfsTurboConfig> & ConfigDict) {
    const data = init as ConfigDict | undefined;
    const sfsTurboId = initValue(data, 'sfsTurboId', 'sfs_turbo_id') ?? null;
    if (sfsTurboId !== null && !UUID_PATTERN.test(String(sfsTurboId))) {
      throw new Error(`Invalid sfs_turbo_id: ${String(sfsTurboId)} (must be a UUID)`);
    }
    this.sfsTurboId = sfsTurboId;
    this.sfsPath = initValue(data, 'sfsPath', 'sfs_path') ?? null;
    this.mountPath = initValue(data, 'mountPath', 'mount_path') ?? null;
    this.readOnly = initValue(data, 'readOnly', 'read_only') ?? null;
    applyExtras(this, data, SfsTurboConfig.fields);
  }

  /** Convert configuration to dictionary. */
  toDict(): ConfigDict {
    return dropEmpty(excludeNone(dumpPlain(this)));
  }

  static fromDict(dict?: ConfigDict | null): SfsTurboConfig {
    const data = dict ?? {};
    return new SfsTurboConfig({
      sfsTurboId: dictValue(data, 'sfs_turbo_id', 'sfsTurboId'),
      sfsPath: dictValue(data, 'sfs_path', 'sfsPath'),
      mountPath: dictValue(data, 'mount_path', 'mountPath'),
      readOnly: dictValue(data, 'read_only', 'readOnly'),
      ...extrasOf(data, SfsTurboConfig.fields),
    });
  }
}

/** Session storage configuration. */
export class SessionStorageConfig {
  static readonly fields: readonly FieldPair[] = [['mount_path', 'mountPath']];

  [key: string]: any;

  /** Session storage mount path in the container. */
  mountPath: string | null;

  constructor(init?: Partial<SessionStorageConfig> & ConfigDict) {
    const data = init as ConfigDict | undefined;
    this.mountPath = initValue(data, 'mountPath', 'mount_path') ?? null;
    applyExtras(this, data, SessionStorageConfig.fields);
  }

  /** Convert configuration to dictionary. */
  toDict(): ConfigDict {
    return dropEmpty(excludeNone(dumpPlain(this)));
  }

  static fromDict(dict?: ConfigDict | null): SessionStorageConfig {
    const data = dict ?? {};
    return new SessionStorageConfig({
      mountPath: dictValue(data, 'mount_path', 'mountPath'),
      ...extrasOf(data, SessionStorageConfig.fields),
    });
  }
}

/** Storage configuration for the runtime. */
export class StorageConfig {
  static readonly fields: readonly FieldPair[] = [
    ['sfs_turbo', 'sfsTurbo'],
    ['session_storage', 'sessionStorage'],
  ];

  [key: string]: any;

  /** SFS Turbo storage configuration. */
  sfsTurbo: SfsTurboConfig | null;
  /** Session storage configuration. */
  sessionStorage: SessionStorageConfig | null;

  constructor(init?: Partial<StorageConfig> & ConfigDict) {
    const data = init as ConfigDict | undefined;
    this.sfsTurbo = nestedValue(data, 'sfsTurbo', 'sfs_turbo', SfsTurboConfig, new SfsTurboConfig());
    this.sessionStorage = nestedValue(
      data,
      'sessionStorage',
      'session_storage',
      SessionStorageConfig,
      new SessionStorageConfig(),
    );
    applyExtras(this, data, StorageConfig.fields);
  }

  /**
   * Convert configuration to dictionary.
   *
   * The API expects `sfs_turbo` as an **array** of config objects (not a single
   * object), so this wraps the single config object in a list. Returns `{}`
   * when nothing is configured.
   */
  toDict(): ConfigDict {
    const result: ConfigDict = {};
    const sfsTurbo = this.sfsTurbo;
    if (sfsTurbo !== null && sfsTurbo.sfsTurboId) {
      const item = sfsTurbo.toDict();
      if (Object.keys(item).length > 0) {
        result['sfs_turbo'] = [item];
      }
    }
    if (this.sessionStorage !== null) {
      const sessionStorage = this.sessionStorage.toDict();
      if (Object.keys(sessionStorage).length > 0) {
        result['session_storage'] = sessionStorage;
      }
    }
    return result;
  }

  static fromDict(dict?: ConfigDict | null): StorageConfig {
    const data = dict ?? {};
    return new StorageConfig({
      sfsTurbo: dictValue(data, 'sfs_turbo', 'sfsTurbo'),
      sessionStorage: dictValue(data, 'session_storage', 'sessionStorage'),
      ...extrasOf(data, StorageConfig.fields),
    });
  }
}

// ---------------------------------------------------------------------------
// Lifecycle configuration
// ---------------------------------------------------------------------------

/** Lifecycle limits for runtime sessions. */
export class LifecycleConfig {
  static readonly fields: readonly FieldPair[] = [
    ['idle_session_timeout_sec', 'idleSessionTimeoutSec'],
    ['max_alive_time_sec', 'maxAliveTimeSec'],
  ];

  [key: string]: any;

  /** Idle session timeout in seconds (60-604800). */
  idleSessionTimeoutSec: number | null;
  /** Maximum session lifetime in seconds (60-604800). */
  maxAliveTimeSec: number | null;

  constructor(init?: Partial<LifecycleConfig> & ConfigDict) {
    const data = init as ConfigDict | undefined;
    this.idleSessionTimeoutSec = this.limit(data, 'idleSessionTimeoutSec', 'idle_session_timeout_sec');
    this.maxAliveTimeSec = this.limit(data, 'maxAliveTimeSec', 'max_alive_time_sec');
    applyExtras(this, data, LifecycleConfig.fields);
  }

  private limit(data: ConfigDict | undefined, camel: string, wire: string): number | null {
    const value = initValue(data, camel, wire);
    if (value === undefined || value === null) {
      return null;
    }
    const seconds = coerceInt(value, wire);
    if (seconds < LIFECYCLE_MIN_SEC || seconds > LIFECYCLE_MAX_SEC) {
      throw new Error(
        `Invalid ${wire}: ${seconds} (must be between ${LIFECYCLE_MIN_SEC} and ${LIFECYCLE_MAX_SEC})`,
      );
    }
    return seconds;
  }

  /** Convert configuration to an API-ready dictionary. */
  toDict(): ConfigDict {
    return excludeNone(dumpPlain(this));
  }

  static fromDict(dict?: ConfigDict | null): LifecycleConfig {
    const data = dict ?? {};
    return new LifecycleConfig({
      idleSessionTimeoutSec: dictValue(data, 'idle_session_timeout_sec', 'idleSessionTimeoutSec'),
      maxAliveTimeSec: dictValue(data, 'max_alive_time_sec', 'maxAliveTimeSec'),
      ...extrasOf(data, LifecycleConfig.fields),
    });
  }
}

// ---------------------------------------------------------------------------
// Authentication configuration
// ---------------------------------------------------------------------------

/** API key pair configuration. */
export class APIKeyPair {
  static readonly fields: readonly FieldPair[] = [
    ['api_key', 'apiKey'],
    ['api_key_name', 'apiKeyName'],
  ];

  [key: string]: any;

  /** API key. */
  apiKey: string | null;
  /** API key name. */
  apiKeyName: string | null;

  constructor(init?: Partial<APIKeyPair> & ConfigDict) {
    const data = init as ConfigDict | undefined;
    this.apiKey = initValue(data, 'apiKey', 'api_key') ?? null;
    this.apiKeyName = initValue(data, 'apiKeyName', 'api_key_name') ?? null;
    applyExtras(this, data, APIKeyPair.fields);
  }

  /** Convert configuration to dictionary. */
  toDict(): ConfigDict {
    return dropEmpty(excludeNone(dumpPlain(this)));
  }

  static fromDict(dict?: ConfigDict | null): APIKeyPair {
    const data = dict ?? {};
    return new APIKeyPair({
      apiKey: dictValue(data, 'api_key', 'apiKey'),
      apiKeyName: dictValue(data, 'api_key_name', 'apiKeyName'),
      ...extrasOf(data, APIKeyPair.fields),
    });
  }
}

/** API key authentication configuration. */
export class APIKeyAuthConfig {
  static readonly fields: readonly FieldPair[] = [['api_keys', 'apiKeys']];

  [key: string]: any;

  /** API keys for authentication. */
  apiKeys: APIKeyPair[] | null;

  constructor(init?: Partial<APIKeyAuthConfig> & ConfigDict) {
    const data = init as ConfigDict | undefined;
    this.apiKeys = nestedListValue(data, 'apiKeys', 'api_keys', APIKeyPair, []);
    applyExtras(this, data, APIKeyAuthConfig.fields);
  }

  /** Convert configuration to dictionary. */
  toDict(): ConfigDict {
    return dumpPlain(this);
  }

  static fromDict(dict?: ConfigDict | null): APIKeyAuthConfig {
    const data = dict ?? {};
    return new APIKeyAuthConfig({
      apiKeys: dictValue(data, 'api_keys', 'apiKeys'),
      ...extrasOf(data, APIKeyAuthConfig.fields),
    });
  }
}

/** Custom JWT authentication configuration. */
export class CustomJWTAuthConfig {
  static readonly fields: readonly FieldPair[] = [
    ['discovery_url', 'discoveryUrl'],
    ['allowed_audience', 'allowedAudience'],
    ['allowed_clients', 'allowedClients'],
    ['allowed_scopes', 'allowedScopes'],
  ];

  [key: string]: any;

  /** Discovery URL for JWT authentication. */
  discoveryUrl: string | null;
  /** Allowed audiences for JWT authentication. */
  allowedAudience: string[] | null;
  /** Allowed clients for JWT authentication. */
  allowedClients: string[] | null;
  /** Allowed scopes for JWT authentication. */
  allowedScopes: string[] | null;

  constructor(init?: Partial<CustomJWTAuthConfig> & ConfigDict) {
    const data = init as ConfigDict | undefined;
    this.discoveryUrl = initValue(data, 'discoveryUrl', 'discovery_url') ?? null;
    this.allowedAudience = listValue(initValue(data, 'allowedAudience', 'allowed_audience'), []);
    this.allowedClients = listValue(initValue(data, 'allowedClients', 'allowed_clients'), []);
    this.allowedScopes = listValue(initValue(data, 'allowedScopes', 'allowed_scopes'), []);
    applyExtras(this, data, CustomJWTAuthConfig.fields);
  }

  /** Check if all fields are empty (default values). */
  isEmpty(): boolean {
    return (
      this.discoveryUrl === null &&
      !(this.allowedAudience ?? []).length &&
      !(this.allowedClients ?? []).length &&
      !(this.allowedScopes ?? []).length
    );
  }

  /** Convert configuration to dictionary, excluding empty values. */
  toDict(): ConfigDict {
    if (this.isEmpty()) {
      return {};
    }
    return dropEmpty(excludeNone(dumpPlain(this)));
  }

  static fromDict(dict?: ConfigDict | null): CustomJWTAuthConfig {
    const data = dict ?? {};
    return new CustomJWTAuthConfig({
      discoveryUrl: dictValue(data, 'discovery_url', 'discoveryUrl'),
      allowedAudience: dictValue(data, 'allowed_audience', 'allowedAudience'),
      allowedClients: dictValue(data, 'allowed_clients', 'allowedClients'),
      allowedScopes: dictValue(data, 'allowed_scopes', 'allowedScopes'),
      ...extrasOf(data, CustomJWTAuthConfig.fields),
    });
  }
}

/** Authentication configuration. */
export class AuthConfig {
  static readonly fields: readonly FieldPair[] = [
    ['custom_jwt', 'customJwt'],
    ['key_auth', 'keyAuth'],
  ];

  [key: string]: any;

  /** Custom JWT authentication configuration. */
  customJwt: CustomJWTAuthConfig | null;
  /** API key authentication configuration. */
  keyAuth: APIKeyAuthConfig | null;

  constructor(init?: Partial<AuthConfig> & ConfigDict) {
    const data = init as ConfigDict | undefined;
    this.customJwt = nestedValue(
      data,
      'customJwt',
      'custom_jwt',
      CustomJWTAuthConfig,
      new CustomJWTAuthConfig(),
    );
    this.keyAuth = nestedValue(data, 'keyAuth', 'key_auth', APIKeyAuthConfig, new APIKeyAuthConfig());
    applyExtras(this, data, AuthConfig.fields);
  }

  /** Check if all fields are empty. */
  isEmpty(): boolean {
    const customJwtEmpty = this.customJwt === null || this.customJwt.isEmpty();
    const keyAuthEmpty = this.keyAuth === null || !(this.keyAuth.apiKeys ?? []).length;
    return customJwtEmpty && keyAuthEmpty;
  }

  /** Convert configuration to dictionary, excluding empty values. */
  toDict(): ConfigDict {
    const result: ConfigDict = {};
    if (this.customJwt && !this.customJwt.isEmpty()) {
      const jwtDict = this.customJwt.toDict();
      if (Object.keys(jwtDict).length > 0) {
        result['custom_jwt'] = jwtDict;
      }
    }
    if (this.keyAuth && this.keyAuth.apiKeys && this.keyAuth.apiKeys.length > 0) {
      const keys = this.keyAuth.apiKeys
        .map((key) => key.toDict())
        .filter((key) => Object.keys(key).length > 0);
      if (keys.length > 0) {
        result['key_auth'] = { api_keys: keys };
      }
    }
    return result;
  }

  static fromDict(dict?: ConfigDict | null): AuthConfig {
    const data = dict ?? {};
    return new AuthConfig({
      customJwt: dictValue(data, 'custom_jwt', 'customJwt'),
      keyAuth: dictValue(data, 'key_auth', 'keyAuth'),
      ...extrasOf(data, AuthConfig.fields),
    });
  }
}

/** Inbound identity configuration. */
export class InboundIdentityConfig {
  static readonly fields: readonly FieldPair[] = [
    ['authorizer_type', 'authorizerType'],
    ['authorizer_configuration', 'authorizerConfiguration'],
  ];

  [key: string]: any;

  /** Authentication type. */
  authorizerType: AuthType | string;
  /** Authorizer configuration. */
  authorizerConfiguration: AuthConfig | null;

  constructor(init?: Partial<InboundIdentityConfig> & ConfigDict) {
    const data = init as ConfigDict | undefined;
    this.authorizerType = enumValue(
      AuthType,
      initValue(data, 'authorizerType', 'authorizer_type'),
      'authorizer_type',
      AuthType.IAM,
    );
    this.authorizerConfiguration = nestedValue(
      data,
      'authorizerConfiguration',
      'authorizer_configuration',
      AuthConfig,
      null,
    );
    applyExtras(this, data, InboundIdentityConfig.fields);
  }

  /** Convert configuration to dictionary. */
  toDict(): ConfigDict {
    const result: ConfigDict = { authorizer_type: this.authorizerType };
    if (this.authorizerConfiguration && !this.authorizerConfiguration.isEmpty()) {
      const authDict = this.authorizerConfiguration.toDict();
      if (Object.keys(authDict).length > 0) {
        result['authorizer_configuration'] = authDict;
      }
    }
    return result;
  }

  static fromDict(dict?: ConfigDict | null): InboundIdentityConfig {
    const data = dict ?? {};
    return new InboundIdentityConfig({
      authorizerType: dictValue(data, 'authorizer_type', 'authorizerType'),
      authorizerConfiguration: dictValue(
        data,
        'authorizer_configuration',
        'authorizerConfiguration',
      ),
      ...extrasOf(data, InboundIdentityConfig.fields),
    });
  }
}

// ---------------------------------------------------------------------------
// Artifact source configuration
// ---------------------------------------------------------------------------

/** Artifact source configuration. */
export class ArtifactSourceConfig {
  static readonly fields: readonly FieldPair[] = [
    ['url', 'url'],
    ['swr_instance_id', 'swrInstanceId'],
    ['commands', 'commands'],
  ];

  [key: string]: any;

  /** URL of the artifact source. */
  url: string | null;
  /** SWR instance ID (UUID format, optional). */
  swrInstanceId: string | null;
  /** Commands to run when the artifact is deployed. */
  commands: string[] | null;

  constructor(init?: Partial<ArtifactSourceConfig> & ConfigDict) {
    const data = init as ConfigDict | undefined;
    this.url = initValue(data, 'url') ?? null;
    const swrInstanceId = initValue(data, 'swrInstanceId', 'swr_instance_id') ?? null;
    if (swrInstanceId !== null && !UUID_PATTERN.test(String(swrInstanceId))) {
      throw new Error(`Invalid swr_instance_id: ${String(swrInstanceId)} (must be a UUID)`);
    }
    this.swrInstanceId = swrInstanceId;
    this.commands = listValue(initValue(data, 'commands'), []);
    applyExtras(this, data, ArtifactSourceConfig.fields);
  }

  /** Convert configuration to dictionary. */
  toDict(): ConfigDict {
    return excludeNone(dumpPlain(this));
  }

  static fromDict(dict?: ConfigDict | null): ArtifactSourceConfig {
    const data = dict ?? {};
    return new ArtifactSourceConfig({
      url: dictValue(data, 'url'),
      swrInstanceId: dictValue(data, 'swr_instance_id', 'swrInstanceId'),
      commands: dictValue(data, 'commands'),
      ...extrasOf(data, ArtifactSourceConfig.fields),
    });
  }
}

// ---------------------------------------------------------------------------
// Key/value, observability configuration
// ---------------------------------------------------------------------------

/** Key-value pair configuration. */
export class KeyValuePair {
  static readonly fields: readonly FieldPair[] = [
    ['key', 'key'],
    ['value', 'value'],
  ];

  [key: string]: any;

  /** Key. */
  key: string;
  /** Value. */
  value: string | null;

  constructor(init?: Partial<KeyValuePair> & ConfigDict) {
    const data = init as ConfigDict | undefined;
    const key = initValue(data, 'key');
    if (key === undefined || key === null) {
      throw new Error('Invalid key: field required');
    }
    this.key = String(key);
    this.value = initValue(data, 'value') ?? null;
    applyExtras(this, data, KeyValuePair.fields);
  }

  /** Convert configuration to dictionary. */
  toDict(): ConfigDict {
    return dumpPlain(this);
  }

  static fromDict(dict?: ConfigDict | null): KeyValuePair {
    const data = dict ?? {};
    return new KeyValuePair({
      key: dictValue(data, 'key'),
      value: dictValue(data, 'value'),
      ...extrasOf(data, KeyValuePair.fields),
    });
  }
}

/** Tracing configuration for observability. */
export class TracingConfig {
  static readonly fields: readonly FieldPair[] = [['enabled', 'enabled']];

  [key: string]: any;

  /** Whether tracing is enabled. */
  enabled: boolean;

  constructor(init?: Partial<TracingConfig> & ConfigDict) {
    const data = init as ConfigDict | undefined;
    this.enabled = initValue(data, 'enabled') ?? false;
    applyExtras(this, data, TracingConfig.fields);
  }

  /** Convert configuration to dictionary. */
  toDict(): ConfigDict {
    return dumpPlain(this);
  }

  static fromDict(dict?: ConfigDict | null): TracingConfig {
    const data = dict ?? {};
    return new TracingConfig({
      enabled: dictValue(data, 'enabled'),
      ...extrasOf(data, TracingConfig.fields),
    });
  }
}

/** Metrics configuration for observability. */
export class MetricsConfig {
  static readonly fields: readonly FieldPair[] = [['enabled', 'enabled']];

  [key: string]: any;

  /** Whether metrics collection is enabled. */
  enabled: boolean;

  constructor(init?: Partial<MetricsConfig> & ConfigDict) {
    const data = init as ConfigDict | undefined;
    this.enabled = initValue(data, 'enabled') ?? false;
    applyExtras(this, data, MetricsConfig.fields);
  }

  /** Convert configuration to dictionary. */
  toDict(): ConfigDict {
    return dumpPlain(this);
  }

  static fromDict(dict?: ConfigDict | null): MetricsConfig {
    const data = dict ?? {};
    return new MetricsConfig({
      enabled: dictValue(data, 'enabled'),
      ...extrasOf(data, MetricsConfig.fields),
    });
  }
}

/** Logging configuration for observability. */
export class LoggingConfig {
  static readonly fields: readonly FieldPair[] = [['enabled', 'enabled']];

  [key: string]: any;

  /** Whether logging is enabled. */
  enabled: boolean;

  constructor(init?: Partial<LoggingConfig> & ConfigDict) {
    const data = init as ConfigDict | undefined;
    this.enabled = initValue(data, 'enabled') ?? false;
    applyExtras(this, data, LoggingConfig.fields);
  }

  /** Convert configuration to dictionary. */
  toDict(): ConfigDict {
    return dumpPlain(this);
  }

  static fromDict(dict?: ConfigDict | null): LoggingConfig {
    const data = dict ?? {};
    return new LoggingConfig({
      enabled: dictValue(data, 'enabled'),
      ...extrasOf(data, LoggingConfig.fields),
    });
  }
}

/** Observability configuration. */
export class ObservabilityConfig {
  static readonly fields: readonly FieldPair[] = [
    ['tracing', 'tracing'],
    ['metrics', 'metrics'],
    ['logs', 'logs'],
  ];

  [key: string]: any;

  /** Tracing configuration. */
  tracing: TracingConfig | null;
  /** Metrics configuration. */
  metrics: MetricsConfig | null;
  /** Logging configuration. */
  logs: LoggingConfig | null;

  constructor(init?: Partial<ObservabilityConfig> & ConfigDict) {
    const data = init as ConfigDict | undefined;
    this.tracing = nestedValue(data, 'tracing', 'tracing', TracingConfig, new TracingConfig());
    this.metrics = nestedValue(data, 'metrics', 'metrics', MetricsConfig, new MetricsConfig());
    this.logs = nestedValue(data, 'logs', 'logs', LoggingConfig, new LoggingConfig());
    applyExtras(this, data, ObservabilityConfig.fields);
  }

  /** Convert configuration to dictionary. */
  toDict(): ConfigDict {
    return excludeNone(dumpPlain(this));
  }

  static fromDict(dict?: ConfigDict | null): ObservabilityConfig {
    const data = dict ?? {};
    return new ObservabilityConfig({
      tracing: dictValue(data, 'tracing'),
      metrics: dictValue(data, 'metrics'),
      logs: dictValue(data, 'logs'),
      ...extrasOf(data, ObservabilityConfig.fields),
    });
  }
}

// ---------------------------------------------------------------------------
// Runtime configuration
// ---------------------------------------------------------------------------

/** Runtime configuration for AgentArts. */
export class AgentArtsRuntimeConfig {
  static readonly fields: readonly FieldPair[] = [
    ['agent_id', 'agentId'],
    ['agent_gateway_id', 'agentGatewayId'],
    ['arch', 'arch'],
    ['execution_agency_name', 'executionAgencyName'],
    ['identity_configuration', 'identityConfiguration'],
    ['network_config', 'networkConfig'],
    ['invoke_config', 'invokeConfig'],
    ['observability', 'observability'],
    ['artifact_source', 'artifactSource'],
    ['storage_config', 'storageConfig'],
    ['lifecycle_config', 'lifecycleConfig'],
    ['environment_variables', 'environmentVariables'],
    ['tags', 'tags'],
  ];

  [key: string]: any;

  /** Agent ID. */
  agentId: string | null;
  /** Agent gateway ID. */
  agentGatewayId: string | null;
  /** Architecture type: arm64 or x86_64 (defaults to arm64). */
  arch: ArchType | string;
  /** Execution agency name. */
  executionAgencyName: string | null;
  /** Identity configuration. */
  identityConfiguration: InboundIdentityConfig | null;
  /** Network configuration. */
  networkConfig: NetworkConfig | null;
  /** Invoke configuration. */
  invokeConfig: InvokeConfig | null;
  /** Observability configuration. */
  observability: ObservabilityConfig | null;
  /** Artifact source configuration. */
  artifactSource: ArtifactSourceConfig | null;
  /** Storage configuration. */
  storageConfig: StorageConfig | null;
  /** Runtime lifecycle configuration. */
  lifecycleConfig: LifecycleConfig | null;
  /** Environment variables configuration. */
  environmentVariables: KeyValuePair[] | null;
  /** Tags configuration. */
  tags: KeyValuePair[] | null;

  constructor(init?: Partial<AgentArtsRuntimeConfig> & ConfigDict) {
    const data = init as ConfigDict | undefined;
    this.agentId = initValue(data, 'agentId', 'agent_id') ?? null;
    this.agentGatewayId = initValue(data, 'agentGatewayId', 'agent_gateway_id') ?? null;
    this.arch = enumValue(ArchType, initValue(data, 'arch'), 'arch', ArchType.ARM64);
    this.executionAgencyName = initValue(data, 'executionAgencyName', 'execution_agency_name') ?? null;
    this.identityConfiguration = nestedValue(
      data,
      'identityConfiguration',
      'identity_configuration',
      InboundIdentityConfig,
      new InboundIdentityConfig(),
    );
    this.networkConfig = nestedValue(data, 'networkConfig', 'network_config', NetworkConfig, new NetworkConfig());
    this.invokeConfig = nestedValue(data, 'invokeConfig', 'invoke_config', InvokeConfig, new InvokeConfig());
    this.observability = nestedValue(
      data,
      'observability',
      'observability',
      ObservabilityConfig,
      new ObservabilityConfig(),
    );
    this.artifactSource = nestedValue(
      data,
      'artifactSource',
      'artifact_source',
      ArtifactSourceConfig,
      new ArtifactSourceConfig(),
    );
    this.storageConfig = nestedValue(data, 'storageConfig', 'storage_config', StorageConfig, new StorageConfig());
    this.lifecycleConfig = nestedValue(
      data,
      'lifecycleConfig',
      'lifecycle_config',
      LifecycleConfig,
      new LifecycleConfig(),
    );
    this.environmentVariables = nestedListValue(
      data,
      'environmentVariables',
      'environment_variables',
      KeyValuePair,
      [],
    );
    this.tags = nestedListValue(data, 'tags', 'tags', KeyValuePair, []);
    applyExtras(this, data, AgentArtsRuntimeConfig.fields);
  }

  /** Convert configuration to dictionary. */
  toDict(): ConfigDict {
    return dumpPlain(this);
  }

  static fromDict(dict?: ConfigDict | null): AgentArtsRuntimeConfig {
    const data = dict ?? {};
    return new AgentArtsRuntimeConfig({
      agentId: dictValue(data, 'agent_id', 'agentId'),
      agentGatewayId: dictValue(data, 'agent_gateway_id', 'agentGatewayId'),
      arch: dictValue(data, 'arch'),
      executionAgencyName: dictValue(data, 'execution_agency_name', 'executionAgencyName'),
      identityConfiguration: dictValue(data, 'identity_configuration', 'identityConfiguration'),
      networkConfig: dictValue(data, 'network_config', 'networkConfig'),
      invokeConfig: dictValue(data, 'invoke_config', 'invokeConfig'),
      observability: dictValue(data, 'observability'),
      artifactSource: dictValue(data, 'artifact_source', 'artifactSource'),
      storageConfig: dictValue(data, 'storage_config', 'storageConfig'),
      lifecycleConfig: dictValue(data, 'lifecycle_config', 'lifecycleConfig'),
      environmentVariables: dictValue(data, 'environment_variables', 'environmentVariables'),
      tags: dictValue(data, 'tags'),
      ...extrasOf(data, AgentArtsRuntimeConfig.fields),
    });
  }
}

// ---------------------------------------------------------------------------
// YAML helpers
// ---------------------------------------------------------------------------

/** Reorder dictionary keys with the specified order first. */
function orderDict(dict: ConfigDict, keyOrder: readonly string[]): ConfigDict {
  const ordered: ConfigDict = {};
  for (const key of keyOrder) {
    if (key in dict) {
      ordered[key] = dict[key];
    }
  }
  for (const key of Object.keys(dict)) {
    if (!(key in ordered)) {
      ordered[key] = dict[key];
    }
  }
  return ordered;
}

const BASE_KEY_ORDER = [
  'name',
  'entrypoint',
  'dependency_file',
  'region',
  'platform',
  'language',
  'base_image',
];

const RUNTIME_KEY_ORDER = [
  'arch',
  'agent_gateway_id',
  'agent_id',
  'execution_agency_name',
  'invoke_config',
  'network_config',
  'identity_configuration',
  'observability',
  'artifact_source',
  'storage_config',
  'lifecycle_config',
  'environment_variables',
  'tags',
];

/** Apply the key order used by the Python `to_yaml()` implementations. */
function orderConfigForYaml(data: ConfigDict): ConfigDict {
  const orderedData = orderDict(data, ['default_agent', 'agents']);
  const agents = orderedData['agents'];
  if (agents && typeof agents === 'object') {
    const orderedAgents: ConfigDict = {};
    for (const [agentName, agentConfig] of Object.entries(agents as ConfigDict)) {
      const orderedAgent = orderDict(agentConfig as ConfigDict, ['base', 'swr_config', 'runtime']);
      if (orderedAgent['base'] && typeof orderedAgent['base'] === 'object') {
        orderedAgent['base'] = orderDict(orderedAgent['base'] as ConfigDict, BASE_KEY_ORDER);
      }
      if (orderedAgent['runtime'] && typeof orderedAgent['runtime'] === 'object') {
        orderedAgent['runtime'] = orderDict(orderedAgent['runtime'] as ConfigDict, RUNTIME_KEY_ORDER);
      }
      orderedAgents[agentName] = orderedAgent;
    }
    orderedData['agents'] = orderedAgents;
  }
  return orderedData;
}

/** Write configuration data as YAML with the Python key ordering. */
function writeConfigYaml(path: string, data: ConfigDict): void {
  writeFileSync(path, stringifyYaml(orderConfigForYaml(data)), 'utf8');
}

/** Load and validate a YAML configuration file (`yaml.safe_load` counterpart). */
function readConfigYaml(path: string): ConfigDict {
  const content = readFileSync(path, 'utf8');
  const data = parseYaml(content);
  return (data ?? {}) as ConfigDict;
}

// ---------------------------------------------------------------------------
// Top-level configuration
// ---------------------------------------------------------------------------

/**
 * Main configuration for the AgentArts toolkit.
 *
 * This is the top-level configuration that aggregates all sub-configurations.
 */
export class AgentArtsConfig {
  static readonly fields: readonly FieldPair[] = [
    ['base', 'base'],
    ['swr_config', 'swrConfig'],
    ['runtime', 'runtime'],
  ];

  [key: string]: any;

  /** Base configuration. */
  base: BaseConfig;
  /** SWR configuration. */
  swrConfig: SWRConfig;
  /** Runtime configuration. */
  runtime: AgentArtsRuntimeConfig;

  constructor(init?: Partial<AgentArtsConfig> & ConfigDict) {
    const data = init as ConfigDict | undefined;
    this.base = nestedValue(data, 'base', 'base', BaseConfig, new BaseConfig()) ?? new BaseConfig();
    this.swrConfig = nestedValue(data, 'swrConfig', 'swr_config', SWRConfig, new SWRConfig()) ?? new SWRConfig();
    this.runtime =
      nestedValue(data, 'runtime', 'runtime', AgentArtsRuntimeConfig, new AgentArtsRuntimeConfig()) ??
      new AgentArtsRuntimeConfig();
    applyExtras(this, data, AgentArtsConfig.fields);
  }

  /** Load configuration from a YAML file. */
  static fromYaml(path: string): AgentArtsConfig {
    return AgentArtsConfig.fromDict(readConfigYaml(path));
  }

  /** Save configuration to a YAML file with ordered fields. */
  toYaml(path: string): void {
    writeConfigYaml(path, this.toDict());
  }

  /** Create configuration from dictionary. */
  static fromDict(dict?: ConfigDict | null): AgentArtsConfig {
    const data = dict ?? {};
    return new AgentArtsConfig({
      base: dictValue(data, 'base'),
      swrConfig: dictValue(data, 'swr_config', 'swrConfig'),
      runtime: dictValue(data, 'runtime'),
      ...extrasOf(data, AgentArtsConfig.fields),
    });
  }

  /** Convert configuration to dictionary. */
  toDict(): ConfigDict {
    return dumpPlain(this);
  }
}

/**
 * Configuration list for multiple AgentArts runtimes.
 *
 * This is used to manage multiple agent configurations in a single file.
 */
export class AgentArtsConfigList {
  static readonly fields: readonly FieldPair[] = [
    ['default_agent', 'defaultAgent'],
    ['agents', 'agents'],
  ];

  [key: string]: any;

  /** Default AgentArts runtime name for toolkit operations. */
  defaultAgent: string | null;
  /** Dictionary of AgentArts runtime configurations. */
  agents: Record<string, AgentArtsConfig>;

  constructor(init?: Partial<AgentArtsConfigList> & ConfigDict) {
    const data = init as ConfigDict | undefined;
    this.defaultAgent = initValue(data, 'defaultAgent', 'default_agent') ?? null;
    this.agents = {};
    const rawAgents = initValue(data, 'agents');
    if (rawAgents && typeof rawAgents === 'object') {
      for (const [name, value] of Object.entries(rawAgents as ConfigDict)) {
        this.agents[name] =
          value && typeof (value as any).toDict === 'function'
            ? (value as AgentArtsConfig)
            : AgentArtsConfig.fromDict(value as ConfigDict);
      }
    }
    applyExtras(this, data, AgentArtsConfigList.fields);
  }

  /** Load configuration from a YAML file. */
  static fromYaml(path: string): AgentArtsConfigList {
    return AgentArtsConfigList.fromDict(readConfigYaml(path));
  }

  /** Save configuration to a YAML file with ordered fields. */
  toYaml(path: string): void {
    writeConfigYaml(path, this.toDict());
  }

  /** Create configuration from dictionary. */
  static fromDict(dict?: ConfigDict | null): AgentArtsConfigList {
    const data = dict ?? {};
    const agents: Record<string, AgentArtsConfig> = {};
    const rawAgents = dictValue(data, 'agents');
    if (rawAgents && typeof rawAgents === 'object') {
      for (const [name, value] of Object.entries(rawAgents as ConfigDict)) {
        agents[name] = AgentArtsConfig.fromDict(value as ConfigDict);
      }
    }
    return new AgentArtsConfigList({
      defaultAgent: dictValue(data, 'default_agent', 'defaultAgent'),
      agents,
      ...extrasOf(data, AgentArtsConfigList.fields),
    });
  }

  /** Convert configuration to dictionary. */
  toDict(): ConfigDict {
    return dumpPlain(this);
  }

  /**
   * Get agent configuration by name.
   *
   * @param name Agent name. If `null`/`undefined`, returns the default agent.
   */
  getAgent(name?: string | null): AgentArtsConfig | null {
    let agentName = name ?? null;
    if (agentName === null) {
      agentName = this.defaultAgent;
    }
    if (agentName === null) {
      return null;
    }
    return this.agents[agentName] ?? null;
  }

  /** Add (or replace) an agent configuration. */
  addAgent(name: string, config: AgentArtsConfig): void {
    this.agents[name] = config;
    if (this.defaultAgent === null) {
      this.defaultAgent = name;
    }
  }

  /** Remove an agent configuration; returns whether it existed. */
  removeAgent(name: string): boolean {
    if (Object.prototype.hasOwnProperty.call(this.agents, name)) {
      delete this.agents[name];
      if (this.defaultAgent === name) {
        this.defaultAgent = this.listAgents()[0] ?? null;
      }
      return true;
    }
    return false;
  }

  /** List all agent names. */
  listAgents(): string[] {
    return Object.keys(this.agents);
  }
}
