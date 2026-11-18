/**
 * Identity client configuration persisted to `.agent_identity.json`.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { getLogger } from '../utils/logging.js';

const logger = getLogger('identity.config');

export class Config {
  workloadIdentityName: string | null = null;
  userId: string | null = null;
  path: string;

  constructor(init?: Partial<Config>) {
    this.workloadIdentityName = init?.workloadIdentityName ?? null;
    this.userId = init?.userId ?? null;
    this.path = init?.path ?? '.agent_identity.json';
    if (init && (init as any).workload_identity_name !== undefined) {
      this.workloadIdentityName = (init as any).workload_identity_name ?? null;
    }
    if (init && (init as any).user_id !== undefined) {
      this.userId = (init as any).user_id ?? null;
    }
  }

  /** Load configuration from disk, returning defaults when unavailable. */
  static load(path = '.agent_identity.json'): Config {
    const configPath = resolve(path);
    if (existsSync(configPath)) {
      try {
        const data = JSON.parse(readFileSync(configPath, 'utf8')) as Record<string, any>;
        return new Config({
          workloadIdentityName: data['workload_identity_name'] ?? data['workloadIdentityName'],
          userId: data['user_id'] ?? data['userId'],
          path,
        });
      } catch {
        logger.warning(`Could not load existing config from ${path}`);
      }
    }
    return new Config({ path });
  }

  /** Persist the configuration to disk. */
  save(): void {
    try {
      const data: Record<string, any> = {
        workload_identity_name: this.workloadIdentityName,
        user_id: this.userId,
      };
      writeFileSync(resolve(this.path), JSON.stringify(data, null, 2), 'utf8');
    } catch {
      logger.warning(`Could not write config to ${this.path}`);
    }
  }
}
