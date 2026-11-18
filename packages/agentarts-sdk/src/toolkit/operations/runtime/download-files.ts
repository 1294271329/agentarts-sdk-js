/**
 * Runtime download-files operation.
 *
 * Ported from `agentarts/toolkit/operations/runtime/download_files.py`.
 *
 * Python extracts recursive downloads with `tarfile`; Node has no built-in tar
 * support and the port must not add dependencies, so {@link extractTarArchive}
 * implements the small ustar/pax subset the runtime produces (regular files,
 * directories, symlinks and GNU/PAX long names).
 */

import { chmodSync, existsSync, mkdirSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';

import { SignMode } from '../../../sdk/service/http-client.js';
import { RuntimeClient } from '../../../sdk/service/runtime-client.js';
import { echoError } from '../../utils/common.js';
import { ValidationError } from './errors.js';
import { _checkFileTransferEnabled, _getDataEndpoint, _resolveAgentInfo } from './invoke.js';

/** Loose dictionary matching `dict[str, Any]` (JSON object). */
type Dict = Record<string, any>;

/** Read a NUL-terminated (or field-bounded) string out of a tar header. */
function readTarString(buffer: Buffer, offset: number, length: number): string {
  const slice = buffer.subarray(offset, offset + length);
  const nul = slice.indexOf(0);
  const end = nul === -1 ? slice.length : nul;
  return slice.subarray(0, end).toString('utf8');
}

/** Whether a 512-byte block is entirely zero (end-of-archive marker). */
function isZeroBlock(block: Buffer): boolean {
  for (const byte of block) {
    if (byte !== 0) {
      return false;
    }
  }
  return true;
}

/** Parse a PAX extended header (`<len> <key>=<value>\n` records). */
function parsePaxRecords(data: Buffer): Record<string, string> {
  const records: Record<string, string> = {};
  let offset = 0;
  while (offset < data.length) {
    const space = data.indexOf(0x20, offset);
    if (space === -1) {
      break;
    }
    const lengthText = data.subarray(offset, space).toString('utf8').trim();
    const recordLength = Number.parseInt(lengthText, 10);
    if (!Number.isFinite(recordLength) || recordLength <= 0) {
      break;
    }
    const record = data.subarray(space + 1, offset + recordLength - 1).toString('utf8');
    const equals = record.indexOf('=');
    if (equals > 0) {
      records[record.slice(0, equals)] = record.slice(equals + 1);
    }
    offset += recordLength;
  }
  return records;
}

/**
 * Extract a (possibly pax/GNU) tar archive into `outputDir`.
 *
 * Paths escaping `outputDir` are skipped, matching the safety expectation of
 * `tarfile.extractall()` without a filter.
 */
export function extractTarArchive(archive: Uint8Array, outputDir: string): void {
  const buffer = Buffer.from(archive);
  const root = resolve(outputDir);
  mkdirSync(root, { recursive: true });

  let offset = 0;
  let pendingLongName: string | null = null;
  let pendingLongLinkName: string | null = null;
  let pendingPaxPath: string | null = null;
  let pendingPaxLinkPath: string | null = null;

  /** Resolve an entry path inside `root`, or `null` when it escapes. */
  const safePath = (entryPath: string): string | null => {
    const target = resolve(root, entryPath);
    if (target === root || target.startsWith(root + sep)) {
      return target;
    }
    return null;
  };

  while (offset + 512 <= buffer.length) {
    const header = buffer.subarray(offset, offset + 512);
    if (isZeroBlock(header)) {
      break;
    }

    const name = readTarString(header, 0, 100);
    const modeText = readTarString(header, 100, 8).trim();
    const sizeText = readTarString(header, 124, 12).trim();
    const typeflag = String.fromCharCode(header[156] ?? 0);
    const linkName = readTarString(header, 157, 100);
    const prefix = readTarString(header, 345, 155);

    const size = sizeText ? Number.parseInt(sizeText, 8) : 0;
    const mode = modeText ? Number.parseInt(modeText, 8) : 0;

    offset += 512;
    const data = buffer.subarray(offset, offset + size);
    offset += Math.ceil(size / 512) * 512;

    if (typeflag === 'L') {
      pendingLongName = readTarString(data, 0, data.length);
      continue;
    }
    if (typeflag === 'K') {
      pendingLongLinkName = readTarString(data, 0, data.length);
      continue;
    }
    if (typeflag === 'x' || typeflag === 'g') {
      const records = parsePaxRecords(data);
      if (records['path']) {
        pendingPaxPath = records['path'];
      }
      if (records['linkpath']) {
        pendingPaxLinkPath = records['linkpath'];
      }
      continue;
    }

    const entryName =
      pendingPaxPath ?? pendingLongName ?? (prefix ? `${prefix}/${name}` : name);
    pendingPaxPath = null;
    pendingLongName = null;

    if (!entryName) {
      continue;
    }

    const target = safePath(entryName);
    if (target === null) {
      continue;
    }

    if (typeflag === '5') {
      mkdirSync(target, { recursive: true });
      continue;
    }

    if (typeflag === '2') {
      const linkTarget = pendingPaxLinkPath ?? pendingLongLinkName ?? linkName;
      pendingPaxLinkPath = null;
      pendingLongLinkName = null;
      mkdirSync(dirname(target), { recursive: true });
      try {
        symlinkSync(linkTarget, target);
      } catch {
        // Existing/link-unsupported filesystems: skip the entry.
      }
      continue;
    }

    if (typeflag === '0' || typeflag === '' || typeflag === '\0' || typeflag === '7') {
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, data);
      if (mode > 0) {
        try {
          chmodSync(target, mode & 0o777);
        } catch {
          // Ignore permission errors (e.g. on Windows).
        }
      }
      continue;
    }
    // Hard links ('1') and other special entries are not materialized.
  }
}

