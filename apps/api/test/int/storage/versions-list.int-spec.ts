import { randomUUID } from 'node:crypto';

import {
  DOWNLOAD_URL_TTL_SECONDS,
  downloadUrlSchema,
  fileVersionsResponseSchema,
} from '@nimbo/contracts';
import type { FileVersionsResponse } from '@nimbo/contracts';
import request from 'supertest';
import type { Response } from 'supertest';

import { FixedClock, Role } from '../../../src/shared';
import { PROBE_CLOCK_START } from '../../support/probe.module';
import { TestAccessTokens } from '../../support/test-access-tokens';

import {
  createStorageHttpApp,
  DEFAULT_TEST_LIMITS,
  insertCommittedFile,
  sha256,
  textBytes,
} from './storage-http';
import type { StorageClient, StorageHttpApp } from './storage-http';

const API_PREFIX = '/api/v1';
const CORRELATION_HEADER = 'x-correlation-id';
const RFC_8187_FILENAME = /filename\*=UTF-8''([^;]+)/;

/** Una versión sembrada: su número, tamaño y, si es una restauración, el número de origen. */
interface SeededVersion {
  readonly number: number;
  readonly sizeBytes: number;
  readonly restoredFrom?: number;
}

interface SeededFile {
  readonly fileId: string;
  readonly name: string;
  /** Id de cada versión por número. */
  readonly versionIds: ReadonlyMap<number, string>;
  /** Contenido de cada versión por número (subido a MinIO con su clave). */
  readonly contents: ReadonlyMap<number, Buffer>;
}

/** Rutas de versiones (y de la papelera, para CA-16) con el token de una cuenta de la suite. */
interface VersionsClient {
  list(fileId: string): Promise<Response>;
  downloadUrl(fileId: string, versionId: string, correlationId?: string): Promise<Response>;
  trashFile(fileId: string): Promise<Response>;
  restoreFile(fileId: string): Promise<Response>;
}

/**
 * Historial y descarga de versiones por HTTP (014 CA-6, CA-7, CA-8, CA-11, CA-16, CA-19), con Postgres como
 * `nimbo_app` (RLS) y MinIO real. Las versiones 2…n se siembran como el dueño de las tablas: el reemplazo (T-04) y la
 * restauración (T-06) tienen sus propias suites; aquí importa leer lo que haya, también tras una poda.
 */
