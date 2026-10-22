import { Readable } from 'node:stream';

import type { IndexingFiles } from '../../src/modules/intelligence/application/indexing.service';
import type {
  ChunkToStore,
  ChunkVersion,
  IChunkRepository,
  StoredChunk,
} from '../../src/modules/intelligence/application/ports/i-chunk-repository.port';
import type {
  IIndexQueue,
  IndexJob,
} from '../../src/modules/intelligence/application/ports/i-index-queue.port';
import type {
  IIndexStatusNotifier,
  IndexStatusChange,
} from '../../src/modules/intelligence/application/ports/i-index-status-notifier.port';
import type { IIndexingRepository } from '../../src/modules/intelligence/application/ports/i-indexing-repository.port';
import type {
  FileIndexing,
  IndexingState,
} from '../../src/modules/intelligence/domain/file-indexing';
import type { FileVersionRef, IndexableFile } from '../../src/modules/storage';
import type { Actor } from '../../src/shared';

/**
 * Dobles en memoria de los puertos internos de `intelligence` (019) para las pruebas unitarias de sus servicios. Como
 * la tabla, guardan una indexación por versión (`uq_indexacion_version`) y aplican el comparar y asignar.
 */
export class FakeIndexingRepository implements IIndexingRepository {
  readonly byVersion = new Map<string, FileIndexing>();

  findByVersion(_actor: Actor, versionId: string): Promise<FileIndexing | null> {
    return Promise.resolve(this.byVersion.get(versionId) ?? null);
  }

  insertIfAbsent(_actor: Actor, indexing: FileIndexing): Promise<boolean> {
    if (this.byVersion.has(indexing.versionId)) return Promise.resolve(false);
    this.byVersion.set(indexing.versionId, indexing);
    return Promise.resolve(true);
  }

  compareAndSet(_actor: Actor, indexing: FileIndexing, expected: IndexingState): Promise<boolean> {
    if (this.byVersion.get(indexing.versionId)?.state !== expected) return Promise.resolve(false);
    this.byVersion.set(indexing.versionId, indexing);
    return Promise.resolve(true);
  }

  deleteOtherVersions(_actor: Actor, current: FileIndexing): Promise<number> {
    const others = [...this.byVersion.values()].filter(
      (indexing) => indexing.fileId === current.fileId && indexing.versionId !== current.versionId,
    );
    others.forEach((indexing) => this.byVersion.delete(indexing.versionId));
    return Promise.resolve(others.length);
  }
}

/** `IIndexQueue` en memoria: como BullMQ con `jobId` = `versionId`, un trabajo repetido no se agrega dos veces. */
export class FakeIndexQueue implements IIndexQueue {
  readonly jobs: IndexJob[] = [];
  failure: Error | null = null;

  enqueue(job: IndexJob): Promise<void> {
    if (this.failure !== null) return Promise.reject(this.failure);
    if (!this.jobs.some((queued) => queued.versionId === job.versionId)) this.jobs.push(job);
    return Promise.resolve();
  }
}

/** `IIndexStatusNotifier` en memoria: anota cada aviso. */
export class FakeIndexStatusNotifier implements IIndexStatusNotifier {
  readonly changes: IndexStatusChange[] = [];

  notify(change: IndexStatusChange): Promise<void> {
    this.changes.push(change);
    return Promise.resolve();
  }
}

/** Fragmento guardado por `FakeChunkRepository`, con su vector. */
export interface FakeStoredChunk extends ChunkToStore, ChunkVersion {}

/** `IChunkRepository` en memoria: como la tabla, `replaceForVersion` deja en el archivo solo los fragmentos nuevos. */
export class FakeChunkRepository implements IChunkRepository {
  stored: readonly FakeStoredChunk[] = [];

  replaceForVersion(
    _actor: Actor,
    version: ChunkVersion,
    chunks: readonly ChunkToStore[],
  ): Promise<void> {
    const others = this.stored.filter((chunk) => chunk.fileId !== version.fileId);
    this.stored = [...others, ...chunks.map((chunk) => ({ ...chunk, ...version }))];
    return Promise.resolve();
  }

  findByFile(_actor: Actor, fileId: string): Promise<readonly StoredChunk[]> {
    return Promise.resolve(this.storedOf(fileId));
  }

  nearest(): Promise<readonly StoredChunk[]> {
    return Promise.reject(new Error('`nearest` no se usa en las pruebas unitarias de 019.'));
  }

  private storedOf(fileId: string): readonly StoredChunk[] {
    return this.stored
      .filter((chunk) => chunk.fileId === fileId)
      .map(({ fileId: id, versionId, order, text, location }) => ({
        id: `${versionId}:${String(order)}`,
        fileId: id,
        versionId,
        order,
        text,
        location,
      }));
  }
}

/**
 * Fachada `IndexableFileGateway` en memoria, como la ve la propietaria: un archivo ajeno o purgado no existe y el
 * contenido sale solo de la versión vigente. `openFailure` simula una caída de MinIO al leer.
 */
export class FakeIndexableFiles implements IndexingFiles {
  readonly files = new Map<string, IndexableFile>();
  readonly contents = new Map<string, Buffer>();
  openFailure: Error | null = null;

  put(file: IndexableFile, content: Buffer): void {
    this.files.set(file.id, file);
    this.contents.set(file.currentVersionId, content);
  }

  /** Simula una versión nueva (o la purga, con `null`) mientras el trabajo corre (CA-16). */
  supersede(fileId: string, nextVersionId: string | null): void {
    const file = this.files.get(fileId);
    if (file === undefined) return;
    if (nextVersionId === null) this.files.delete(fileId);
    else this.files.set(fileId, { ...file, currentVersionId: nextVersionId });
  }

  findOwned(actor: Actor, fileId: string): Promise<IndexableFile | null> {
    const file = this.files.get(fileId);
    return Promise.resolve(file?.ownerId === actor.id ? file : null);
  }

  openCurrent(actor: Actor, ref: FileVersionRef): Promise<Readable | null> {
    if (this.openFailure !== null) return Promise.reject(this.openFailure);
    const content = this.isCurrent(actor, ref) ? this.contents.get(ref.versionId) : undefined;
    return Promise.resolve(content === undefined ? null : Readable.from([content]));
  }

  lockCurrentVersion(actor: Actor, ref: FileVersionRef): Promise<boolean> {
    return Promise.resolve(this.isCurrent(actor, ref));
  }

  private isCurrent(actor: Actor, ref: FileVersionRef): boolean {
    const file = this.files.get(ref.fileId);
    return file?.ownerId === actor.id && file.currentVersionId === ref.versionId;
  }
}