/** Whether `path` exists and is a directory. */
function isDirectory(path: string): boolean {
  try {
    return existsSync(path) && statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/** Options for {@link downloadRuntimeFiles} (Python keyword arguments). */
export interface DownloadRuntimeFilesOptions {
  /** Agent name. */
  agentName?: string | null;
  /** Session ID (required). */
  sessionId?: string | null;
  /** Remote file/directory path (required). */
  path?: string | null;
  /** Local output path. */
  output?: string | null;
  /** Download a directory as a tar archive. */
  recursive?: boolean;
  /** Optional bearer token. */
  bearerToken?: string | null;
  /** Region name. */
  region?: string | null;
  /** Optional endpoint name. */
  endpoint?: string | null;
  /** Skip SSL certificate verification. */
  skipSslVerification?: boolean;
  /** User ID for OAuth2 outbound credentials. */
  userId?: string | null;
  /** Request timeout in seconds. */
  timeout?: number;
}

/**
 * Download files from the runtime.
 *
 * @returns A result object with `saved_path`, `size`, `content_type` and `path`
 *   (the Python result dictionary uses these wire names).
 * @throws {Error} When required arguments are missing or the download fails.
 */
export async function downloadRuntimeFiles(
  options: DownloadRuntimeFilesOptions = {},
): Promise<Dict> {
  const remotePath = options.path ?? '';
  if (!remotePath) {
    throw new ValidationError('Path is required (--path)');
  }

  const sessionId = options.sessionId ?? null;
  if (sessionId === null) {
    throw new ValidationError('Session ID is required (--session)');
  }

  const [agentName, region, agentId, authType] = _resolveAgentInfo(
    options.agentName ?? null,
    options.region ?? null,
  );

  if (agentName === null) {
    echoError('No agent specified and no default agent configured');
    throw new ValidationError('Agent name is required');
  }

  const verifySsl = !(options.skipSslVerification ?? false);

  await _checkFileTransferEnabled(agentName, region || '', agentId, verifySsl);

  const dataEndpoint = await _getDataEndpoint(agentName, region || '', agentId, verifySsl);

  if (!dataEndpoint) {
    throw new ValidationError(`No data endpoint for agent ${agentName}`);
  }

  let signMode = SignMode.SDK_HMAC_SHA256;
  if (authType && authType.toUpperCase() === 'IAM') {
    signMode = SignMode.V11_HMAC_SHA256;
  }

  const client = new RuntimeClient({
    dataEndpoint,
    regionId: region || '',
    verifySsl,
    signMode,
  });
  const bearerToken = options.bearerToken ?? null;
  if (bearerToken) {
    client.setAuthToken(bearerToken);
  }

  const recursive = options.recursive ?? false;
  const timeout = options.timeout ?? 900;

  const result = await client.downloadFiles(agentName, sessionId, remotePath, {
    recursive,
    bearerToken,
    endpoint: options.endpoint ?? null,
    userId: options.userId ?? null,
    timeout,
  });

  if (!result.success) {
    throw new Error(`Download failed: ${result.error}`);
  }

  const filename = remotePath ? remotePath.split('/').slice(-1)[0] : 'downloaded';
  let output = options.output || filename || 'downloaded';

  let savedPath = '';
  let totalSize = 0;
  const contentType = result.contentType;

  try {
    if (recursive && contentType.includes('application/x-tar')) {
      mkdirSync(output, { recursive: true });

      const chunks: Buffer[] = [];
      for await (const chunk of result.iterBytes()) {
        chunks.push(Buffer.from(chunk));
        totalSize += chunk.length;
      }

      extractTarArchive(Buffer.concat(chunks), output);
      savedPath = output;
    } else {
      if (isDirectory(output) || output.endsWith('/') || output.endsWith('\\')) {
        mkdirSync(output, { recursive: true });
        output = join(output, filename);
      }

      const chunks: Buffer[] = [];
      for await (const chunk of result.iterBytes()) {
        chunks.push(Buffer.from(chunk));
        totalSize += chunk.length;
      }
      writeFileSync(output, Buffer.concat(chunks));
      savedPath = output;
    }
  } finally {
    result.close();
  }

  return {
    saved_path: savedPath,
    size: totalSize,
    content_type: contentType,
    path: remotePath,
  };
}
