/**
 * Wire-level (local HTTP server) tests for upload-files content-type routing.
 *
 * Ported 1:1 from `tests/integration/test_upload_content_type_local.py`.
 *
 * These do NOT hit Huawei Cloud. A real `RuntimeClient` (default
 * `SDK_HMAC_SHA256` => `openAkSk=false` => no signing) is pointed at a local
 * `node:http` server so we can assert the on-the-wire `Content-Type` header and
 * request body for each upload shape.
 *
 * Why this exists: tar uploads must go on the `application/x-tar` channel.
 * Sending a tar as `application/octet-stream` made the gateway tear the TLS
 * connection down before the server could emit a clean error, masking the real
 * business error (e.g. "no session") behind a low-level transport error.
 */

import { once } from 'node:events';
import { writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

import { afterAll, beforeAll, describe, it, expect } from 'vitest';

import { RuntimeClient } from 'agentarts-sdk/sdk/service/runtime-client';
import { SESSION_HEADER } from 'agentarts-sdk/sdk/runtime/model';

import { findFreePort, makeTempDir, removeTempDir } from './_helpers.js';

interface Recorded {
  method: string | null;
  path: string | null;
  headers: Record<string, string>;
  body: Buffer;
  respondStatus: number;
  respondJson: Record<string, any>;
}

interface LocalServer {
  baseUrl: string;
  recorded: Recorded;
  client: RuntimeClient;
  close(): Promise<void>;
}

function newRecorded(status = 200, payload: Record<string, any> | null = null): Recorded {
  return {
    method: null,
    path: null,
    headers: {},
    body: Buffer.alloc(0),
    respondStatus: status,
    respondJson: payload ?? { status: 'uploaded' },
  };
}

/** Start a local HTTP server that records the last request. */
async function startLocalServer(recorded: Recorded = newRecorded()): Promise<LocalServer> {
  const port = await findFreePort();
  const server: Server = createServer((request: IncomingMessage, response: ServerResponse) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => {
      chunks.push(Buffer.from(chunk));
    });
    request.on('end', () => {
      recorded.method = request.method ?? null;
      recorded.path = request.url ?? null;
      recorded.headers = Object.fromEntries(
        Object.entries(request.headers).map(([key, value]) => [
          key.toLowerCase(),
          Array.isArray(value) ? value.join(',') : String(value ?? ''),
        ]),
      );
      recorded.body = Buffer.concat(chunks);
      const body = Buffer.from(JSON.stringify(recorded.respondJson));
      response.writeHead(recorded.respondStatus, {
        'content-type': 'application/json',
        'content-length': String(body.length),
      });
      response.end(body);
    });
  });

  server.listen(port, '127.0.0.1');
  await once(server, 'listening');

  const baseUrl = `http://127.0.0.1:${port}`;
  return {
    baseUrl,
    recorded,
    client: new RuntimeClient({ dataEndpoint: baseUrl, verifySsl: false }),
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections?.();
        server.close(() => resolve());
      }),
  };
}

/** Run `fn` against a fresh recording server, closing it afterwards. */
async function withLocalServer(
  fn: (server: LocalServer) => Promise<void>,
  recorded: Recorded = newRecorded(),
): Promise<void> {
  const server = await startLocalServer(recorded);
  try {
    await fn(server);
  } finally {
    await server.close();
  }
}

/** Extract the `path` query param the client sent to the upload endpoint. */
function pathQuery(recorded: Recorded): string {
  const parsed = new URL(recorded.path ?? '/', 'http://localhost');
  return parsed.searchParams.get('path') ?? '';
}

/**
 * Build a minimal tar archive.
 *
 * `ustar` puts `ustar\0` + `00` at offset 257, GNU puts `ustar  \0`, PAX is a
 * POSIX/ustar archive — the SDK sniffs the `ustar` magic at offset 257.
 */
function makeTar(format: 'ustar' | 'gnu' | 'pax' = 'ustar', content = 'hello tar'): Buffer {
  const data = Buffer.from(content, 'utf8');
  const header = Buffer.alloc(512, 0);

  header.write('inside.txt', 0, 'utf8');
  header.write('0000644\0', 100, 'ascii'); // mode
  header.write('0000000\0', 108, 'ascii'); // uid
  header.write('0000000\0', 116, 'ascii'); // gid
  header.write(`${data.length.toString(8).padStart(11, '0')}\0`, 124, 'ascii'); // size
  header.write('00000000000\0', 136, 'ascii'); // mtime
  header.write('        ', 148, 'ascii'); // checksum placeholder
  header.write('0', 156, 'ascii'); // typeflag
  if (format === 'gnu') {
    header.write('ustar  \0', 257, 'latin1'); // GNU magic (+empty version)
  } else {
    header.write('ustar\0', 257, 'latin1'); // POSIX magic
    header.write('00', 263, 'ascii'); // POSIX version
  }

  let checksum = 0;
  for (const byte of header) {
    checksum += byte;
  }
  header.write(`${checksum.toString(8).padStart(6, '0')}\0 `, 148, 'ascii');

  const padding = Buffer.alloc((512 - (data.length % 512)) % 512, 0);
  const trailer = Buffer.alloc(1024, 0);
  return Buffer.concat([header, data, padding, trailer]);
}

async function writeTar(path: string, format: 'ustar' | 'gnu' | 'pax' = 'ustar'): Promise<Buffer> {
  const archive = makeTar(format);
  await writeFile(path, archive);
  return archive;
}

