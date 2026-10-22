import { buffer } from 'node:stream/consumers';

import { Inject, Injectable } from '@nestjs/common';

import { createActor, I_CLOCK, I_TRANSACTION_RUNNER, Role } from '../../../shared';
import type { Actor, IClock, ITransactionRunner } from '../../../shared';
import { IndexableFileGateway } from '../../storage';
import type { FileVersionRef, IndexableFile } from '../../storage';
import type { Chunk } from '../domain/chunk';
import { Chunker } from '../domain/chunker';
import { ContentReadError, EmbeddingUnavailableError, NotIndexableError } from '../domain/errors';
import { FAILURE_REASONS } from '../domain/file-indexing';
import type {
  FailureReason,
  FileIndexing,
  IndexingResult,
  IndexingState,
} from '../domain/file-indexing';

import { ExtractorRegistry } from './extractor-registry';
import { IndexingOutcomeRecorder } from './indexing-outcome.recorder';
import type { IndexingRun } from './indexing-outcome.recorder';
import { I_CHUNK_REPOSITORY } from './ports/i-chunk-repository.port';
import type { ChunkToStore, IChunkRepository } from './ports/i-chunk-repository.port';
import { I_EMBEDDING_PROVIDER } from './ports/i-embedding-provider.port';
import type { Embedding, IEmbeddingProvider } from './ports/i-embedding-provider.port';
import type { IndexJob } from './ports/i-index-queue.port';
import { I_INDEXING_REPOSITORY } from './ports/i-indexing-repository.port';
import type { IIndexingRepository } from './ports/i-indexing-repository.port';

/** Tope indexable (`INDEXING_MAX_FILE_BYTES`, RN-7): único, por entorno y no por plan. */
export interface IndexingConfig {
  readonly maxFileBytes: number;
}

export const INDEXING_CONFIG = Symbol('IndexingConfig');

/** Lo que el pipeline usa de la fachada de `storage` (siempre como la cuenta propietaria). */
export type IndexingFiles = Pick<
  IndexableFileGateway,
  'findOwned' | 'openCurrent' | 'lockCurrentVersion'
>;

/** Estados desde los que un trabajo puede reclamar o darse por vencido (plan §7 punto 8). */
const CLAIMABLE: readonly IndexingState[] = ['pendiente', 'indexando'];

/** Intento en curso: además de lo que registra el recorder, cuándo empezó (para `duracion_ms`). */
interface ActiveRun extends IndexingRun {
  readonly startedAt: Date;
}

const refOf = (job: IndexJob): FileVersionRef => ({
  fileId: job.fileId,
  versionId: job.versionId,
});

const ownerOf = (job: IndexJob): Actor => createActor(job.ownerId, Role.CLIENT);

/** Fragmentos con su vector; el proveedor devuelve uno por texto y en orden (contrato de `IEmbeddingProvider`). */
function toStore(chunks: readonly Chunk[], vectors: readonly Embedding[]): ChunkToStore[] {
  if (vectors.length !== chunks.length) {
    throw new Error('El proveedor de embeddings no devolvió un vector por fragmento.');
  }
  return chunks.map((chunk, index) => ({
    order: chunk.order,
    text: chunk.text,
    location: chunk.location.toJson(),
    embedding: vectors[index] as Embedding,
  }));
}

/** Motivo de `fallido` al agotar los intentos: el que trae el error transitorio, o `error_interno`. */
function failureReasonOf(error: unknown): FailureReason {
  const reason: unknown = (error as { reason?: unknown } | null)?.reason;
  return FAILURE_REASONS.find((known) => known === reason) ?? 'error_interno';
}

/**
 * Pipeline de indexación del `worker` (plan 019 §1 y §2). Actúa como la cuenta propietaria del trabajo sin confiar en
 * `ownerId`: RLS y `ownedFiles` deciden, y un archivo ajeno, purgado o con la versión superada se descarta en silencio
 * (CA-16). Reclama con comparar y asignar (CA-9), extrae, fragmenta, vectoriza **una vez** por juego y, en una sola
 * transacción con la versión bloqueada (`FOR SHARE`), reemplaza los fragmentos y marca `indexado` (CA-10). Los errores
 * permanentes terminan `no_indexable`; los transitorios se relanzan para que la cola reintente (RN-6). El resultado lo
 * registra `IndexingOutcomeRecorder`. No es una acción del cliente: una cuenta en solo lectura se indexa (CA-22).
 */
@Injectable()
export class IndexingService {
  private readonly chunker = new Chunker();

  constructor(
    @Inject(I_TRANSACTION_RUNNER) private readonly transactions: ITransactionRunner,
    @Inject(IndexableFileGateway) private readonly files: IndexingFiles,
    @Inject(I_INDEXING_REPOSITORY) private readonly indexings: IIndexingRepository,
    @Inject(I_CHUNK_REPOSITORY) private readonly chunks: IChunkRepository,
    @Inject(ExtractorRegistry) private readonly extractors: ExtractorRegistry,
    @Inject(I_EMBEDDING_PROVIDER) private readonly embedder: IEmbeddingProvider,
    @Inject(IndexingOutcomeRecorder) private readonly recorder: IndexingOutcomeRecorder,
    @Inject(I_CLOCK) private readonly clock: IClock,
    @Inject(INDEXING_CONFIG) private readonly config: IndexingConfig,
  ) {}

