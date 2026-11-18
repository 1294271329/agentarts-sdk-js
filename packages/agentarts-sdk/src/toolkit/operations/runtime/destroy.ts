/**
 * Destroy agent operation.
 *
 * Ported from `agentarts/toolkit/operations/runtime/destroy.py`.
 */

import { existsSync } from 'node:fs';

import { RuntimeClient } from '../../../sdk/service/index.js';
import { getControlPlaneEndpoint, getRegion } from '../../../sdk/utils/constant.js';
import { console, echoError, echoInfo, echoSuccess } from '../../utils/common.js';
import { getAgent, getConfigFilePath } from './config.js';

export { console };

/** Convert an unknown error to a message string. */
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Options for {@link destroyAgent} (Python keyword arguments). */
export interface DestroyAgentOptions {
  /** Agent name to destroy. */
  agentName?: string | null;
  /** Huawei Cloud region. */
  region?: string | null;
  /** Skip SSL certificate verification. */
  skipSslVerification?: boolean;
}

/**
 * Destroy an agent from Huawei Cloud.
 *
 * Accepts `destroyAgent(options)`, `destroyAgent(agentName)` or
 * `destroyAgent(agentName, region, skipSslVerification)`.
 *
 * @returns `true` when the agent was deleted.
 */
export function destroyAgent(options?: DestroyAgentOptions): Promise<boolean>;
export function destroyAgent(
  agentName?: string | null,
  region?: string | null,
  skipSslVerification?: boolean,
): Promise<boolean>;
export async function destroyAgent(
  agentNameOrOptions?: string | DestroyAgentOptions | null,
  region?: string | null,
  skipSslVerification?: boolean,
): Promise<boolean> {
  const options: DestroyAgentOptions =
    typeof agentNameOrOptions === 'string' || agentNameOrOptions === null || agentNameOrOptions === undefined
      ? { agentName: agentNameOrOptions ?? null, region: region ?? null, skipSslVerification }
      : agentNameOrOptions;

  let agentName = options.agentName ?? null;
  let agentRegion = options.region ?? null;

  try {
    if (agentName === null) {
      const configPath = getConfigFilePath();
      if (existsSync(configPath)) {
        const agentConfig = getAgent(null);
        if (agentConfig !== null) {
          agentName = agentConfig.base.name;
          agentRegion = agentRegion || agentConfig.base.region;
        }
      }

      if (agentName === null) {
        echoError('No agent specified');
        return false;
      }
    }

    const actualRegion = agentRegion || getRegion();

    console.print();
    echoInfo(
      'Destroy Agent',
      `[cyan]Agent:[/cyan] [white]${agentName}[/white]\n[cyan]Region:[/cyan] [yellow]${actualRegion}[/yellow]`,
    );

    const verifySsl = !(options.skipSslVerification ?? false);
    const controlEndpoint = getControlPlaneEndpoint(actualRegion);
    const client = new RuntimeClient({ controlEndpoint, verifySsl });

    const result = await client.deleteAgentByName(agentName);

    if (result) {
      console.print();
      echoSuccess(`Agent '${agentName}' destroyed successfully`);
      return true;
    }
    echoError(`Failed to destroy agent '${agentName}'`);
    return false;
  } catch (error) {
    echoError(errorMessage(error));
    return false;
  }
}
