/**
 * Abstract base class for platform adapters.
 *
 * Ported from
 * `agentarts/toolkit/plugins/memory/installer/platforms/base.py`.
 */

import { statSync } from 'node:fs';
import { normalize } from 'node:path';

import { expand } from '../utils.js';

/** Result of an installation operation. */
export class InstallResult {
  /** Platform configuration directory (normalized to native separators). */
  configDir: string;
  /** Directory holding the deployed hook scripts (may be empty). */
  scriptsDir: string;
  /** Files deployed by the installer. */
  files: string[];
  /** Configuration files created or updated by the installer. */
  configFiles: string[];

  constructor(init: {
    configDir: string;
    scriptsDir?: string;
    files?: string[];
    configFiles?: string[];
  }) {
    // Normalize all path fields to use OS-native separators (Python
    // `__post_init__`).
    this.configDir = init.configDir ? normalize(init.configDir) : init.configDir;
    this.scriptsDir = init.scriptsDir ? normalize(init.scriptsDir) : '';
    this.files = (init.files ?? []).map((file) => (file ? normalize(file) : file));
    this.configFiles = (init.configFiles ?? []).map((file) => (file ? normalize(file) : file));
  }

  /** Convert to the Python dict form (snake_case keys). */
  toDict(): Record<string, any> {
    return {
      config_dir: this.configDir,
      scripts_dir: this.scriptsDir,
      files: this.files,
      config_files: this.configFiles,
    };
  }
}

/** Abstract platform adapter for install/uninstall operations. */
export abstract class Platform {
  /** Registry key, e.g. `claude`. */
  name = '';
  /** Human-readable name, e.g. `Claude Code`. */
  display = '';
  /** True when the platform only supports user-level (global) installs. */
  fixedUserLevel = false;

  /** Detect whether this platform's config directory exists. */
  abstract detect(): boolean;

  /** Return the platform's configuration directory path. */
  abstract configDir(scope: string): string;

  /** Install the plugin for this platform. */
  abstract install(
    scope: string,
    creds: Record<string, string>,
    yes: boolean,
  ): Promise<InstallResult>;

  /** Uninstall the plugin, removing only our additions. */
  abstract uninstall(entry: Record<string, any>): Promise<void>;

  /** Helper: check whether a directory exists after path expansion. */
  static _dirExists(path: string): boolean {
    try {
      return statSync(expand(path)).isDirectory();
    } catch {
      return false;
    }
  }
}
