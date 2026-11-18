/**
 * AgentArts Constants and Environment Variables.
 *
 * Centralized configuration for Huawei Cloud credentials, endpoints and
 * runtime settings. All values are loaded from environment variables.
 */

export const ENV_HUAWEICLOUD_SDK_AK = 'HUAWEICLOUD_SDK_AK';
export const ENV_HUAWEICLOUD_SDK_SK = 'HUAWEICLOUD_SDK_SK';
export const ENV_HUAWEICLOUD_SDK_SECURITY_TOKEN = 'HUAWEICLOUD_SDK_SECURITY_TOKEN';
export const ENV_HUAWEICLOUD_SDK_REGION = 'HUAWEICLOUD_SDK_REGION';
export const ENV_HUAWEICLOUD_REGION = 'HUAWEICLOUD_REGION';
export const ENV_OS_REGION_NAME = 'OS_REGION_NAME';

export const ENV_HUAWEICLOUD_SDK_IDP_ID = 'HUAWEICLOUD_SDK_IDP_ID';
export const ENV_HUAWEICLOUD_SDK_ID_TOKEN_FILE = 'HUAWEICLOUD_SDK_ID_TOKEN_FILE';
export const ENV_HUAWEICLOUD_SDK_PROJECT_ID = 'HUAWEICLOUD_SDK_PROJECT_ID';

export const ENV_AGENTARTS_CONTROL_ENDPOINT = 'AGENTARTS_CONTROL_ENDPOINT';
export const ENV_AGENTARTS_RUNTIME_DATA_ENDPOINT = 'AGENTARTS_RUNTIME_DATA_ENDPOINT';
export const ENV_AGENTARTS_MEMORY_DATA_ENDPOINT = 'AGENTARTS_MEMORY_DATA_ENDPOINT';
export const ENV_AGENTARTS_CODEINTERPRETER_DATA_ENDPOINT = 'AGENTARTS_CODEINTERPRETER_DATA_ENDPOINT';
export const ENV_AGENTARTS_BROWSER_DATA_ENDPOINT = 'AGENTARTS_BROWSER_DATA_ENDPOINT';

export const ENV_HUAWEICLOUD_SDK_IAM_ENDPOINT = 'HUAWEICLOUD_SDK_IAM_ENDPOINT';
export const ENV_HUAWEICLOUD_SDK_SWR_ENDPOINT = 'HUAWEICLOUD_SDK_SWR_ENDPOINT';
export const ENV_HUAWEICLOUD_SDK_AGENTIDENTITY_ENDPOINT = 'HUAWEICLOUD_SDK_AGENTIDENTITY_ENDPOINT';

export const ENV_PYTHON_BASE_IMAGE = 'PYTHON_BASE_IMAGE';

function ensureHttps(endpoint: string): string {
  if (!endpoint) {
    return endpoint;
  }
  if (!endpoint.startsWith('http://') && !endpoint.startsWith('https://')) {
    return `https://${endpoint}`;
  }
  return endpoint;
}

/** Get the current Huawei Cloud region. */
export function getRegion(): string {
  const regionEnv = process.env[ENV_HUAWEICLOUD_SDK_REGION] || process.env[ENV_HUAWEICLOUD_REGION];
  if (regionEnv) {
    return regionEnv;
  }
  const osRegion = process.env[ENV_OS_REGION_NAME];
  if (osRegion) {
    return osRegion;
  }
  return 'cn-southwest-2';
}

/** Get the AgentArts control plane endpoint URL. */
export function getControlPlaneEndpoint(region?: string | null): string {
  const endpoint = process.env[ENV_AGENTARTS_CONTROL_ENDPOINT];
  if (endpoint) {
    return ensureHttps(endpoint);
  }
  const effectiveRegion = region || getRegion();
  return `https://agentarts.${effectiveRegion}.myhuaweicloud.com`;
}

/** Get the AgentArts runtime data plane endpoint URL. */
export function getRuntimeDataPlaneEndpoint(): string {
  return ensureHttps(process.env[ENV_AGENTARTS_RUNTIME_DATA_ENDPOINT] || '');
}