  /** Indexa la versión del trabajo. Lanza solo errores transitorios: la cola reintenta y, agotada, llama a `giveUp`. */
  async indexVersion(job: IndexJob): Promise<void> {
    const owner = ownerOf(job);
    const file = await this.currentFile(owner, job);
    if (file === null) return this.recorder.discarded(refOf(job), 'not_current');
    const run = await this.claim(owner, job);
    if (run === null) return this.recorder.discarded(refOf(job), 'not_claimable');
    this.recorder.started(run);
    try {
      await this.process(run, file);
    } catch (error) {
      await this.settleFailure(run, error);
    }
  }

  /** Intentos agotados (RN-6, CA-12): `fallido` con el motivo del último error, si la versión sigue vigente y abierta. */
  async giveUp(job: IndexJob, error: unknown): Promise<void> {
    const owner = ownerOf(job);
    if ((await this.currentFile(owner, job)) === null) return;
    const indexing = await this.transactions.withActor(owner, () =>
      this.indexings.findByVersion(owner, job.versionId),
    );
    if (indexing === null || !CLAIMABLE.includes(indexing.state)) return;
    const failed = indexing.fail(failureReasonOf(error), {
      durationMs: null,
      now: this.clock.now(),
    });
    await this.recorder.settle({ owner, indexing }, failed);
  }

  /** El archivo de la cuenta cuya versión vigente es la del trabajo; `null` si es ajeno, se purgó o se superó. */
  private async currentFile(owner: Actor, job: IndexJob): Promise<IndexableFile | null> {
    const file = await this.files.findOwned(owner, job.fileId);
    return file?.currentVersionId === job.versionId ? file : null;
  }

  /** CAS a `indexando` desde `pendiente` o `indexando` (trabajo recuperado tras una caída). */
  private async claim(owner: Actor, job: IndexJob): Promise<ActiveRun | null> {
    const startedAt = this.clock.now();
    return this.transactions.withActor(owner, async () => {
      const current = await this.indexings.findByVersion(owner, job.versionId);
      if (current === null || !CLAIMABLE.includes(current.state)) return null;
      const claimed = current.claim(startedAt);
      const applied = await this.indexings.compareAndSet(owner, claimed, current.state);
      return applied ? { owner, indexing: claimed, startedAt } : null;
    });
  }

  private async process(run: ActiveRun, file: IndexableFile): Promise<void> {
    const chunks = await this.chunksOf(run, file);
    if (chunks === null) return this.recorder.discarded(idsOf(run), 'not_current');
    const vectors = await this.embedder.embed(chunks.map((chunk) => chunk.text));
    const indexed = await this.swap(run, toStore(chunks, vectors));
    if (indexed === null) return this.recorder.discarded(idsOf(run), 'not_current');
    await this.recorder.announce(run.owner, indexed);
  }

  /** Tope, extracción y fragmentación; `null` si el contenido ya no es el vigente. */
  private async chunksOf(run: ActiveRun, file: IndexableFile): Promise<readonly Chunk[] | null> {
    if (file.sizeBytes > BigInt(this.config.maxFileBytes)) {
      throw new NotIndexableError('demasiado_grande');
    }
    const extractor = this.extractors.forKind(file.kind);
    const content = await this.readCurrent(run);
    if (content === null) return null;
    const chunks = this.chunker.split(await extractor.extract(content));
    if (chunks.length === 0) throw new NotIndexableError('sin_texto');
    return chunks;
  }

  private async readCurrent(run: ActiveRun): Promise<Buffer | null> {
    try {
      const stream = await this.files.openCurrent(run.owner, idsOf(run));
      return stream === null ? null : await buffer(stream);
    } catch (error) {
      throw new ContentReadError(error);
    }
  }

  /**
   * Una transacción (CA-10): bloquea la versión vigente y, si todavía lo es y el intento sigue suyo, deja solo los
   * fragmentos nuevos en el archivo, borra la indexación de las demás versiones (RN-1) y marca `indexado`.
   */
  private swap(run: ActiveRun, stored: readonly ChunkToStore[]): Promise<FileIndexing | null> {
    const { owner } = run;
    const indexed = run.indexing.complete({ fragmentCount: stored.length, ...this.resultOf(run) });
    return this.transactions.withActor(owner, async () => {
      if (!(await this.files.lockCurrentVersion(owner, idsOf(run)))) return null;
      if (!(await this.indexings.compareAndSet(owner, indexed, run.indexing.state))) return null;
      await this.chunks.replaceForVersion(owner, idsOf(run), stored);
      await this.indexings.deleteOtherVersions(owner, indexed);
      return indexed;
    });
  }

  /** Permanente → `no_indexable`; proveedor sin clave → `fallido`; lo demás se relanza para reintentar. */
  private async settleFailure(run: ActiveRun, error: unknown): Promise<void> {
    if (error instanceof NotIndexableError) {
      await this.recorder.settle(
        run,
        run.indexing.markUnindexable(error.reason, this.resultOf(run)),
      );
      return;
    }
    if (error instanceof EmbeddingUnavailableError && !error.retryable) {
      await this.recorder.settle(run, run.indexing.fail(error.reason, this.resultOf(run)));
      return;
    }
    this.recorder.attemptFailed(run, error);
    throw error;
  }

  private resultOf(run: ActiveRun): IndexingResult {
    const now = this.clock.now();
    return { durationMs: now.getTime() - run.startedAt.getTime(), now };
  }
}

function idsOf(run: IndexingRun): FileVersionRef {
  return { fileId: run.indexing.fileId, versionId: run.indexing.versionId };
}
