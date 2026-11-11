import { randomUUID } from 'node:crypto';

import {
  editedInput,
  registerAsOwner,
  uploadEditedDocument,
} from '../editing/edited-version-world';
import type { LogLine } from '../setup/log-sink';
import { waitForLog } from '../setup/wait-for-log';
import type { StorageClient } from '../storage/storage-http';

import { createIndexingWorld } from './indexing-world';
import type { IndexingWorld } from './indexing-world';

/** `INDEXING_MAX_ATTEMPTS` por defecto (RN-6); lo usa el `api` al encolar. */
const MAX_ATTEMPTS = 3;
/** Más que la primera espera de la cola (2 s): un reintento, si lo hubiera, ya habría empezado. */
const RETRY_WINDOW_MS = 3_000;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PNG_BODY_BYTES = 2048;

const txt = (text: string): Buffer => Buffer.from(text, 'utf8');

/**
 * Reintentos y fallos del proveedor (019 CA-12, RN-6, RNF-09): con el proveedor caído la cola reintenta con espera
 * exponencial y, agotados los intentos, la versión queda `fallido/proveedor_no_disponible`; mientras tanto el resto del
 * producto responde. Sin clave, el fallo es inmediato y no se reintenta.
 */
describe('reintentos de la indexación (019 CA-12)', () => {
  let world: IndexingWorld;
  let ana: StorageClient;

  beforeAll(async () => {
    world = await createIndexingWorld();
  });

  beforeEach(async () => {
    world.embedder.reset();
    ana = await world.storage.newClient();
  });

  afterAll(async () => {
    await world?.close();
  });

  const linesOf = (versionId: string, event: string): LogLine[] =>
    world.worker.logs
      .lines()
      .filter((line) => line.event === event && line.versionId === versionId);

  it('CA-12: con el proveedor caído, 3 intentos y luego `fallido/proveedor_no_disponible`', async () => {
    world.embedder.mode = 'down';

    const file = await world.upload(ana, `${randomUUID()}-informe.txt`, txt('Informe anual.'));

    expect(await world.settled(file.versionId)).toMatchObject({
      estado: 'fallido',
      motivo: 'proveedor_no_disponible',
      intentos: MAX_ATTEMPTS,
    });
    // El estado se confirma antes de escribir `indexing.failed` (IndexingOutcomeRecorder.settle): se espera la línea.
    await waitForLog(
      world.worker.logs,
      (line) => line.event === 'indexing.failed' && line.versionId === file.versionId,
    );
    expect(linesOf(file.versionId, 'indexing.attempt_failed')).toHaveLength(MAX_ATTEMPTS);
    expect(linesOf(file.versionId, 'indexing.failed')).toHaveLength(1);
    expect(await world.chunksOf(file.fileId)).toEqual([]);
  });

  it('RNF-09: durante los reintentos subir, descargar, listar y editar responden', async () => {
    world.embedder.mode = 'down';
    const file = await world.upload(ana, `${randomUUID()}-acta.txt`, txt('Acta.'));
    await waitForLog(
      world.worker.logs,
      (line) => line.event === 'indexing.attempt_failed' && line.versionId === file.versionId,
    );
    expect(await world.indexingOf(file.versionId)).toMatchObject({ estado: 'indexando' });

    const png = Buffer.concat([PNG_SIGNATURE, Buffer.alloc(PNG_BODY_BYTES, 0x41)]);
    await world.upload(ana, `${randomUUID()}-foto.png`, png);
    expect((await ana.downloadUrl(file.fileId)).status).toBe(200);
    expect((await ana.folderContents()).status).toBe(200);
    const document = await uploadEditedDocument(world.storage, ana);
    const edited = await registerAsOwner(world.storage, ana.id, editedInput(document, ana.id));
    expect(edited.status).toBe('registered');

    expect(await world.settled(file.versionId)).toMatchObject({ estado: 'fallido' });
  });

  it('CA-12: sin clave del proveedor, `fallido/proveedor_no_disponible` al primer intento y sin reintento', async () => {
    world.embedder.mode = 'keyless';

    const file = await world.upload(ana, `${randomUUID()}-plan.txt`, txt('Plan comercial.'));

    expect(await world.settled(file.versionId)).toMatchObject({
      estado: 'fallido',
      motivo: 'proveedor_no_disponible',
      intentos: 1,
    });
    await new Promise((resolve) => setTimeout(resolve, RETRY_WINDOW_MS));
    expect(linesOf(file.versionId, 'indexing.started')).toHaveLength(1);
    expect(linesOf(file.versionId, 'indexing.attempt_failed')).toEqual([]);
    expect(await world.indexingQueue.getJob(file.versionId)).toBeUndefined();
  });
});
