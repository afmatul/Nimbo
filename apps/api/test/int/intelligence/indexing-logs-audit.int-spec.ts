import { randomUUID } from 'node:crypto';

import type { LogLine } from '../setup/log-sink';
import { waitForLog } from '../setup/wait-for-log';
import type { StorageClient } from '../storage/storage-http';

import { createIndexingWorld } from './indexing-world';
import type { IndexingWorld, UploadedFile } from './indexing-world';

/** Veinte números con decimales seguidos: la forma de un vector serializado. */
const VECTOR_LIKE = /(-?\d+\.\d+,){20}/;

interface AuditRow {
  readonly accion: string;
  readonly actor_id: string;
  readonly usuario_afectado_id: string;
  readonly atributos: Record<string, unknown>;
  readonly correlation_id: string | null;
}

/**
 * Bitácora técnica, auditoría y avisos de la indexación (019 CA-21, RNF-17): un ciclo completo deja `correlationId`,
 * ids, estado, motivo y `durationMs`, y **nada** del contenido: ni texto, ni nombre de archivo, ni extractos, ni
 * vectores (RN-8).
 */
describe('bitácora y auditoría de la indexación (019 CA-21)', () => {
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

  const linesOf = (file: UploadedFile): LogLine[] =>
    world.worker.logs
      .lines()
      .filter((line) => line.fileId === file.fileId || line.versionId === file.versionId);

  const auditOf = (fileId: string): Promise<AuditRow[]> =>
    world.storage.owner.query<AuditRow[]>(
      `SELECT accion, actor_id, usuario_afectado_id, atributos, correlation_id
         FROM evento_auditoria WHERE recurso_id = $1 AND accion LIKE 'file.index%'`,
      [fileId],
    );

  /** Todo lo que la indexación dejó fuera de las tablas de contenido: bitácora, auditoría y avisos a `index-status`. */
  const tracesOf = async (file: UploadedFile): Promise<string> => {
    const notices = await world.settledNoticesOf(file.fileId);
    return JSON.stringify([linesOf(file), await auditOf(file.fileId), notices]);
  };

  const expectNoContent = (traces: string, secrets: readonly string[]): void => {
    for (const secret of secrets) expect(traces).not.toContain(secret);
    expect(traces).not.toMatch(VECTOR_LIKE);
  };

  it('CA-21: un ciclo `indexado` deja ids, estado y duración con el `correlationId` de la carga, sin contenido', async () => {
    const name = `salarios-${randomUUID()}.txt`;
    const content = 'Salario de la gerente general: confidencial.';

    const file = await world.upload(ana, name, Buffer.from(content, 'utf8'));
    await world.settled(file.versionId);

    const completed = await waitForLog(
      world.worker.logs,
      (line) => line.event === 'indexing.completed' && line.versionId === file.versionId,
    );
    expect(completed).toMatchObject({
      correlationId: expect.any(String),
      fileId: file.fileId,
      state: 'indexado',
      reason: null,
      durationMs: expect.any(Number),
      fragmentCount: 1,
    });
    const uploaded = linesOf(file).find((line) => line.event === 'upload.completed');
    const started = linesOf(file).find((line) => line.event === 'indexing.started');
    expect(uploaded?.correlationId).toBe(completed.correlationId);
    expect(started?.correlationId).toBe(completed.correlationId);
    expect(await auditOf(file.fileId)).toEqual([
      {
        accion: 'file.indexed',
        actor_id: ana.id,
        usuario_afectado_id: ana.id,
        atributos: {
          versionId: file.versionId,
          durationMs: expect.any(Number),
          fragmentCount: 1,
        },
        correlation_id: completed.correlationId,
      },
    ]);
    const [chunk] = await world.chunksOf(file.fileId);
    expectNoContent(await tracesOf(file), [name, content, chunk?.texto ?? content]);
  });

  it('CA-21: un ciclo `fallido` deja estado y motivo en bitácora y auditoría, sin contenido', async () => {
    world.embedder.mode = 'keyless';
    const name = `deudas-${randomUUID()}.txt`;
    const content = 'Deuda pendiente con el banco.';

    const file = await world.upload(ana, name, Buffer.from(content, 'utf8'));
    await world.settled(file.versionId);

    const failed = await waitForLog(
      world.worker.logs,
      (line) => line.event === 'indexing.failed' && line.versionId === file.versionId,
    );
    expect(failed).toMatchObject({
      correlationId: expect.any(String),
      fileId: file.fileId,
      state: 'fallido',
      reason: 'proveedor_no_disponible',
      durationMs: expect.any(Number),
    });
    expect(await auditOf(file.fileId)).toEqual([
      expect.objectContaining({
        accion: 'file.index_failed',
        atributos: expect.objectContaining({ reason: 'proveedor_no_disponible' }),
        correlation_id: failed.correlationId,
      }),
    ]);
    expectNoContent(await tracesOf(file), [name, content, ...world.embedder.texts]);
  });
});
