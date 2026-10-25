import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import type { DynamicModule, Provider } from '@nestjs/common';
import type { z } from 'zod';

import type { workerEnvSchema } from '../../shared';
import { AuditModule } from '../audit';

import { INDEX_RECONCILE_CONFIG, IndexReconciler } from './application/index-reconciler';
import type { IndexReconcileConfig } from './application/index-reconciler';
import { IndexScheduler } from './application/index-scheduler';
import { IndexingOutcomeRecorder } from './application/indexing-outcome.recorder';
import { INDEXING_CONFIG, IndexingService } from './application/indexing.service';
import type { IndexingConfig } from './application/indexing.service';
import { I_CHUNK_REPOSITORY } from './application/ports/i-chunk-repository.port';
import { I_EMBEDDING_PROVIDER } from './application/ports/i-embedding-provider.port';
import { I_INDEX_QUEUE } from './application/ports/i-index-queue.port';
import { I_INDEX_STATUS_NOTIFIER } from './application/ports/i-index-status-notifier.port';
import { I_INDEXING_REPOSITORY } from './application/ports/i-indexing-repository.port';
import {
  BullmqIndexQueue,
  INDEX_QUEUE_CONFIG,
  INDEXING_QUEUE,
} from './infrastructure/bullmq-index.queue';
import type { IndexQueueConfig } from './infrastructure/bullmq-index.queue';
import {
  EXTRACTOR_PROVIDERS,
  ghostscriptConfigProvider,
} from './infrastructure/extractors/extractors.providers';
import {
  GEMINI_EMBEDDING_CONFIG,
  GeminiEmbeddingProvider,
} from './infrastructure/gemini-embedding.provider';
import type { GeminiEmbeddingConfig } from './infrastructure/gemini-embedding.provider';
import { GEMINI_API_BASE_URL } from './infrastructure/gemini-http';
import { IndexReconcileProcessor } from './infrastructure/index-reconcile.processor';
import {
  INDEX_RECONCILE_QUEUE,
  IndexReconcileScheduler,
} from './infrastructure/index-reconcile.scheduler';
import { IndexingProcessor } from './infrastructure/indexing.processor';
import { TypeOrmChunkRepository } from './infrastructure/persistence/typeorm-chunk.repository';
import { TypeOrmIndexingRepository } from './infrastructure/persistence/typeorm-indexing.repository';
import {
  INDEX_STATUS_QUEUE,
  QueuedIndexStatusNotifier,
} from './infrastructure/queued-index-status.notifier';

/** Variables del `worker` que `intelligence` usa (plan 019 §5). */
export type IntelligenceWorkerEnv = Pick<
  z.infer<typeof workerEnvSchema>,
  | 'INDEXING_MAX_FILE_BYTES'
  | 'INDEXING_MAX_ATTEMPTS'
  | 'INDEX_RECONCILE_INTERVAL_MINUTES'
  | 'INDEX_RECONCILE_BATCH_SIZE'
  | 'GHOSTSCRIPT_BIN'
  | 'GEMINI_API_KEY'
  | 'GEMINI_EMBEDDING_MODEL'
>;

/** Indexación (cola `indexing`): extractores, proveedor de embeddings, repositorios y el aviso a `index-status`. */
function indexingProviders(env: IntelligenceWorkerEnv): Provider[] {
  const indexingConfig: IndexingConfig = { maxFileBytes: env.INDEXING_MAX_FILE_BYTES };
  const embeddingConfig: GeminiEmbeddingConfig = {
    apiKey: env.GEMINI_API_KEY,
    model: env.GEMINI_EMBEDDING_MODEL,
    baseUrl: GEMINI_API_BASE_URL,
  };
  return [
    { provide: INDEXING_CONFIG, useValue: indexingConfig },
    { provide: GEMINI_EMBEDDING_CONFIG, useValue: embeddingConfig },
    { provide: I_EMBEDDING_PROVIDER, useClass: GeminiEmbeddingProvider },
    { provide: I_INDEXING_REPOSITORY, useClass: TypeOrmIndexingRepository },
    { provide: I_CHUNK_REPOSITORY, useClass: TypeOrmChunkRepository },
    { provide: I_INDEX_STATUS_NOTIFIER, useClass: QueuedIndexStatusNotifier },
    ...EXTRACTOR_PROVIDERS,
    ghostscriptConfigProvider(env.GHOSTSCRIPT_BIN),
    IndexingOutcomeRecorder,
    IndexingService,
    IndexingProcessor,
  ];
}

/**
 * Conciliación (cola `index-reconcile`, RN-12): encola con `IndexScheduler` y `BullmqIndexQueue`, los mismos que el
 * `api`, con `INDEXING_MAX_ATTEMPTS` intentos por trabajo.
 */
function reconcileProviders(env: IntelligenceWorkerEnv): Provider[] {
  const queueConfig: IndexQueueConfig = { maxAttempts: env.INDEXING_MAX_ATTEMPTS };
  const reconcileConfig: IndexReconcileConfig = {
    intervalMinutes: env.INDEX_RECONCILE_INTERVAL_MINUTES,
    batchSize: env.INDEX_RECONCILE_BATCH_SIZE,
  };
  return [
    { provide: INDEX_QUEUE_CONFIG, useValue: queueConfig },
    { provide: I_INDEX_QUEUE, useClass: BullmqIndexQueue },
    { provide: INDEX_RECONCILE_CONFIG, useValue: reconcileConfig },
    IndexScheduler,
    IndexReconciler,
    IndexReconcileScheduler,
    IndexReconcileProcessor,
  ];
}

/**
 * Parte de `intelligence` que corre en el `worker` (plan 019 §2): consume la cola `indexing` con `IndexingProcessor`,
 * extrae (Ghostscript para PDF), vectoriza con Gemini y publica cada cambio de estado en `index-status`, que el `api`
 * retransmite por su canal en vivo (D-2); además programa y consume `index-reconcile` (RN-12). Sin oyente ni
 * controlador. Recibe **la misma** instancia de `StorageWorkerModule` que monta `WorkerModule` (aporta
 * `IndexableFileGateway`; otro `forRoot` duplicaría sus procesadores). La clave del proveedor vive en el backend: aquí
 * y, para el agente, en el `api` (020 D-8, que enmienda RN-9 de la 019); nunca en el navegador.
 */
@Module({})
export class IntelligenceWorkerModule {
  static forRoot(env: IntelligenceWorkerEnv, storage: DynamicModule): DynamicModule {
    return {
      module: IntelligenceWorkerModule,
      imports: [
        AuditModule,
        storage,
        BullModule.registerQueue(
          { name: INDEXING_QUEUE },
          { name: INDEX_STATUS_QUEUE },
          { name: INDEX_RECONCILE_QUEUE },
        ),
      ],
      providers: [...indexingProviders(env), ...reconcileProviders(env)],
    };
  }
}
