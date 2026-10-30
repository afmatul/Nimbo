import { randomUUID } from 'node:crypto';

import { FakeEmbeddingProvider } from '../../../../test/support/fake-embedding.provider';
import {
  FakeChunkRepository,
  FakeIndexableFiles,
  FakeIndexingRepository,
  FakeIndexStatusNotifier,
} from '../../../../test/support/intelligence-fakes';
import {
  FakeAuditLogger,
  FakeTransactionRunner,
  Journal,
} from '../../../../test/support/storage-fakes';
import { FixedClock } from '../../../shared';
import { AuditAction } from '../../audit';
import type { IndexableFile } from '../../storage';
import { MAX_CHUNKS_PER_VERSION } from '../domain/chunker';
import { ContentReadError, EmbeddingUnavailableError, NotIndexableError } from '../domain/errors';
import { FileIndexing } from '../domain/file-indexing';
import { PdfLocation } from '../domain/pdf-location';
import type { Segment } from '../domain/segment';
import { TextLocation } from '../domain/text-location';

import { ExtractorRegistry } from './extractor-registry';
import { IndexingOutcomeRecorder } from './indexing-outcome.recorder';
import { IndexingService } from './indexing.service';
import type { IntelligenceLogger } from './intelligence-logger';
import type { IndexJob } from './ports/i-index-queue.port';
import type { ITextExtractor } from './ports/i-text-extractor.port';

const NOW = new Date('2026-10-22T10:00:00.000Z');
const EXTRACTION_MS = 4_210;
const MAX_FILE_BYTES = 1_000;
const OWNER_ID = '11111111-1111-4111-8111-111111111111';
const STRANGER_ID = '22222222-2222-4222-8222-222222222222';

/** Extractor de prueba: una línea no vacía = un segmento con su número de línea; tarda `EXTRACTION_MS`. */
class LineExtractor implements ITextExtractor {
  readonly kind = 'texto';
  calls = 0;
  failure: Error | null = null;

  constructor(private readonly clock: FixedClock) {}

  extract(content: Buffer): Promise<readonly Segment[]> {
    this.calls += 1;
    this.clock.advance(EXTRACTION_MS);
    if (this.failure !== null) return Promise.reject(this.failure);
    const lines = content.toString('utf8').split('\n');
    return Promise.resolve(
      lines.flatMap((text, index) =>
        text.trim() === '' ? [] : [{ text, location: TextLocation.line(index + 1) }],
      ),
    );
  }
}

function setup() {
  const journal = new Journal();
  const transactions = new FakeTransactionRunner(journal);
  const clock = new FixedClock(NOW);
  const files = new FakeIndexableFiles();
  const indexings = new FakeIndexingRepository();
  const chunks = new FakeChunkRepository();
  const extractor = new LineExtractor(clock);
  const embedder = new FakeEmbeddingProvider();
  const audit = new FakeAuditLogger(journal);
  const notifier = new FakeIndexStatusNotifier();
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  const recorder = new IndexingOutcomeRecorder(
    transactions,
    indexings,
    audit,
    notifier,
    logger as IntelligenceLogger,
  );
  const service = new IndexingService(
    transactions,
    files,
    indexings,
    chunks,
    new ExtractorRegistry([extractor]),
    embedder,
    recorder,
    clock,
    { maxFileBytes: MAX_FILE_BYTES },
  );
  return { service, files, indexings, chunks, extractor, embedder, audit, notifier, logger };
}

type Setup = ReturnType<typeof setup>;

/** Archivo de texto de la propietaria con su versión vigente `pendiente`, como lo deja `IndexScheduler`. */
function givenPendingFile(context: Setup, content = 'uno\ndos\n\ntres'): IndexJob {
  const file: IndexableFile = {
    id: randomUUID(),
    ownerId: OWNER_ID,
    kind: 'texto',
    sizeBytes: BigInt(Buffer.byteLength(content)),
    currentVersionId: randomUUID(),
  };
  context.files.put(file, Buffer.from(content));
  givenPendingVersion(context, { fileId: file.id, versionId: file.currentVersionId });
  return { fileId: file.id, versionId: file.currentVersionId, ownerId: OWNER_ID };
}