describe('upload content type routing (local, no credentials)', () => {
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = await makeTempDir('aa-it-upload-');
  });

  afterAll(async () => {
    await removeTempDir(tmpDir);
  });

  it('single .tar file routes to application/x-tar and keeps the directory path', async () => {
    const tarPath = join(tmpDir, 'payload.tar');
    const tarBytes = await writeTar(tarPath);

    await withLocalServer(async ({ client, recorded }) => {
      const result = await client.uploadFiles(
        'test-agent',
        'sess-1',
        [{ localFile: tarPath }],
        { path: '/tmp/' },
      );

      expect(recorded.headers['content-type']).toBe('application/x-tar');
      expect(recorded.body.equals(tarBytes)).toBe(true); // body streamed intact
      expect(recorded.headers[SESSION_HEADER]).toBe('sess-1');
      // x-tar backend extracts into a directory: path must stay "/tmp/", not be
      // turned into "/tmp/payload.tar" (rejected by the gateway with
      // "path must be a directory ending with '/'").
      expect(pathQuery(recorded)).toBe('/tmp/');
      expect(result['status']).toBe('uploaded');
    });
  });

  it('single .tar file with a path without trailing slash gets one', async () => {
    const tarPath = join(tmpDir, 'payload.tar');
    await writeTar(tarPath);

    await withLocalServer(async ({ client, recorded }) => {
      await client.uploadFiles(
        'test-agent',
        'sess-1',
        [{ localFile: tarPath, path: '/data' }],
        { path: '/tmp/' },
      );

      // tar requires a directory ending with '/'; ensure it is normalized.
      expect(pathQuery(recorded)).toBe('/data/');
    });
  });

  it('single non-tar file uses the full remote file path', async () => {
    const plainPath = join(tmpDir, 'notes.txt');
    await writeFile(plainPath, Buffer.from('plain'));

    await withLocalServer(async ({ client, recorded }) => {
      await client.uploadFiles(
        'test-agent',
        'sess-3',
        [{ localFile: plainPath }],
        { path: '/tmp/' },
      );

      // octet-stream: path is the full remote file path (dir + filename).
      expect(pathQuery(recorded)).toBe('/tmp/notes.txt');
    });
  });

  for (const [format, name] of [
    ['gnu', 'payload.gnu'],
    ['pax', 'payload.pax'],
  ] as const) {
    it(`tar is detected by magic for a ${name} file without a .tar suffix`, async () => {
      const tarPath = join(tmpDir, name); // no .tar suffix
      await writeTar(tarPath, format);

      await withLocalServer(async ({ client, recorded }) => {
        await client.uploadFiles(
          'test-agent',
          'sess-2',
          [{ localFile: tarPath }],
          { path: '/tmp/' },
        );

        expect(recorded.headers['content-type']).toBe('application/x-tar');
      });
    });
  }

  it('non-tar file stays on application/octet-stream', async () => {
    const plainPath = join(tmpDir, 'notes.txt');
    const plainBytes = Buffer.from([...Buffer.from('plain text payload '), 0x00, 0x01, 0x02]);
    await writeFile(plainPath, plainBytes);

    await withLocalServer(async ({ client, recorded }) => {
      await client.uploadFiles(
        'test-agent',
        'sess-3',
        [{ localFile: plainPath }],
        { path: '/tmp/' },
      );

      expect(recorded.headers['content-type']).toBe('application/octet-stream');
      expect(recorded.body.equals(plainBytes)).toBe(true);
    });
  });

  it('compressed tarball is not misdetected as x-tar', async () => {
    // .tar.gz is gzip, not a raw tar — it must NOT claim application/x-tar.
    const gzPath = join(tmpDir, 'payload.tar.gz');
    await writeFile(gzPath, gzipSync(Buffer.from('not a raw tar')));

    await withLocalServer(async ({ client, recorded }) => {
      await client.uploadFiles(
        'test-agent',
        'sess-4',
        [{ localFile: gzPath }],
        { path: '/tmp/' },
      );

      expect(recorded.headers['content-type']).toBe('application/octet-stream');
    });
  });

  it('multipart mixed tar and plain assembles both', async () => {
    const tarPath = join(tmpDir, 'payload.tar');
    await writeTar(tarPath);
    const plainPath = join(tmpDir, 'notes.txt');
    await writeFile(plainPath, Buffer.from([...Buffer.from('plain text payload '), 0x00, 0x01, 0x02]));

    await withLocalServer(async ({ client, recorded }) => {
      await client.uploadFiles(
        'test-agent',
        'sess-5',
        [{ localFile: tarPath }, { localFile: plainPath }],
        { path: '/tmp/' },
      );

      expect(recorded.headers['content-type'].startsWith('multipart/form-data')).toBe(true);
      expect(recorded.body.includes(Buffer.from('payload.tar'))).toBe(true);
      expect(recorded.body.includes(Buffer.from('notes.txt'))).toBe(true);
      expect(recorded.body.includes(Buffer.from('plain text payload'))).toBe(true);
    });
  });

  it('error response surfaces the real message, not a transport mask', async () => {
    // The original bug: a bad session produced a masked TLS/SSL error instead of
    // the server's real error. With the correct content-type the server returns
    // a clean HTTP error that uploadFiles surfaces verbatim.
    const tarPath = join(tmpDir, 'payload.tar');
    await writeTar(tarPath);

    const recorded = newRecorded(404, { error: 'no session: sess-bad' });
    await withLocalServer(async ({ client }) => {
      await expect(
        client.uploadFiles(
          'test-agent',
          'sess-bad',
          [{ localFile: tarPath }],
          { path: '/tmp/' },
        ),
      ).rejects.toThrow(/no session: sess-bad/);
    }, recorded);
  });
});
