import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';

import { INDEXING_EVENTS } from '@nimbo/contracts';
import type { Socket as ClientSocket } from 'socket.io-client';
import request from 'supertest';
import type { Response } from 'supertest';

import { RealtimeModule } from '../../../src/modules/realtime';
import { REALTIME_CONFIG } from '../../../src/modules/realtime/application/realtime-config';
import { Role, SystemClock } from '../../../src/shared';
import { TestAccessTokens } from '../../support/test-access-tokens';
import {
  collectEvents,
  connectClient,
  TestAccessTokenVerifierModule,
  testRealtimeConfig,
  waitForConnect,
} from '../realtime/realtime-test-app';
import type { StorageClient } from '../storage/storage-http';

import { createIndexingWorld, eventually } from './indexing-world';
import type { IndexingWorld, UploadedFile } from './indexing-world';

const API_PREFIX = '/api/v1';
/** Límite bajo de «Reintentar» por usuario y minuto para agotarlo en pocas solicitudes (plan §4). */
const TEST_RETRIES_PER_MINUTE = 3;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PNG_BODY_BYTES = 2048;
const NOT_FOUND = { status: 404, code: 'STORAGE_NODE_NOT_FOUND' };

/** Cuerpo de error sin el `correlationId`, que cambia en cada solicitud. */
const withoutCorrelation = (response: Response): Record<string, unknown> => {
  const { correlationId: _ignored, ...rest } = response.body as Record<string, unknown>;
  return rest;
};

const txt = (text: string): Buffer => Buffer.from(text, 'utf8');
const png = (): Buffer => Buffer.concat([PNG_SIGNATURE, Buffer.alloc(PNG_BODY_BYTES, 0x41)]);
const unique = (name: string): string => `${randomUUID()}-${name}`;

/** Código y estado HTTP de una respuesta, para comparar errores en una sola línea. */
const errorOf = (response: Response): { status: number; code: unknown } => ({
  status: response.status,
  code: (response.body as { code?: unknown }).code,
});

/**
 * Estado, «Reintentar» y aviso en vivo de la indexación (019 T-07, plan §4): el `api` real con `StorageModule`,
 * `IntelligenceModule` y el canal de 015 escuchando en un puerto efímero, y el `worker` real que indexa y publica en
 * `index-status`; Postgres como `nimbo_app`, Redis y MinIO reales. Antes de 012 el único con acceso es la propietaria:
 * editor y lector se prueban en `index-status.service.spec.ts` y en la 012 (PD-120).
 */