describe('GET /files/:fileId/versions y POST …/versions/:versionId/download-url (014)', () => {
  let storage: StorageHttpApp;
  let ana: StorageClient;
  let bruno: StorageClient;
  let anaVersions: VersionsClient;
  const tokens = new TestAccessTokens(new FixedClock(PROBE_CLOCK_START));

  const versionsClientFor = (userId: string): VersionsClient => {
    const auth = {
      Authorization: `Bearer ${tokens.valid({ userId, role: Role.CLIENT, sessionId: randomUUID() })}`,
    };
    const http = () => request(storage.testApp.app.getHttpServer());
    return {
      list: (fileId) => http().get(`${API_PREFIX}/files/${fileId}/versions`).set(auth),
      downloadUrl: (fileId, versionId, correlationId = randomUUID()) =>
        http()
          .post(`${API_PREFIX}/files/${fileId}/versions/${versionId}/download-url`)
          .set({ ...auth, [CORRELATION_HEADER]: correlationId }),
      trashFile: (fileId) => http().delete(`${API_PREFIX}/files/${fileId}`).set(auth),
      restoreFile: (fileId) => http().post(`${API_PREFIX}/trash/files/${fileId}/restore`).set(auth),
    };
  };

  beforeAll(async () => {
    storage = await createStorageHttpApp();
    ana = await storage.newClient();
    bruno = await storage.newClient();
    anaVersions = versionsClientFor(ana.id);
  });

  afterAll(async () => {
    await storage?.close();
  });

  /** Inserta la versión `seeded` de `fileId` (como el dueño), sube su contenido y la deja como actual. */
  const addVersion = async (
    ownerId: string,
    fileId: string,
    seeded: SeededVersion,
  ): Promise<{ id: string; content: Buffer }> => {
    const id = randomUUID();
    const key = `u/${ownerId}/${fileId}/${id}`;
    const content = textBytes(seeded.sizeBytes);
    await storage.putObject(key, content);
    await storage.owner.transaction(async (manager) => {
      await manager.query(
        `INSERT INTO version_archivo (id, archivo_id, origen, clave_objeto, tamano_bytes, creado_por, creada_en,
                                      numero, restaurada_de_numero)
         VALUES ($1, $2, $3, $4, $5, $6, now(), $7, $8)`,
        [
          id,
          fileId,
          seeded.restoredFrom === undefined ? 'carga' : 'restauracion',
          key,
          String(seeded.sizeBytes),
          ownerId,
          seeded.number,
          seeded.restoredFrom ?? null,
        ],
      );
      await manager.query(
        'UPDATE archivo SET version_actual_id = $1, tamano_bytes = $2 WHERE id = $3',
        [id, String(seeded.sizeBytes), fileId],
      );
    });
    return { id, content };
  };

  /** Archivo de `ownerId` con la versión 1 de `firstSize` bytes y luego las de `later`, en orden. */
  const seedFile = async (
    ownerId: string,
    firstSize: number,
    later: readonly SeededVersion[] = [],
  ): Promise<SeededFile> => {
    const name = `secreto-${randomUUID()}.txt`;
    const { fileId, versionId } = await insertCommittedFile(storage.owner, ownerId, {
      name,
      sizeBytes: BigInt(firstSize),
    });
    const first = textBytes(firstSize);
    await storage.putObject(`u/${ownerId}/${fileId}/${versionId}`, first);
    const versionIds = new Map([[1, versionId]]);
    const contents = new Map([[1, first]]);
    for (const seeded of later) {
      const added = await addVersion(ownerId, fileId, seeded);
      versionIds.set(seeded.number, added.id);
      contents.set(seeded.number, added.content);
    }
    return { fileId, name, versionIds, contents };
  };

  /** Lo que hace la poda con la fila (el objeto y el espacio no importan a estas rutas). */
  const pruneRow = (versionId: string): Promise<unknown> =>
    storage.owner.query('DELETE FROM version_archivo WHERE id = $1', [versionId]);

  const idOf = (file: SeededFile, number: number): string => {
    const id = file.versionIds.get(number);
    if (id === undefined) throw new Error(`Falta la versión ${String(number)}`);
    return id;
  };

  const historyOf = async (fileId: string): Promise<FileVersionsResponse> => {
    const response = await anaVersions.list(fileId);
    expect(response.status).toBe(200);
    return fileVersionsResponseSchema.parse(response.body);
  };

  /** Historial de cuatro versiones con la 3 restaurada de la 1 y la 1 ya podada. */
  const prunedHistory = async (): Promise<SeededFile> => {
    const file = await seedFile(ana.id, 1000, [
      { number: 2, sizeBytes: 1500 },
      { number: 3, sizeBytes: 1000, restoredFrom: 1 },
      { number: 4, sizeBytes: 1200 },
    ]);
    await pruneRow(idOf(file, 1));
    return file;
  };

  it('CA-6, CA-7, CA-20: el archivo (nombre, tipo, carpeta) y, de la más reciente a la más antigua, cambio, origen, autor por id, la actual y las retenidas', async () => {
    const file = await prunedHistory();

    const response = await anaVersions.list(file.fileId);

    expect(response.status).toBe(200);
    expect(fileVersionsResponseSchema.parse(response.body)).toEqual({
      file: { name: file.name, kind: 'pdf', folderId: null },
      retainedVersions: DEFAULT_TEST_LIMITS.retainedVersions,
      items: [
        expect.objectContaining({
          id: idOf(file, 4),
          number: 4,
          origin: 'carga',
          sizeBytes: 1200,
          deltaBytes: '200',
          restoredFromNumber: null,
          createdById: ana.id,
          isCurrent: true,
        }),
        expect.objectContaining({
          number: 3,
          origin: 'restauracion',
          deltaBytes: '-500',
          restoredFromNumber: 1,
          isCurrent: false,
        }),
        expect.objectContaining({ number: 2, deltaBytes: null, isCurrent: false }),
      ],
    });
    const body = JSON.stringify(response.body);
    expect(body).not.toContain('u/');
    expect(body).not.toContain('clave');
  });

  it('CA-6: un archivo con una sola versión la muestra como actual, sin comparación', async () => {
    const file = await seedFile(ana.id, 700);

    const history = await historyOf(file.fileId);

    expect(history.items).toEqual([
      expect.objectContaining({ number: 1, deltaBytes: null, isCurrent: true }),
    ]);
  });

  it('CA-8, CA-19: la URL de una versión retenida vale 300 s, baja sus bytes con el nombre del archivo y se audita sin nombre ni clave', async () => {
    const file = await seedFile(ana.id, 900, [{ number: 2, sizeBytes: 1300 }]);
    const correlationId = randomUUID();

    const issued = await anaVersions.downloadUrl(file.fileId, idOf(file, 1), correlationId);

    expect(issued.status).toBe(200);
    const { url } = downloadUrlSchema.parse(issued.body);
    expect(new URL(url).searchParams.get('X-Amz-Expires')).toBe(String(DOWNLOAD_URL_TTL_SECONDS));
    const downloaded = await fetch(url);
    expect(downloaded.status).toBe(200);
    const encoded = RFC_8187_FILENAME.exec(downloaded.headers.get('content-disposition') ?? '');
    expect(decodeURIComponent(encoded?.[1] ?? '')).toBe(file.name);
    expect(sha256(new Uint8Array(await downloaded.arrayBuffer()))).toBe(
      sha256(file.contents.get(1) ?? Buffer.alloc(0)),
    );

    const lines = storage.testApp.logs.withCorrelationId(correlationId);
    expect(
      lines.filter(
        (line) => line.event === 'audit.record' && line.action === 'file.download_url_issued',
      ),
    ).toEqual([
      expect.objectContaining({
        actorId: ana.id,
        resourceId: file.fileId,
        attributes: { sizeBytes: 900 },
      }),
    ]);
    const logged = JSON.stringify(lines);
    expect(logged).not.toContain(file.name);
    // El prefijo real de la clave de objeto, no `u/` suelto: un ETag en base64 puede contenerlo (PD-102 b).
    expect(logged).not.toContain(`u/${ana.id}/`);
    expect(logged).not.toContain('X-Amz-Signature');
  });

  it('CA-11: una versión podada, de otro archivo, ajena o malformada es `404 STORAGE_VERSION_NOT_FOUND`', async () => {
    const file = await prunedHistory();
    const other = await seedFile(ana.id, 400);
    const foreign = await seedFile(bruno.id, 400);

    const responses = await Promise.all([
      anaVersions.downloadUrl(file.fileId, idOf(file, 1)),
      anaVersions.downloadUrl(file.fileId, idOf(other, 1)),
      anaVersions.downloadUrl(file.fileId, idOf(foreign, 1)),
      anaVersions.downloadUrl(file.fileId, randomUUID()),
      anaVersions.downloadUrl(file.fileId, 'no-es-uuid'),
    ]);

    for (const response of responses) {
      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({ code: 'STORAGE_VERSION_NOT_FOUND' });
    }
  });

  it('CA-16: un archivo ajeno es `404 STORAGE_NODE_NOT_FOUND` en historial y descarga', async () => {
    const foreign = await seedFile(bruno.id, 400);

    const listed = await anaVersions.list(foreign.fileId);
    const issued = await anaVersions.downloadUrl(foreign.fileId, idOf(foreign, 1));

    expect(listed.status).toBe(404);
    expect(listed.body).toMatchObject({ code: 'STORAGE_NODE_NOT_FOUND' });
    expect(issued.status).toBe(404);
    expect(issued.body).toMatchObject({ code: 'STORAGE_NODE_NOT_FOUND' });
  });

  it('CA-16: en la papelera el historial y la descarga son `404 STORAGE_NODE_NOT_FOUND`; al restaurarlo conserva su historial', async () => {
    const file = await prunedHistory();
    const before = await historyOf(file.fileId);

    expect((await anaVersions.trashFile(file.fileId)).status).toBe(200);
    const listed = await anaVersions.list(file.fileId);
    const issued = await anaVersions.downloadUrl(file.fileId, idOf(file, 2));
    expect(listed.status).toBe(404);
    expect(listed.body).toMatchObject({ code: 'STORAGE_NODE_NOT_FOUND' });
    expect(issued.status).toBe(404);
    expect(issued.body).toMatchObject({ code: 'STORAGE_NODE_NOT_FOUND' });

    expect((await anaVersions.restoreFile(file.fileId)).status).toBe(200);
    await expect(historyOf(file.fileId)).resolves.toEqual(before);
  });
});
