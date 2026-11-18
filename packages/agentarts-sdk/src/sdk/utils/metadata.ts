/**
 * Metadata utilities for credential management.
 *
 * Mirrors `agentarts/sdk/utils/metadata.py`: an environment → profile →
 * instance-metadata credential provider chain backed by the published
 * `@huaweicloud/huaweicloud-sdk-core` credentials.
 */

import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { BasicCredentials } from '@huaweicloud/huaweicloud-sdk-core';

import { getLogger } from './logging.js';
import { ENV_HUAWEICLOUD_SDK_PROJECT_ID } from './constant.js';

const logger = getLogger('sdk.metadata_provider');

const ENV_CREDENTIALS_FILE = 'HUAWEICLOUD_SDK_CREDENTIALS_FILE';
const DEFAULT_CREDENTIALS_DIR = '.huaweicloud';
const DEFAULT_CREDENTIALS_FILE = 'credentials';

/** Error raised when no valid credentials can be found. */
export class CredentialError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CredentialError';
  }
}

export interface CredentialProvider {
  getCredentials(): BasicCredentials | Promise<BasicCredentials>;
}

/** Reads credentials from HUAWEICLOUD_SDK_* environment variables. */
export class EnvCredentialProvider implements CredentialProvider {
  getCredentials(): BasicCredentials {
    const ak = process.env.HUAWEICLOUD_SDK_AK;
    const sk = process.env.HUAWEICLOUD_SDK_SK;
    const securityToken = process.env.HUAWEICLOUD_SDK_SECURITY_TOKEN;
    const idpId = process.env.HUAWEICLOUD_SDK_IDP_ID;
    const idTokenFile = process.env.HUAWEICLOUD_SDK_ID_TOKEN_FILE;
    const projectId = process.env[ENV_HUAWEICLOUD_SDK_PROJECT_ID];

    if (!(ak && sk) && !(idpId && idTokenFile)) {
      throw new CredentialError(
        'ak&sk or idpId&idTokenFile does not exist in environmental variables',
      );
    }

    const credentials = new BasicCredentials().withProjectId(projectId);
    if (idpId && idTokenFile) {
      credentials.withIdpId(idpId).withIdTokenFile(idTokenFile);
    } else {
      credentials.withAk(ak).withSk(sk).withSecurityToken(securityToken);
    }
    return credentials;
  }
}

/** Reads credentials from `~/.huaweicloud/credentials` (INI format). */
export class ProfileCredentialProvider implements CredentialProvider {
  getCredentials(): BasicCredentials {
    const path = this._credentialsFilePath();
    if (!existsSync(path)) {
      throw new CredentialError(`credentials file '${path}' does not exist`);
    }
    const profiles = parseIni(readFileSync(path, 'utf8'));
    const profile = profiles.basic;
    if (!profile) {
      throw new CredentialError(`credential type 'basic' does not exist in credentials file '${path}'`);
    }

    const ak = profile.ak;
    const sk = profile.sk;
    const securityToken = profile.security_token;
    const idpId = profile.idp_id;
    const idTokenFile = profile.id_token_file;
    const iamEndpoint = profile.iam_endpoint;
    const projectId = profile.project_id;

    const credentials = new BasicCredentials().withProjectId(projectId);
    if (iamEndpoint) {
      credentials.withIamEndpoint(iamEndpoint);
    }
    if (idpId && idTokenFile) {
      credentials.withIdpId(idpId).withIdTokenFile(idTokenFile);
    } else if (ak && sk) {
      credentials.withAk(ak).withSk(sk).withSecurityToken(securityToken);
    } else {
      throw new CredentialError(`ak&sk or idpId&idTokenFile does not exist in credentials file '${path}'`);
    }
    return credentials;
  }

  private _credentialsFilePath(): string {
    const custom = process.env[ENV_CREDENTIALS_FILE];
    if (custom) {
      return custom;
    }
    return join(homedir(), DEFAULT_CREDENTIALS_DIR, DEFAULT_CREDENTIALS_FILE);
  }
}

/** Credential provider that fetches credentials from the instance metadata service. */
export class MetadataProvider implements CredentialProvider {
  static readonly METADATA_ENDPOINT = 'http://169.254.169.254';
  static readonly GET_SECURITY_KEY_PATH = 'v1/metadata/securitykey';
  static readonly DEFAULT_TIMEOUT_MS = 3000;