describe('estado y «Reintentar» de la indexación (019 CA-13, CA-14, CA-15, CA-18, CA-20)', () => {
  let world: IndexingWorld;
  let url: string;
  const clock = new SystemClock();
  const socketTokens = new TestAccessTokens(clock);
  const sockets: ClientSocket[] = [];

  beforeAll(async () => {
    world = await createIndexingWorld({
      realtime: (env) =>
        RealtimeModule.forRoot(env, TestAccessTokenVerifierModule.withClock(clock)),
      api: {
        env: { RATE_LIMIT_INDEX_RETRY_PER_MINUTE: String(TEST_RETRIES_PER_MINUTE) },
        overrides: [{ provide: REALTIME_CONFIG, useValue: testRealtimeConfig() }],
        withRealtime: true,
      },
    });
    const { app } = world.storage.testApp;
    await app.listen(0);
    const { port } = app.getHttpServer().address() as AddressInfo;
    url = `http://127.0.0.1:${String(port)}`;
  });

  beforeEach(() => {
    world.embedder.reset();
  });

  afterEach(() => {
    sockets.splice(0).forEach((socket) => socket.disconnect());
  });

  afterAll(async () => {
    await world?.close();
  });

  const http = () => request(world.storage.testApp.app.getHttpServer());
  const authOf = (client: StorageClient) => ({
    Authorization: `Bearer ${world.storage.tokenOf(client.id) ?? ''}`,
  });
  const statusOf = (client: StorageClient, fileId: string) =>
    http().get(`${API_PREFIX}/files/${fileId}/indexing`).set(authOf(client));
  const retry = (client: StorageClient, fileId: string) =>
    http().post(`${API_PREFIX}/files/${fileId}/indexing/retry`).set(authOf(client));
  const restore = (client: StorageClient, fileId: string) =>
    http().post(`${API_PREFIX}/trash/files/${fileId}/restore`).set(authOf(client));

  const settledUpload = async (
    client: StorageClient,
    name: string,
    bytes: Buffer,
  ): Promise<UploadedFile> => {
    const file = await world.upload(client, unique(name), bytes);
    await world.settled(file.versionId);
    await world.settledNoticesOf(file.fileId);
    return file;
  };

  /** `fallido` sin clave del proveedor, con el trabajo ya borrado de la cola (si no, `jobId` = versión lo absorbería). */
  const failedUpload = async (client: StorageClient): Promise<UploadedFile> => {
    world.embedder.mode = 'keyless';
    const file = await settledUpload(client, 'informe.txt', txt('Informe del trimestre.'));
    await eventually(async () =>
      (await world.indexingQueue.getJob(file.versionId)) === undefined ? true : null,
    );
    world.embedder.mode = 'up';
    return file;
  };

  const connect = async (userId: string): Promise<ClientSocket> => {
    const socket = connectClient(url, { token: socketTokens.forRole(Role.CLIENT, userId) });
    sockets.push(socket);
    await waitForConnect(socket);
    return socket;
  };

  const setState = (versionId: string, state: string): Promise<unknown> =>
    world.storage.owner.query(
      'UPDATE indexacion SET estado = $2, motivo = NULL WHERE version_archivo_id = $1',
      [versionId, state],
    );

  describe('GET /files/:fileId/indexing', () => {
    it('CA-14: `indexado` sin motivo ni «Reintentar» y con la fecha del último cambio', async () => {
      const ana = await world.storage.newClient();
      const file = await settledUpload(ana, 'notas.txt', txt('Notas de la reunión.'));

      const response = await statusOf(ana, file.fileId);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        state: 'indexado',
        reason: null,
        updatedAt: expect.any(String),
        canRetry: false,
      });
    });

    it('CA-14: `no_indexable` con su motivo y sin «Reintentar»', async () => {
      const ana = await world.storage.newClient();
      const file = await settledUpload(ana, 'vacio.txt', txt('   \n\n  '));

      const response = await statusOf(ana, file.fileId);

      expect(response.body).toMatchObject({
        state: 'no_indexable',
        reason: 'sin_texto',
        canRetry: false,
      });
    });

    it('CA-13, CA-14: `fallido` con su motivo y «Reintentar» para la propietaria', async () => {
      const ana = await world.storage.newClient();
      const file = await failedUpload(ana);

      const response = await statusOf(ana, file.fileId);

      expect(response.body).toMatchObject({
        state: 'fallido',
        reason: 'proveedor_no_disponible',
        canRetry: true,
      });
    });

    it.each(['pendiente', 'indexando'])('CA-14: `%s` sin motivo', async (state) => {
      const ana = await world.storage.newClient();
      const file = await settledUpload(ana, 'acta.txt', txt('Acta de la asamblea.'));
      await setState(file.versionId, state);

      const response = await statusOf(ana, file.fileId);

      expect(response.body).toMatchObject({ state, reason: null, canRetry: false });
    });

    it('plan §4: indexable y sin fila todavía es `pendiente` sin fecha', async () => {
      const ana = await world.storage.newClient();
      const file = await settledUpload(ana, 'plan.txt', txt('Plan comercial.'));
      await world.storage.owner.query('DELETE FROM indexacion WHERE version_archivo_id = $1', [
        file.versionId,
      ]);

      const response = await statusOf(ana, file.fileId);

      expect(response.body).toEqual({
        state: 'pendiente',
        reason: null,
        updatedAt: null,
        canRetry: false,
      });
    });

    it('CA-6: un tipo que no se indexa responde `state: null`', async () => {
      const ana = await world.storage.newClient();
      const file = await world.upload(ana, unique('foto.png'), png());

      const response = await statusOf(ana, file.fileId);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        state: null,
        reason: null,
        updatedAt: null,
        canRetry: false,
      });
    });

    it('CA-18: ajeno, en la papelera, inexistente o con id inválido → el mismo 404', async () => {
      const ana = await world.storage.newClient();
      const bea = await world.storage.newClient();
      const file = await settledUpload(ana, 'contrato.txt', txt('Contrato de servicio.'));
      const trashed = await settledUpload(ana, 'borrador.txt', txt('Borrador.'));
      expect((await ana.trashFile(trashed.fileId)).status).toBe(200);

      const responses = await Promise.all([
        statusOf(bea, file.fileId),
        statusOf(ana, trashed.fileId),
        statusOf(ana, randomUUID()),
        statusOf(ana, 'no-es-uuid'),
      ]);

      expect(responses.map(errorOf)).toEqual([NOT_FOUND, NOT_FOUND, NOT_FOUND, NOT_FOUND]);
      const bodies = responses.map((response) => JSON.stringify(withoutCorrelation(response)));
      expect(new Set(bodies).size).toBe(1);
    });

    it.each([Role.ADMIN, Role.SUPPORT, Role.OPERATOR])(
      'CA-20: %s recibe `SHARED_FORBIDDEN` y ningún estado',
      async (role) => {
        const ana = await world.storage.newClient();
        const internal = await world.storage.newClient(role);
        const file = await settledUpload(ana, 'nomina.txt', txt('Nómina de octubre.'));

        const responses = await Promise.all([
          statusOf(internal, file.fileId),
          retry(internal, file.fileId),
        ]);

        expect(responses.map(errorOf)).toEqual([
          { status: 403, code: 'SHARED_FORBIDDEN' },
          { status: 403, code: 'SHARED_FORBIDDEN' },
        ]);
        expect(JSON.stringify(responses.map((response) => response.body))).not.toContain(
          'indexado',
        );
      },
    );
  });

  describe('papelera y purga (CA-15)', () => {
    it('CA-15: al restaurar vuelve `indexado` sin reindexar si la versión no cambió', async () => {
      const ana = await world.storage.newClient();
      const file = await settledUpload(ana, 'memoria.txt', txt('Memoria anual.'));
      const before = (await statusOf(ana, file.fileId)).body as { updatedAt: string };
      const calls = world.embedder.calls;
      expect((await ana.trashFile(file.fileId)).status).toBe(200);
      expect(errorOf(await statusOf(ana, file.fileId))).toEqual(NOT_FOUND);

      expect((await restore(ana, file.fileId)).status).toBe(200);

      expect((await statusOf(ana, file.fileId)).body).toEqual({
        state: 'indexado',
        reason: null,
        updatedAt: before.updatedAt,
        canRetry: false,
      });
      expect(await world.indexingQueue.getJob(file.versionId)).toBeUndefined();
      expect(world.embedder.calls).toBe(calls);
      expect((await world.chunksOf(file.fileId)).length).toBeGreaterThan(0);
    });

    it('CA-15: al purgar se borran sus fragmentos y su estado', async () => {
      const ana = await world.storage.newClient();
      const file = await settledUpload(ana, 'recibo.txt', txt('Recibo de pago.'));
      expect((await ana.trashFile(file.fileId)).status).toBe(200);

      expect((await ana.purgeFile(file.fileId)).status).toBe(200);

      expect(await world.chunksOf(file.fileId)).toEqual([]);
      const rows = await world.storage.owner.query<unknown[]>(
        'SELECT 1 FROM indexacion WHERE archivo_id = $1',
        [file.fileId],
      );
      expect(rows).toEqual([]);
    });
  });

  describe('POST /files/:fileId/indexing/retry', () => {
    it('CA-13: la propietaria reintenta un `fallido`: 202 `pendiente`, se reprocesa y queda auditado', async () => {
      const ana = await world.storage.newClient();
      const file = await failedUpload(ana);

      const response = await retry(ana, file.fileId);

      expect(response.status).toBe(202);
      expect(response.body).toEqual({ state: 'pendiente' });
      expect(await world.settled(file.versionId)).toMatchObject({
        estado: 'indexado',
        motivo: null,
        intentos: 1,
      });
      const audits = await world.storage.owner.query<{ actor_id: string; atributos: unknown }[]>(
        `SELECT actor_id, atributos FROM evento_auditoria
          WHERE recurso_id = $1 AND accion = 'file.index_retried'`,
        [file.fileId],
      );
      expect(audits).toEqual([{ actor_id: ana.id, atributos: { versionId: file.versionId } }]);
    });

    it('CA-13: fuera de `fallido` → 409 `INTELLIGENCE_INDEXING_NOT_RETRYABLE` sin tocar el estado', async () => {
      const ana = await world.storage.newClient();
      const indexed = await settledUpload(ana, 'guia.txt', txt('Guía de uso.'));
      const image = await world.upload(ana, unique('logo.png'), png());

      const responses = await Promise.all([retry(ana, indexed.fileId), retry(ana, image.fileId)]);

      const notRetryable = { status: 409, code: 'INTELLIGENCE_INDEXING_NOT_RETRYABLE' };
      expect(responses.map(errorOf)).toEqual([notRetryable, notRetryable]);
      expect(await world.indexingOf(indexed.versionId)).toMatchObject({ estado: 'indexado' });
    });

    it('CA-18: ajeno, en la papelera o inexistente → el mismo 404', async () => {
      const ana = await world.storage.newClient();
      const bea = await world.storage.newClient();
      const file = await failedUpload(ana);

      const responses = await Promise.all([
        retry(bea, file.fileId),
        retry(ana, randomUUID()),
        retry(ana, 'no-es-uuid'),
      ]);
      expect((await ana.trashFile(file.fileId)).status).toBe(200);
      const trashed = await retry(ana, file.fileId);

      expect([...responses, trashed].map(errorOf)).toEqual([
        NOT_FOUND,
        NOT_FOUND,
        NOT_FOUND,
        NOT_FOUND,
      ]);
      expect(await world.indexingOf(file.versionId)).toMatchObject({ estado: 'fallido' });
    });

    it('plan §4: pasado el límite por minuto → 429 con `Retry-After`', async () => {
      const ana = await world.storage.newClient();
      const file = await settledUpload(ana, 'agenda.txt', txt('Agenda semanal.'));

      for (let attempt = 0; attempt < TEST_RETRIES_PER_MINUTE; attempt += 1) {
        expect((await retry(ana, file.fileId)).status).toBe(409);
      }
      const limited = await retry(ana, file.fileId);

      expect(limited.status).toBe(429);
      expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
    });
  });

  describe('aviso en vivo `indexing.status-changed` (CA-14)', () => {
    it('CA-14: un cambio hecho en el `api` («Reintentar») llega por Socket.IO', async () => {
      const ana = await world.storage.newClient();
      const file = await failedUpload(ana);
      const socket = await connect(ana.id);
      const received = collectEvents(socket, INDEXING_EVENTS.STATUS_CHANGED);

      expect((await retry(ana, file.fileId)).status).toBe(202);

      const pending = { fileId: file.fileId, state: 'pendiente', reason: null };
      await eventually(() => Promise.resolve(received.length > 0 ? true : null));
      expect(received[0]).toEqual(pending);
    });

    it('CA-14: el `indexado` del `worker` llega por `index-status` y Socket.IO solo a la propietaria, sin nombre ni texto', async () => {
      const ana = await world.storage.newClient();
      const bea = await world.storage.newClient();
      const anaSocket = await connect(ana.id);
      const beaSocket = await connect(bea.id);
      const toAna = collectEvents(anaSocket, INDEXING_EVENTS.STATUS_CHANGED);
      const toBea = collectEvents(beaSocket, INDEXING_EVENTS.STATUS_CHANGED);

      const file = await world.upload(ana, unique('secreto.txt'), txt('Texto confidencial.'));

      const indexed = JSON.stringify({ fileId: file.fileId, state: 'indexado', reason: null });
      await eventually(() =>
        Promise.resolve(toAna.some((notice) => JSON.stringify(notice) === indexed) ? true : null),
      );
      expect(JSON.stringify(toAna)).not.toMatch(/secreto|confidencial|ownerId|correlationId/);
      expect(toBea).toEqual([]);
    });
  });
});