function givenPendingVersion(context: Setup, ref: { fileId: string; versionId: string }): void {
  const pending = FileIndexing.pending({ id: randomUUID(), ...ref, now: NOW });
  context.indexings.byVersion.set(ref.versionId, pending);
}

const stateOf = (context: Setup, job: IndexJob) => context.indexings.byVersion.get(job.versionId);

describe('IndexingService.indexVersion (019 plan §1 y §2)', () => {
  it('CA-1/CA-8: deja la versión `indexado` con sus fragmentos, ubicación, versión y duración', async () => {
    const context = setup();
    const job = givenPendingFile(context);

    await context.service.indexVersion(job);

    expect(stateOf(context, job)?.snapshot()).toMatchObject({
      state: 'indexado',
      attempts: 1,
      fragmentCount: 1,
      durationMs: EXTRACTION_MS,
    });
    const lines = TextLocation.line(1).mergeWith(TextLocation.line(4));
    expect(context.chunks.stored).toEqual([
      expect.objectContaining({
        order: 0,
        text: 'uno\ndos\ntres',
        location: lines.toJson(),
        ...ids(job),
      }),
    ]);
    expect(context.chunks.stored.every((chunk) => chunk.embedding.length === 768)).toBe(true);
    expect(context.audit.records.map((record) => record.action)).toEqual([
      AuditAction.FILE_INDEXED,
    ]);
    expect(context.notifier.changes).toEqual([
      { ownerId: OWNER_ID, fileId: job.fileId, state: 'indexado', reason: null },
    ]);
  });

  it('CA-9: el mismo trabajo dos veces deja un solo juego de fragmentos y una sola llamada de embeddings', async () => {
    const context = setup();
    const job = givenPendingFile(context);

    await context.service.indexVersion(job);
    const firstRun = context.chunks.stored;
    await context.service.indexVersion(job);

    expect(context.embedder.calls).toBe(1);
    expect(context.chunks.stored).toBe(firstRun);
    expect(context.audit.records).toHaveLength(1);
    expect(context.logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'indexing.discarded', cause: 'not_claimable' }),
    );
  });

  it('CA-9: un trabajo recuperado tras una caída del `worker` reclama desde `indexando`', async () => {
    const context = setup();
    const job = givenPendingFile(context);
    const stuck = stateOf(context, job)?.claim(NOW);
    context.indexings.byVersion.set(job.versionId, stuck as FileIndexing);

    await context.service.indexVersion(job);

    expect(stateOf(context, job)?.snapshot()).toMatchObject({ state: 'indexado', attempts: 2 });
  });

  it('CA-10: una versión nueva reemplaza los fragmentos y la indexación de la anterior', async () => {
    const context = setup();
    const first = givenPendingFile(context, 'viejo');
    await context.service.indexVersion(first);
    const second = { ...first, versionId: randomUUID() };
    context.files.supersede(first.fileId, second.versionId);
    context.files.contents.set(second.versionId, Buffer.from('nuevo'));
    givenPendingVersion(context, second);

    await context.service.indexVersion(second);

    expect(context.chunks.stored.map((chunk) => [chunk.versionId, chunk.text])).toEqual([
      [second.versionId, 'nuevo'],
    ]);
    expect(stateOf(context, first)).toBeUndefined();
  });

  it('CA-16: un trabajo con `ownerId` ajeno se descarta sin reclamar ni leer nada', async () => {
    const context = setup();
    const job = givenPendingFile(context);
    const openCurrent = jest.spyOn(context.files, 'openCurrent');

    await context.service.indexVersion({ ...job, ownerId: STRANGER_ID });

    expect(openCurrent).not.toHaveBeenCalled();
    expect(stateOf(context, job)?.state).toBe('pendiente');
    expect(context.notifier.changes).toEqual([]);
    expect(context.logger.info).toHaveBeenCalledWith({
      event: 'indexing.discarded',
      ...ids(job),
      cause: 'not_current',
    });
  });

  it('CA-16: archivo purgado o versión superada antes de empezar = descarte silencioso', async () => {
    const context = setup();
    const purged = givenPendingFile(context);
    const superseded = givenPendingFile(context);
    context.files.supersede(purged.fileId, null);
    context.files.supersede(superseded.fileId, randomUUID());

    await expect(context.service.indexVersion(purged)).resolves.toBeUndefined();
    await expect(context.service.indexVersion(superseded)).resolves.toBeUndefined();

    expect(context.extractor.calls).toBe(0);
    expect(context.audit.records).toEqual([]);
  });

  it('CA-16: si la versión se supera a mitad del trabajo, no guarda fragmentos huérfanos ni marca error', async () => {
    const context = setup();
    const job = givenPendingFile(context);
    jest.spyOn(context.embedder, 'embed').mockImplementation((texts) => {
      context.files.supersede(job.fileId, randomUUID());
      return new FakeEmbeddingProvider().embed(texts);
    });

    await expect(context.service.indexVersion(job)).resolves.toBeUndefined();

    expect(context.chunks.stored).toEqual([]);
    expect(stateOf(context, job)?.state).toBe('indexando');
    expect(context.audit.records).toEqual([]);
  });

  it('CA-16: si el contenido ya no está al abrirlo, se descarta sin extraer', async () => {
    const context = setup();
    const job = givenPendingFile(context);
    context.files.contents.delete(job.versionId);

    await context.service.indexVersion(job);

    expect(context.extractor.calls).toBe(0);
    expect(context.audit.records).toEqual([]);
  });

  it('CA-7: una versión por encima del tope indexable queda `no_indexable/demasiado_grande` sin extraer', async () => {
    const context = setup();
    const job = givenPendingFile(context, 'x'.repeat(MAX_FILE_BYTES + 1));

    await context.service.indexVersion(job);

    expect(stateOf(context, job)?.snapshot()).toMatchObject({
      state: 'no_indexable',
      reason: 'demasiado_grande',
    });
    expect(context.extractor.calls).toBe(0);
    expect(context.embedder.calls).toBe(0);
  });

  it(`CA-7: más de ${String(MAX_CHUNKS_PER_VERSION)} fragmentos = \`demasiado_grande\` sin vectorizar`, async () => {
    const context = setup();
    const job = givenPendingFile(context);
    const segments = Array.from({ length: MAX_CHUNKS_PER_VERSION + 1 }, (_v, index) => ({
      text: 'página',
      location: PdfLocation.page(index + 1),
    }));
    jest.spyOn(context.extractor, 'extract').mockResolvedValue(segments);

    await context.service.indexVersion(job);

    expect(stateOf(context, job)?.reason).toBe('demasiado_grande');
    expect(context.embedder.calls).toBe(0);
  });

  it('CA-4: sin texto (ningún segmento) queda `no_indexable/sin_texto` y se avisa', async () => {
    const context = setup();
    const job = givenPendingFile(context, '\n \n');

    await context.service.indexVersion(job);

    expect(stateOf(context, job)?.snapshot()).toMatchObject({
      state: 'no_indexable',
      reason: 'sin_texto',
      durationMs: EXTRACTION_MS,
    });
    expect(context.notifier.changes[0]).toMatchObject({
      state: 'no_indexable',
      reason: 'sin_texto',
    });
    expect(context.audit.records[0]?.action).toBe(AuditAction.FILE_INDEX_UNINDEXABLE);
  });

  it('CA-5: un formato que el extractor no reconoce queda `no_indexable/formato_no_soportado` sin reintento', async () => {
    const context = setup();
    const job = givenPendingFile(context);
    context.extractor.failure = new NotIndexableError('formato_no_soportado');

    await expect(context.service.indexVersion(job)).resolves.toBeUndefined();

    expect(stateOf(context, job)?.reason).toBe('formato_no_soportado');
  });

  it('CA-12: proveedor caído (transitorio) relanza para que la cola reintente, sin guardar ni avisar', async () => {
    const context = setup();
    const job = givenPendingFile(context);
    jest.spyOn(context.embedder, 'embed').mockRejectedValue(new EmbeddingUnavailableError());

    await expect(context.service.indexVersion(job)).rejects.toBeInstanceOf(
      EmbeddingUnavailableError,
    );

    expect(stateOf(context, job)?.state).toBe('indexando');
    expect(context.chunks.stored).toEqual([]);
    expect(context.notifier.changes).toEqual([]);
    expect(context.logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'indexing.attempt_failed',
        attempt: 1,
        errorClass: 'EmbeddingUnavailableError',
      }),
    );
  });

  it('CA-12: sin clave del proveedor (no reintentable) queda `fallido/proveedor_no_disponible` sin relanzar', async () => {
    const context = setup();
    const job = givenPendingFile(context);
    jest
      .spyOn(context.embedder, 'embed')
      .mockRejectedValue(new EmbeddingUnavailableError({ retryable: false }));

    await expect(context.service.indexVersion(job)).resolves.toBeUndefined();

    expect(stateOf(context, job)?.snapshot()).toMatchObject({
      state: 'fallido',
      reason: 'proveedor_no_disponible',
    });
    expect(context.audit.records[0]?.action).toBe(AuditAction.FILE_INDEX_FAILED);
  });

  it('CA-12: un fallo al leer el contenido es transitorio (`ContentReadError`)', async () => {
    const context = setup();
    const job = givenPendingFile(context);
    context.files.openFailure = new Error('MinIO no responde');

    await expect(context.service.indexVersion(job)).rejects.toBeInstanceOf(ContentReadError);

    expect(stateOf(context, job)?.state).toBe('indexando');
  });

  it('un proveedor que no devuelve un vector por fragmento no guarda nada y se reintenta', async () => {
    const context = setup();
    const job = givenPendingFile(context);
    jest.spyOn(context.embedder, 'embed').mockResolvedValue([]);

    await expect(context.service.indexVersion(job)).rejects.toThrow(/un vector por fragmento/);

    expect(context.chunks.stored).toEqual([]);
    expect(stateOf(context, job)?.state).toBe('indexando');
  });
});