  async getCredentials(): Promise<BasicCredentials> {
    const url = `${MetadataProvider.METADATA_ENDPOINT}/${MetadataProvider.GET_SECURITY_KEY_PATH}`;
    try {
      const response = await fetch(url, {
        headers: {},
        signal: AbortSignal.timeout(MetadataProvider.DEFAULT_TIMEOUT_MS),
      });
      if (response.status < 300) {
        const metadata = (await response.json()) as Record<string, any>;
        logger.info(`Get metadata credentials with expired time: ${metadata['expires_at']}`);
        const credentials = new BasicCredentials()
          .withAk(metadata['access'])
          .withSk(metadata['secret'])
          .withSecurityToken(metadata['securitytoken']);
        const projectId = process.env[ENV_HUAWEICLOUD_SDK_PROJECT_ID];
        return projectId ? credentials.withProjectId(projectId) : credentials;
      }
      logger.warning(`Get metadata credentials failed with status: ${response.status}`);
    } catch (error) {
      logger.warning(`Failed to connect to metadata service: ${error}`);
    }

    throw new CredentialError(
      'Authentication failed: Could not find valid credentials. ' +
        'Please configure one of the following:\n' +
        '1. AK/SK Authentication: Set HUAWEICLOUD_SDK_AK, HUAWEICLOUD_SDK_SK\n' +
        '2. OIDC Token: Set HUAWEICLOUD_SDK_IDP_ID, HUAWEICLOUD_SDK_ID_TOKEN_FILE, ' +
        'and HUAWEICLOUD_SDK_PROJECT_ID\n' +
        '3. Metadata: Running on the AgentArts runtime',
    );
  }
}

/** Chains credential providers, returning the first set that resolves. */
export class CredentialProviderChain {
  constructor(private readonly providers: CredentialProvider[]) {}

  async getCredentials(): Promise<BasicCredentials> {
    let lastError: unknown;
    for (const provider of this.providers) {
      try {
        return await provider.getCredentials();
      } catch (error) {
        lastError = error;
      }
    }
    if (lastError instanceof Error) {
      throw lastError;
    }
    throw new CredentialError('Could not find valid credentials');
  }
}

/** Minimal INI parser matching configparser semantics for credentials files. */
export function parseIni(content: string): Record<string, Record<string, string>> {
  const result: Record<string, Record<string, string>> = {};
  let section: string | undefined;
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || line.startsWith(';')) {
      continue;
    }
    const sectionMatch = /^\[(.+)]$/.exec(line);
    if (sectionMatch) {
      section = sectionMatch[1].trim();
      result[section] = result[section] ?? {};
      continue;
    }
    const separatorIndex = line.search(/[=:]/);
    if (separatorIndex > 0 && section) {
      const key = line.slice(0, separatorIndex).trim();
      const value = line.slice(separatorIndex + 1).trim();
      result[section][key] = value;
    }
  }
  return result;
}

/**
 * Create credentials using the credential provider chain.
 *
 * The chain order matches Python:
 * 1. EnvCredentialProvider - reads credentials from environment variables
 * 2. ProfileCredentialProvider - reads credentials from configuration files
 * 3. MetadataProvider - reads credentials from the instance metadata service
 */
export async function createCredential(): Promise<BasicCredentials> {
  const envProvider = new EnvCredentialProvider();
  const profileProvider = new ProfileCredentialProvider();
  const chain = new CredentialProviderChain([envProvider, profileProvider, new MetadataProvider()]);
  return chain.getCredentials();
}

/**
 * Decorator that ensures credentials are available for a function.
 *
 * Python injects credentials as a keyword argument. TypeScript has no keyword
 * arguments, so the resolved credentials are appended as the final argument.
 */
export function requireCredentials(options: { key?: string } = {}) {
  const key = options.key ?? 'credentials';
  return function decorator<T extends (...args: any[]) => any>(fn: T): T {
    const wrapper = async (...args: any[]): Promise<any> => {
      const credentials = await createCredential();
      return fn(...args, { [key]: credentials });
    };
    return wrapper as unknown as T;
  };
}
