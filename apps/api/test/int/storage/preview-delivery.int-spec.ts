import {
  completeUploadResponseSchema,
  DOWNLOAD_URL_TTL_SECONDS,
  downloadUrlSchema,
  previewUrlResponseSchema,
} from '@nimbo/contracts';

import { StoragePreviewFacade } from '../../../src/modules/storage';
import {
  NodeNotFoundError,
  PreviewUnsupportedError,
} from '../../../src/modules/storage/domain/errors';
import { createActor, Role } from '../../../src/shared';
import type { LogLine } from '../setup/log-sink';

import { createStorageHttpApp, otherBytes, textBytes } from './storage-http';
import type { StorageClient, StorageHttpApp } from './storage-http';

const SMALL_BYTES = 2048;
const MS_PER_SECOND = 1000;
const DENIED_ORIGIN = 'https://not-allowed.example';
const PROBE_HEADERS = [
  'access-control-allow-origin',
  'access-control-allow-methods',
  'access-control-allow-headers',
  'access-control-allow-credentials',
  'access-control-expose-headers',
  'vary',
  'accept-ranges',
  'content-range',
  'content-length',
  'content-type',
  'cache-control',
  'x-content-type-options',
];

interface CorsProbe {
  readonly origin: string;
  readonly method: string;
  readonly response: Response;
}

/** Los errores de transporte no deben imprimir la URL firmada ni la causa original. */
const objectRequest = async (url: string, init?: RequestInit): Promise<Response> => {
  try {
    return await fetch(url, init);
  } catch {
    throw new Error('No se pudo consultar el origen de objetos');
  }
};

const headerTokens = (response: Response, header: string): string[] =>
  (response.headers.get(header) ?? '')
    .toLowerCase()
    .split(',')
    .map((token) => token.trim());

const expectDeliveryHeaders = (response: Response): void => {
  expect(response.headers.get('content-disposition')?.startsWith('attachment;')).toBe(true);
  expect(response.headers.get('content-type')).toBe('application/octet-stream');
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  expect(response.headers.get('set-cookie') === null).toBe(true);
};

const expectSignedPolicy = (
  signed: URL,
  timing: { readonly expiresAt: string; readonly before: number; readonly after: number },
): void => {
  expect(signed.searchParams.get('X-Amz-Expires')).toBe(String(DOWNLOAD_URL_TTL_SECONDS));
  expect(signed.searchParams.get('response-content-disposition')?.startsWith('attachment;')).toBe(
    true,
  );
  expect(signed.searchParams.get('response-content-type')).toBe('application/octet-stream');
  const expiresAt = new Date(timing.expiresAt).getTime();
  const ttlMs = DOWNLOAD_URL_TTL_SECONDS * MS_PER_SECOND;
  expect(expiresAt).toBeGreaterThanOrEqual(timing.before + ttlMs);
  expect(expiresAt).toBeLessThanOrEqual(timing.after + ttlMs);
};

const corsEvidence = (origin: string, method: string, response: Response) => ({
  origin,
  method,
  status: response.status,
  headers: Object.fromEntries(
    PROBE_HEADERS.map((header) => [header, response.headers.get(header)]),
  ),
});

const probeCors = async (url: string, origins: readonly string[]): Promise<CorsProbe[]> => {
  const probes: CorsProbe[] = [];
  for (const origin of origins) {
    for (const method of ['GET', 'OPTIONS']) {
      const headers =
        method === 'OPTIONS'
          ? {
              Origin: origin,
              'Access-Control-Request-Method': 'GET',
              'Access-Control-Request-Headers': 'range',
            }
          : { Origin: origin, Range: 'bytes=0-9' };
      const response = await objectRequest(url, { method, headers });
      await response.arrayBuffer();
      probes.push({ origin, method, response });
    }
  }
  return probes;
};

/**
 * Entrega de la vista previa con Postgres, Redis y MinIO reales (017 CA-8, CA-11): `StoragePreviewFacade` firma la
 * versión actual con la misma política que la descarga de 005 (`attachment`, `application/octet-stream`,
 * `no-store`, 300 s), sin auditar ni registrar la emisión como descarga; la descarga sigue intacta.
 */
