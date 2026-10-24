import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';

import type { Env } from '../../shared';
import { AccessModule } from '../access';
import { AuditModule } from '../audit';

import { IndexScheduler } from './application/index-scheduler';
import { INDEX_STATUS_CONFIG, IndexStatusService } from './application/index-status.service';
import type { IndexStatusConfig } from './application/index-status.service';
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
import { IndexStatusRelay } from './infrastructure/index-status.relay';
import { TypeOrmIndexingRepository } from './infrastructure/persistence/typeorm-indexing.repository';
import { INDEX_STATUS_QUEUE } from './infrastructure/queued-index-status.notifier';
import { RealtimeIndexStatusNotifier } from './infrastructure/realtime-index-status.notifier';
import { FileVersionCreatedListener } from './presentation/file-version-created.listener';
import { IndexingController } from './presentation/indexing.controller';

/** Variables del `api` que `intelligence` usa (plan 019 §5). */
export type IntelligenceEnv = Pick<
  Env,
  'INDEXING_MAX_ATTEMPTS' | 'RATE_LIMIT_INDEX_RETRY_PER_MINUTE'
>;

/**
 * Módulos de la raíz que `intelligence` usa con **la misma** instancia: `storage` aporta `IndexableFileGateway`
 * (`StorageModule.forRoot(env)`) y `realtime`, `IRealtimePublisher`.
 */
export interface IntelligenceDependencies {
  readonly storage: DynamicModule;
  readonly realtime: DynamicModule;
}

/**
 * Módulo `intelligence` del `api` (M6, plan 019 §2): escucha `storage.file-version-created` y programa la indexación
 * (fila `pendiente`, trabajo en la cola `indexing` y aviso en vivo), expone el estado y «Reintentar»
 * (`IndexingController`) y retransmite por el canal en vivo los avisos que el `worker` deja en `index-status`
 * (`IndexStatusRelay`, ADR-0033 d). `ExtractorRegistry` decide qué tipos se indexan. `SharedModule` (global) aporta
 * reloj, transacciones y límite de tasa, y la raíz `EventEmitterModule.forRoot()` (ADR-0019). El `worker` usa
 * `IntelligenceWorkerModule` (T-06), sin oyente ni controlador.
 */
@Module({})
export class IntelligenceModule {
  static forRoot(
    env: IntelligenceEnv,
    { storage, realtime }: IntelligenceDependencies,
  ): DynamicModule {
    const queueConfig: IndexQueueConfig = { maxAttempts: env.INDEXING_MAX_ATTEMPTS };
    const statusConfig: IndexStatusConfig = {
      retriesPerMinute: env.RATE_LIMIT_INDEX_RETRY_PER_MINUTE,
    };
    return {
      module: IntelligenceModule,
      imports: [
        storage,
        realtime,
        AccessModule,
        AuditModule,
        BullModule.registerQueue({ name: INDEXING_QUEUE }, { name: INDEX_STATUS_QUEUE }),
      ],
      controllers: [IndexingController],
      providers: [
        { provide: INDEX_QUEUE_CONFIG, useValue: queueConfig },
        { provide: INDEX_STATUS_CONFIG, useValue: statusConfig },
        { provide: I_INDEX_QUEUE, useClass: BullmqIndexQueue },
        { provide: I_INDEXING_REPOSITORY, useClass: TypeOrmIndexingRepository },
        { provide: I_INDEX_STATUS_NOTIFIER, useClass: RealtimeIndexStatusNotifier },
        ...EXTRACTOR_PROVIDERS,
        // El `api` solo pregunta qué es indexable; Ghostscript lo usa el `worker` (plan 019 §5).
        ghostscriptConfigProvider(null),
        IndexScheduler,
        IndexStatusService,
        IndexStatusRelay,
        FileVersionCreatedListener,
      ],
    };
  }
}
