import { randomUUID } from 'node:crypto';

import { getQueueToken } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';

import { INDEX_RECONCILE_QUEUE, requestIndexReconcile } from '../../../src/modules/intelligence';
import { IndexableFileGateway } from '../../../src/modules/storage';
import { Role } from '../../../src/shared';
import type { Actor } from '../../../src/shared';
import type { LogLine } from '../setup/log-sink';
import { waitForLog } from '../setup/wait-for-log';
import type { StorageClient } from '../storage/storage-http';

import { createIndexingWorld } from './indexing-world';
import type { IndexingWorld, UploadedFile } from './indexing-world';

/** Más de los 30 min tras los que una fila que espera al `worker` se da por perdida (plan 019 §1). */
const STALE_INTERVAL = '31 minutes';

const txt = (text: string): Buffer => Buffer.from(text, 'utf8');

/**
 * Conciliación de la indexación (019 CA-23, CA-9, RN-10, RN-12): la tarea `index-reconcile` del `worker` (la misma que
 * lanza `pnpm --filter api index:reconcile`) encola las versiones vigentes indexables sin fila (archivos previos a 019 o
 * con el evento perdido) y las `pendiente`/`indexando` de más de 30 min; terminan `indexado` sin acción del cliente,
 * repetirla no duplica nada y deja `index.reconcile_completed` con conteos e ids, sin nombres ni texto.
 */
describe('conciliación de la indexación (019 CA-23)', () => {
  let world: IndexingWorld;
  let reconcileQueue: Queue;
  let ana: StorageClient;

  beforeAll(async () => {
    world = await createIndexingWorld();
    reconcileQueue = world.worker.app.get<Queue>(getQueueToken(INDEX_RECONCILE_QUEUE));
  });

  beforeEach(async () => {
    world.embedder.reset();
    ana = await world.storage.newClient();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await reconcileQueue?.obliterate({ force: true });
    await world?.close();
  });

  /** Lanza la tarea una vez, como el script del Operador, y espera su bitácora final. */
  const reconcile = async (): Promise<LogLine> => {
    const correlationId = randomUUID();
    await requestIndexReconcile(reconcileQueue, correlationId);
    return waitForLog(
      world.worker.logs,
      (line) => line.event === 'index.reconcile_completed' && line.correlationId === correlationId,
    );
  };

  /** Un archivo ya indexado al que se le borra el rastro: como uno anterior a 019 o cuyo evento se perdió. */
  const withoutIndex = async (name: string, content: string): Promise<UploadedFile> => {
    const file = await world.upload(ana, name, txt(content));
    await world.settled(file.versionId);
    await world.storage.owner.query('DELETE FROM fragmento WHERE archivo_id = $1', [file.fileId]);
    await world.storage.owner.query('DELETE FROM indexacion WHERE archivo_id = $1', [file.fileId]);
    return file;
  };

  const markAwaiting = async (file: UploadedFile, state: string, interval: string) => {
    await world.storage.owner.query(
      `UPDATE indexacion SET estado = $2, fragmentos = 0, duracion_ms = NULL,
              actualizado_en = now() - $3::interval
        WHERE version_archivo_id = $1`,
      [file.versionId, state, interval],
    );
  };

  const indexingRows = async (fileId: string): Promise<number> => {
    const rows = await world.storage.owner.query<unknown[]>(
      'SELECT 1 FROM indexacion WHERE archivo_id = $1',
      [fileId],
    );
    return rows.length;
  };

  it('CA-23: una versión indexable sin fila queda encolada y termina `indexado` sin acción del cliente', async () => {
    const file = await withoutIndex('previo.txt', 'Contrato firmado antes de la indexación.');

    const completed = await reconcile();

    expect(completed.scheduledVersionIds).toContain(file.versionId);
    expect(await world.settled(file.versionId)).toMatchObject({ estado: 'indexado' });
    expect((await world.chunksOf(file.fileId)).length).toBeGreaterThan(0);
  });

  it('CA-23: vuelve a encolar `pendiente`/`indexando` de más de 30 min y no toca las recientes', async () => {
    const stale = await world.upload(ana, 'caido.txt', txt('Trabajo perdido por una caída.'));
    const fresh = await world.upload(ana, 'reciente.txt', txt('Trabajo que sigue en la cola.'));
    await Promise.all([world.settled(stale.versionId), world.settled(fresh.versionId)]);
    const chunksBefore = (await world.chunksOf(stale.fileId)).length;
    await markAwaiting(stale, 'indexando', STALE_INTERVAL);
    await markAwaiting(fresh, 'pendiente', '0 minutes');

    const completed = await reconcile();

    expect(completed.requeuedVersionIds).toContain(stale.versionId);
    expect(completed.requeuedVersionIds).not.toContain(fresh.versionId);
    expect(await world.settled(stale.versionId)).toMatchObject({ estado: 'indexado' });
    expect(await world.chunksOf(stale.fileId)).toHaveLength(chunksBefore);
    expect(await world.indexingOf(fresh.versionId)).toMatchObject({ estado: 'pendiente' });
  });

  it('CA-9, RN-10: repetir la conciliación no duplica filas, trabajos ni fragmentos', async () => {
    const file = await withoutIndex('repetido.txt', 'Acta de la reunión de directorio.');
    await reconcile();
    await world.settled(file.versionId);
    const chunks = (await world.chunksOf(file.fileId)).length;
    const calls = world.embedder.calls;

    const again = await reconcile();

    expect(again.scheduledVersionIds).not.toContain(file.versionId);
    expect(again.requeuedVersionIds).not.toContain(file.versionId);
    expect(await indexingRows(file.fileId)).toBe(1);
    expect(await world.chunksOf(file.fileId)).toHaveLength(chunks);
    expect(world.embedder.calls).toBe(calls);
  });

  it('CA-23: la bitácora `index.reconcile_completed` lleva conteos e ids, sin nombres ni texto', async () => {
    const name = `nomina-${randomUUID()}.txt`;
    const content = 'Nómina confidencial de la gerencia.';
    const file = await withoutIndex(name, content);

    const completed = await reconcile();

    expect(completed).toMatchObject({
      accounts: expect.any(Number),
      failedAccounts: 0,
      files: expect.any(Number),
      scheduled: expect.any(Number),
      requeued: expect.any(Number),
      failedAccountIds: [],
    });
    expect(completed.scheduledVersionIds).toContain(file.versionId);
    const traces = JSON.stringify(completed);
    expect(traces).not.toContain(name);
    expect(traces).not.toContain(content);
  });

  it('CA-23, RN-12: lee las cuentas con `clientIds` y recorre los archivos de cada una con su propio actor', async () => {
    const gateway = world.worker.app.get(IndexableFileGateway);
    const clientIds = jest.spyOn(gateway, 'clientIds');
    const listIndexable = jest.spyOn(gateway, 'listIndexable');
    const file = await withoutIndex('cuenta.txt', 'Presupuesto anual de la cuenta.');

    await reconcile();

    expect(clientIds).toHaveBeenCalled();
    const actors = listIndexable.mock.calls.map(([actor]: [Actor, unknown]) => actor);
    expect(actors).toContainEqual(expect.objectContaining({ id: ana.id, role: Role.CLIENT }));
    expect(actors.every((actor) => actor.role === Role.CLIENT)).toBe(true);
    expect(await world.settled(file.versionId)).toMatchObject({ estado: 'indexado' });
  });
});