describe('POST /files/:id/preview-url → GET a MinIO (017 CA-8, CA-11)', () => {
  let storage: StorageHttpApp;
  let facade: StoragePreviewFacade;

  beforeAll(async () => {
    storage = await createStorageHttpApp({ preview: true });
    facade = storage.testApp.app.get(StoragePreviewFacade);
  });

  afterAll(async () => {
    await storage?.close();
  });

  const uploaded = async (client: StorageClient, name: string, bytes: Buffer) => {
    const completed = await client.upload(name, bytes, 'keep_both');
    expect(completed.status).toBe(200);
    return completeUploadResponseSchema.parse(completed.body).file;
  };

  const actorOf = (client: StorageClient) => createActor(client.id, Role.CLIENT);

  const issue = async (client: StorageClient, fileId: string) => {
    const before = Date.now();
    const response = await client.previewUrl(fileId);
    const after = Date.now();
    expect(response.status).toBe(200);
    const parsed = previewUrlResponseSchema.safeParse(response.body);
    expect(parsed.success).toBe(true);
    if (!parsed.success) throw new Error('Respuesta preview inválida');
    return { delivery: parsed.data, apiHost: new URL(response.request.url).host, before, after };
  };

  const linesWith = (predicate: (line: LogLine) => boolean): LogLine[] =>
    storage.testApp.logs.lines().filter(predicate);

  it('CA-11: endpoint real, contrato, TTL 300 y GET exacto sin Authorization/Cookie ni Set-Cookie', async () => {
    const client = await storage.newClient();
    const bytes = textBytes(SMALL_BYTES);
    const file = await uploaded(client, 'notas.txt', bytes);
    const { delivery, apiHost, before, after } = await issue(client, file.id);
    const response = await objectRequest(delivery.url);

    const signed = new URL(delivery.url);
    expect(signed.host).toBe(storage.publicHost);
    expect(signed.host).not.toBe(apiHost);
    expect(signed.host).not.toBe(new URL(storage.testApp.env.WEB_PUBLIC_URL).host);
    expect(['http:', 'https:']).toContain(signed.protocol);
    expectSignedPolicy(signed, { expiresAt: delivery.expiresAt, before, after });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-length')).toBe(String(bytes.length));
    expectDeliveryHeaders(response);
    expect(Buffer.from(await response.arrayBuffer()).equals(bytes)).toBe(true);
    expect({
      id: delivery.file.id,
      kind: delivery.file.kind,
      sizeBytes: delivery.file.sizeBytes,
    }).toEqual({ id: file.id, kind: 'texto', sizeBytes: SMALL_BYTES });
  });

  it('CA-11: Range HTTP inicial y no inicial entregan 206 y exactamente el segmento del mismo objeto', async () => {
    const client = await storage.newClient();
    const bytes = textBytes(SMALL_BYTES);
    const file = await uploaded(client, 'range-fixture.txt', bytes);
    const { delivery } = await issue(client, file.id);

    for (const [start, end] of [
      [0, 9],
      [37, 63],
    ] as const) {
      const response = await objectRequest(delivery.url, {
        headers: { Range: `bytes=${String(start)}-${String(end)}` },
      });
      expect(response.status).toBe(206);
      expect(response.headers.get('content-range')).toBe(
        `bytes ${String(start)}-${String(end)}/${String(bytes.length)}`,
      );
      expect(response.headers.get('content-length')).toBe(String(end - start + 1));
      const acceptRanges = response.headers.get('accept-ranges');
      if (acceptRanges !== null) expect(acceptRanges).toBe('bytes');
      expectDeliveryHeaders(response);
      expect(Buffer.from(await response.arrayBuffer()).equals(bytes.subarray(start, end + 1))).toBe(
        true,
      );
    }
  });

  it('CA-8, CA-11: manipular la política firmada de preview rechaza el GET sin entregar los bytes', async () => {
    const client = await storage.newClient();
    const bytes = textBytes(SMALL_BYTES);
    const file = await uploaded(client, 'signature-fixture.txt', bytes);
    const { delivery } = await issue(client, file.id);
    const tampered = new URL(delivery.url);
    tampered.searchParams.set('response-content-type', 'text/html');

    const response = await objectRequest(tampered.href);

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);
    expect(Buffer.from(await response.arrayBuffer()).equals(bytes)).toBe(false);
  });

  it('CA-11: la firma de vista y la de descarga apuntan al mismo objeto con la misma política', async () => {
    const client = await storage.newClient();
    const file = await uploaded(client, 'informe.md', textBytes(SMALL_BYTES));

    const preview = new URL((await issue(client, file.id)).delivery.url);
    const download = new URL(downloadUrlSchema.parse((await client.downloadUrl(file.id)).body).url);

    expect(preview.pathname === download.pathname).toBe(true);
    // La disposición contiene el nombre privado; las otras dos políticas son valores públicos.
    expect(
      preview.searchParams.get('response-content-disposition') ===
        download.searchParams.get('response-content-disposition'),
    ).toBe(true);
    for (const param of ['response-content-type', 'response-cache-control']) {
      expect(preview.searchParams.get(param)).toBe(download.searchParams.get(param));
    }
  });

  it('CA-8: emitir y consumir preview no audita descarga; la descarga de 005 sí', async () => {
    const client = await storage.newClient();
    const file = await uploaded(client, 'vista.txt', textBytes(SMALL_BYTES));
    storage.testApp.logs.clear();

    const { delivery } = await issue(client, file.id);
    const auditEvents = () =>
      linesWith((line) => line.event === 'audit.record' || line.event === 'download.url_issued');
    expect(auditEvents().length).toBe(0);
    const response = await objectRequest(delivery.url);
    expect(response.status).toBe(200);
    await response.arrayBuffer();
    const afterPreview = auditEvents();
    await client.downloadUrl(file.id);

    expect(afterPreview.length).toBe(0);
    const audit = linesWith((line) => line.event === 'audit.record');
    expect(audit.length).toBe(1);
    expect(
      audit.some((line) =>
        expect
          .objectContaining({ action: 'file.download_url_issued', resourceId: file.id })
          .asymmetricMatch(line),
      ),
    ).toBe(true);
  });

  it('CA-10: los logs de emisión y consumo no contienen los secretos de la entrega', async () => {
    const client = await storage.newClient();
    const file = await uploaded(client, 'privacy-fixture.txt', textBytes(SMALL_BYTES));
    storage.testApp.logs.clear();
    const { delivery } = await issue(client, file.id);
    await (await objectRequest(delivery.url)).arrayBuffer();
    const signed = new URL(delivery.url);
    const logs = JSON.stringify(storage.testApp.logs.lines());

    for (const secret of [
      delivery.url,
      signed.pathname.split('/').slice(2).join('/'),
      signed.searchParams.get('X-Amz-Signature'),
      file.name,
    ]) {
      expect(typeof secret === 'string' && secret.length > 0).toBe(true);
      expect(logs.includes(secret ?? '')).toBe(false);
    }
    expect(/X-Amz-Signature|Bearer\s|Cookie/i.test(logs)).toBe(false);
  });

  it('CA-11: un tipo sin vista previa (`otro`) es 422 `STORAGE_PREVIEW_UNSUPPORTED`', async () => {
    const client = await storage.newClient();
    const file = await uploaded(client, 'respaldo.bin', otherBytes(SMALL_BYTES));

    const failure: unknown = await facade.issueUrl(actorOf(client), file.id).then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(PreviewUnsupportedError);
  });

  it('CA-5: el archivo de otra cuenta y uno inexistente son el mismo 404', async () => {
    const owner = await storage.newClient();
    const stranger = await storage.newClient();
    const file = await uploaded(owner, 'privado.txt', textBytes(SMALL_BYTES));

    const foreign: unknown = await facade.issueUrl(actorOf(stranger), file.id).then(
      () => undefined,
      (error: unknown) => error,
    );
    const missing: unknown = await facade
      .issueUrl(actorOf(owner), '7b0c4c1e-0000-4000-8000-000000000000')
      .then(
        () => undefined,
        (error: unknown) => error,
      );
    expect(foreign).toBeInstanceOf(NodeNotFoundError);
    expect(missing).toBeInstanceOf(NodeNotFoundError);
  });

  it.each(['origen permitido', 'origen denegado'] as const)(
    'CA-11: probes CORS GET/OPTIONS para %s',
    async (kind) => {
      const client = await storage.newClient();
      const file = await uploaded(client, 'cors-fixture.txt', textBytes(SMALL_BYTES));
      const { delivery } = await issue(client, file.id);
      const allowedOrigin = storage.testApp.env.CORS_ORIGIN[0];
      if (!allowedOrigin) throw new Error('Falta el origen permitido de test');
      const origin = kind === 'origen permitido' ? allowedOrigin : DENIED_ORIGIN;
      const probes = await probeCors(delivery.url, [origin]);
      const valid = probes.every(({ origin, method, response }) => {
        if (origin !== allowedOrigin) {
          return (
            response.headers.get('access-control-allow-origin') === null &&
            response.headers.get('access-control-allow-credentials') === null
          );
        }
        if (method === 'GET') expectDeliveryHeaders(response);
        return allowedCorsResponse(method, response, allowedOrigin);
      });
      if (!valid) {
        const evidence = probes.map(({ origin, method, response }) =>
          corsEvidence(origin, method, response),
        );
        throw new Error(`CORS de objetos no cumple la allowlist: ${JSON.stringify(evidence)}`);
      }
    },
  );
});

const allowedCorsResponse = (method: string, response: Response, origin: string): boolean => {
  if (response.headers.get('access-control-allow-origin') !== origin) return false;
  if (response.headers.get('access-control-allow-credentials') !== 'true') return false;
  if (method === 'OPTIONS') {
    const headers = headerTokens(response, 'access-control-allow-headers');
    return (
      response.ok &&
      headerTokens(response, 'access-control-allow-methods').includes('get') &&
      (headers.includes('range') || headers.includes('*'))
    );
  }
  const exposed = headerTokens(response, 'access-control-expose-headers');
  return (
    response.status === 206 &&
    response.headers.get('content-range') === `bytes 0-9/${String(SMALL_BYTES)}` &&
    response.headers.get('content-length') === '10' &&
    ['content-range', 'content-length', 'accept-ranges'].every((header) => exposed.includes(header))
  );
};