describe('IndexingService.giveUp (019 RN-6, CA-12)', () => {
  it.each([
    ['proveedor_no_disponible', new EmbeddingUnavailableError()],
    ['lectura_fallida', new ContentReadError(new Error('MinIO no responde'))],
    ['error_interno', new TypeError('Ghostscript terminó mal')],
  ])('agotados los intentos queda `fallido/%s` y se avisa', async (reason, error) => {
    const context = setup();
    const job = givenPendingFile(context);
    jest.spyOn(context.embedder, 'embed').mockRejectedValue(error);
    await context.service.indexVersion(job).catch(() => undefined);

    await context.service.giveUp(job, error);

    expect(stateOf(context, job)?.snapshot()).toMatchObject({
      state: 'fallido',
      reason,
      attempts: 1,
      durationMs: null,
    });
    expect(context.notifier.changes).toEqual([
      { ownerId: OWNER_ID, fileId: job.fileId, state: 'fallido', reason },
    ]);
  });

  it('desde `pendiente` (sin llegar a reclamar) también queda `fallido`', async () => {
    const context = setup();
    const job = givenPendingFile(context);

    await context.service.giveUp(job, new EmbeddingUnavailableError());

    expect(stateOf(context, job)?.state).toBe('fallido');
  });

  it('CA-16: no toca una versión superada, purgada, ajena ni ya terminada', async () => {
    const context = setup();
    const indexed = givenPendingFile(context);
    await context.service.indexVersion(indexed);
    const superseded = givenPendingFile(context);
    context.files.supersede(superseded.fileId, randomUUID());
    const foreign = givenPendingFile(context);
    const error = new EmbeddingUnavailableError();

    await context.service.giveUp(indexed, error);
    await context.service.giveUp(superseded, error);
    await context.service.giveUp({ ...foreign, ownerId: STRANGER_ID }, error);

    expect(stateOf(context, indexed)?.state).toBe('indexado');
    expect(stateOf(context, superseded)?.state).toBe('pendiente');
    expect(stateOf(context, foreign)?.state).toBe('pendiente');
    expect(context.audit.records.map((record) => record.action)).toEqual([
      AuditAction.FILE_INDEXED,
    ]);
  });
});

function ids(job: IndexJob): { fileId: string; versionId: string } {
  return { fileId: job.fileId, versionId: job.versionId };
}
