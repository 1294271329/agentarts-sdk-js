/**
 * AgentArts Runtime Models.
 *
 * Defines constants, enumerations and data models used by the runtime
 * application.
 */

export const SESSION_HEADER = 'x-hw-agentarts-session-id';
export const ACCESS_TOKEN_HEADER = 'X-HW-AgentGateway-Workload-Access-Token';
export const USER_ID_HEADER = 'X-HW-AgentGateway-User-Id';

export const CUSTOM_HEADER_PREFIX = 'X-Hw-AgentArts-Runtime-Custom-';

/**
 * Health status of the AgentArts runtime.
 */
export enum PingStatus {
  INITING = 'Initing',
  HEALTHY = 'Healthy',
  HEALTHY_BUSY = 'HealthyBusy',
  UNHEALTHY = 'Unhealthy',
}

/**
 * Normalize a ping status value (enum member or raw string) to a PingStatus.
 */
export function toPingStatus(value: PingStatus | string | null | undefined): PingStatus | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === 'string') {
    return Object.values(PingStatus).find((item) => item === value);
  }
  return value as PingStatus;
}