/** Get the AgentArts code interpreter data plane endpoint URL. */
export function getCodeInterpreterDataPlaneEndpoint(endpoint?: string | null): string {
  const codeEndpoint = process.env[ENV_AGENTARTS_CODEINTERPRETER_DATA_ENDPOINT];
  if (codeEndpoint) {
    return ensureHttps(codeEndpoint);
  }
  if (endpoint) {
    return ensureHttps(endpoint);
  }
  return ensureHttps(process.env[ENV_AGENTARTS_RUNTIME_DATA_ENDPOINT] || '');
}

/** Get the AgentArts browser data plane endpoint URL. */
export function getBrowserDataPlaneEndpoint(endpoint?: string | null): string {
  const browserEndpoint = process.env[ENV_AGENTARTS_BROWSER_DATA_ENDPOINT];
  if (browserEndpoint) {
    return ensureHttps(browserEndpoint);
  }
  if (endpoint) {
    return ensureHttps(endpoint);
  }
  return ensureHttps(process.env[ENV_AGENTARTS_RUNTIME_DATA_ENDPOINT] || '');
}

/** Get the AgentArts memory service endpoint URL. */
export function getMemoryEndpoint(
  endpointType: 'control' | 'data' | string = 'control',
  region?: string | null,
  _spaceId?: string | null,
): string {
  if (endpointType === 'control') {
    return getControlPlaneEndpoint(region);
  }
  if (endpointType === 'data') {
    const memoryEndpoint = process.env[ENV_AGENTARTS_MEMORY_DATA_ENDPOINT];
    if (memoryEndpoint) {
      return ensureHttps(memoryEndpoint);
    }
    const effectiveRegion = region || getRegion();
    return `https://memory.${effectiveRegion}.huaweicloud-agentarts.com`;
  }
  throw new Error(`Invalid endpoint type: ${endpointType}`);
}

/** Get the Huawei Cloud IAM endpoint URL. */
export function getIamEndpoint(region?: string | null): string {
  const endpoint = process.env[ENV_HUAWEICLOUD_SDK_IAM_ENDPOINT];
  if (endpoint) {
    return ensureHttps(endpoint);
  }
  const effectiveRegion = region || getRegion();
  return `https://iam.${effectiveRegion}.myhuaweicloud.com`;
}

/** Get the Huawei Cloud SWR endpoint URL. */
export function getSwrEndpoint(region?: string | null): string {
  const endpoint = process.env[ENV_HUAWEICLOUD_SDK_SWR_ENDPOINT];
  if (endpoint) {
    return ensureHttps(endpoint);
  }
  const effectiveRegion = region || getRegion();
  return `https://swr-api.${effectiveRegion}.myhuaweicloud.com`;
}

/** Get the Huawei Cloud Agent Identity endpoint URL. */
export function getIdentityEndpoint(region?: string | null): string {
  const endpoint = process.env[ENV_HUAWEICLOUD_SDK_AGENTIDENTITY_ENDPOINT];
  if (endpoint) {
    return ensureHttps(endpoint);
  }
  const effectiveRegion = region || getRegion();
  return `https://agent-identity.${effectiveRegion}.myhuaweicloud.com`;
}

/** Get Huawei Cloud Access Key ID from environment. */
export function getAk(): string {
  return process.env[ENV_HUAWEICLOUD_SDK_AK] || '';
}

/** Get Huawei Cloud Secret Access Key from environment. */
export function getSk(): string {
  return process.env[ENV_HUAWEICLOUD_SDK_SK] || '';
}

/** Get Huawei Cloud Security Token from environment (for STS). */
export function getSecurityToken(): string {
  return process.env[ENV_HUAWEICLOUD_SDK_SECURITY_TOKEN] || '';
}

/** Get Huawei Cloud Project ID from environment. */
export function getProjectId(): string {
  return process.env[ENV_HUAWEICLOUD_SDK_PROJECT_ID] || '';
}

/** Get Python base image from environment. */
export function getPythonBaseImage(): string {
  return process.env[ENV_PYTHON_BASE_IMAGE] || '';
}
