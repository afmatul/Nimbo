import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import type { DynamicModule, Provider } from '@nestjs/common';

import type { Env } from '../../shared';
import { AccessModule } from '../access';
import { AuditModule } from '../audit';
import { BillingModule } from '../billing';

import { AgentAdmission } from './application/agent-admission';
import { AGENT_CONFIG } from './application/agent-config';
import type { AgentConfig } from './application/agent-config';
import { AgentService } from './application/agent.service';
import { AnswerComposer } from './application/answer-composer';
import { HybridRetriever } from './application/hybrid-retriever';
import { IndexScheduler } from './application/index-scheduler';
import { INDEX_STATUS_CONFIG, IndexStatusService } from './application/index-status.service';
import type { IndexStatusConfig } from './application/index-status.service';
import { I_CHUNK_SEARCH } from './application/ports/i-chunk-search.port';
import { I_EMBEDDING_PROVIDER } from './application/ports/i-embedding-provider.port';
import { I_INDEX_QUEUE } from './application/ports/i-index-queue.port';
import { I_INDEX_STATUS_NOTIFIER } from './application/ports/i-index-status-notifier.port';
import { I_INDEXING_REPOSITORY } from './application/ports/i-indexing-repository.port';
import { I_LANGUAGE_MODEL } from './application/ports/i-language-model.port';
import { I_THUMBNAIL_REPOSITORY } from './application/ports/i-thumbnail-repository.port';
import { ThumbnailService } from './application/thumbnail.service';
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
import { GEMINI_CHAT_CONFIG, GeminiFlashModel } from './infrastructure/gemini-flash.model';
import type { GeminiChatConfig } from './infrastructure/gemini-flash.model';
import { GEMINI_API_BASE_URL } from './infrastructure/gemini-http';
import { IndexStatusRelay } from './infrastructure/index-status.relay';
import { TypeOrmChunkSearch } from './infrastructure/persistence/typeorm-chunk-search';
import { TypeOrmIndexingRepository } from './infrastructure/persistence/typeorm-indexing.repository';
import { TypeOrmThumbnailRepository } from './infrastructure/persistence/typeorm-thumbnail.repository';
import { INDEX_STATUS_QUEUE } from './infrastructure/queued-index-status.notifier';
import { RealtimeIndexStatusNotifier } from './infrastructure/realtime-index-status.notifier';
import { AgentController } from './presentation/agent.controller';
import { FileVersionCreatedListener } from './presentation/file-version-created.listener';
import { IndexingController } from './presentation/indexing.controller';
import { ThumbnailController } from './presentation/thumbnail.controller';

/** Variables del `api` que `intelligence` usa (plan 019 §5 y plan 020 D-8). */
export type IntelligenceEnv = Pick<
  Env,
  | 'INDEXING_MAX_ATTEMPTS'
  | 'RATE_LIMIT_INDEX_RETRY_PER_MINUTE'
  | 'GEMINI_API_KEY'
  | 'GEMINI_EMBEDDING_MODEL'
  | 'GEMINI_CHAT_MODEL'
  | 'AGENT_MAX_QUESTION_CHARS'
  | 'AGENT_MODEL_FIRST_CHUNK_TIMEOUT_MS'
  | 'AGENT_MODEL_IDLE_TIMEOUT_MS'
>;

/**
 * Agente con citas (plan 020 §2, fila 8): Gemini para la pregunta y la respuesta (sin clave, `AGENT_UNAVAILABLE`), la
 * búsqueda de solo lectura y la orquestación. `IAgentQuota` sale de `BillingModule`; reloj, transacciones y límite de
 * tasa, de `SharedModule` (global).
 */
function agentProviders(env: IntelligenceEnv): Provider[] {
  const agentConfig: AgentConfig = { maxQuestionChars: env.AGENT_MAX_QUESTION_CHARS };
  const embeddingConfig: GeminiEmbeddingConfig = {
    apiKey: env.GEMINI_API_KEY,
    model: env.GEMINI_EMBEDDING_MODEL,
    baseUrl: GEMINI_API_BASE_URL,
  };
  const chatConfig: GeminiChatConfig = {
    apiKey: env.GEMINI_API_KEY,
    model: env.GEMINI_CHAT_MODEL,
    baseUrl: GEMINI_API_BASE_URL,
    firstChunkTimeoutMs: env.AGENT_MODEL_FIRST_CHUNK_TIMEOUT_MS,
    idleTimeoutMs: env.AGENT_MODEL_IDLE_TIMEOUT_MS,
  };
  return [
    { provide: AGENT_CONFIG, useValue: agentConfig },
    { provide: GEMINI_EMBEDDING_CONFIG, useValue: embeddingConfig },
    { provide: I_EMBEDDING_PROVIDER, useClass: GeminiEmbeddingProvider },
    { provide: GEMINI_CHAT_CONFIG, useValue: chatConfig },
    { provide: I_LANGUAGE_MODEL, useClass: GeminiFlashModel },
    { provide: I_CHUNK_SEARCH, useClass: TypeOrmChunkSearch },
    AgentAdmission,
    HybridRetriever,
    AnswerComposer,
    AgentService,
  ];
}

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
 * (`IndexStatusRelay`, ADR-0033 d), y el agente con citas (`AgentController`, `POST /agent/ask` en streaming y
 * `GET /agent/status`, plan 020). `ExtractorRegistry` decide qué tipos se indexan. `SharedModule` (global) aporta
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
        BillingModule,
        BullModule.registerQueue({ name: INDEXING_QUEUE }, { name: INDEX_STATUS_QUEUE }),
      ],
      controllers: [IndexingController, AgentController, ThumbnailController],
      providers: [
        { provide: INDEX_QUEUE_CONFIG, useValue: queueConfig },
        { provide: INDEX_STATUS_CONFIG, useValue: statusConfig },
        { provide: I_INDEX_QUEUE, useClass: BullmqIndexQueue },
        { provide: I_INDEXING_REPOSITORY, useClass: TypeOrmIndexingRepository },
        { provide: I_THUMBNAIL_REPOSITORY, useClass: TypeOrmThumbnailRepository },
        ThumbnailService,
        { provide: I_INDEX_STATUS_NOTIFIER, useClass: RealtimeIndexStatusNotifier },
        ...EXTRACTOR_PROVIDERS,
        // El `api` solo pregunta qué es indexable; Ghostscript lo usa el `worker` (plan 019 §5).
        ghostscriptConfigProvider(null),
        IndexScheduler,
        IndexStatusService,
        IndexStatusRelay,
        FileVersionCreatedListener,
        ...agentProviders(env),
      ],
    };
  }
}
