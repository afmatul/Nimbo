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
