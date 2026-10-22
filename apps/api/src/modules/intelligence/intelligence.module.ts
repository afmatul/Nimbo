import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';

import type { Env } from '../../shared';

import { IndexScheduler } from './application/index-scheduler';
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
import { TypeOrmIndexingRepository } from './infrastructure/persistence/typeorm-indexing.repository';
import { RealtimeIndexStatusNotifier } from './infrastructure/realtime-index-status.notifier';
import { FileVersionCreatedListener } from './presentation/file-version-created.listener';

/** Variables del `api` que `intelligence` usa (plan 019 §5). */
export type IntelligenceEnv = Pick<Env, 'INDEXING_MAX_ATTEMPTS'>;

/** Módulos de la raíz que `intelligence` usa con **la misma** instancia: `realtime` aporta `IRealtimePublisher`. */
export interface IntelligenceDependencies {
  readonly realtime: DynamicModule;
}

/**
 * Módulo `intelligence` del `api` (M6, plan 019 §2): escucha `storage.file-version-created` y programa la indexación
 * (fila `pendiente`, trabajo en la cola `indexing` y aviso en vivo); `ExtractorRegistry` decide qué tipos se indexan.
 * `SharedModule` (global) aporta reloj y transacciones, y la raíz `EventEmitterModule.forRoot()` (ADR-0019). El
 * `worker` usa `IntelligenceWorkerModule` (T-06), sin oyente ni controlador.
 */
@Module({})
export class IntelligenceModule {
  static forRoot(env: IntelligenceEnv, { realtime }: IntelligenceDependencies): DynamicModule {
    const queueConfig: IndexQueueConfig = { maxAttempts: env.INDEXING_MAX_ATTEMPTS };
    return {
      module: IntelligenceModule,
      imports: [realtime, BullModule.registerQueue({ name: INDEXING_QUEUE })],
      providers: [
        { provide: INDEX_QUEUE_CONFIG, useValue: queueConfig },
        { provide: I_INDEX_QUEUE, useClass: BullmqIndexQueue },
        { provide: I_INDEXING_REPOSITORY, useClass: TypeOrmIndexingRepository },
        { provide: I_INDEX_STATUS_NOTIFIER, useClass: RealtimeIndexStatusNotifier },
        ...EXTRACTOR_PROVIDERS,
        // El `api` solo pregunta qué es indexable; Ghostscript lo usa el `worker` (plan 019 §5).
        ghostscriptConfigProvider(null),
        IndexScheduler,
        FileVersionCreatedListener,
      ],
    };
  }
}
