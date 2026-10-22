import { getQueueToken } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';

import { IntelligenceModule, IntelligenceWorkerModule } from '../../../src/modules/intelligence';
import { I_EMBEDDING_PROVIDER } from '../../../src/modules/intelligence/application/ports/i-embedding-provider.port';
import type {
  Embedding,
  IEmbeddingProvider,
} from '../../../src/modules/intelligence/application/ports/i-embedding-provider.port';
import { EmbeddingUnavailableError } from '../../../src/modules/intelligence/domain/errors';
import { INDEXING_QUEUE } from '../../../src/modules/intelligence/infrastructure/bullmq-index.queue';
import {
  GEMINI_API_BASE_URL,
  GeminiEmbeddingProvider,
} from '../../../src/modules/intelligence/infrastructure/gemini-embedding.provider';
import { INDEX_STATUS_QUEUE } from '../../../src/modules/intelligence/infrastructure/queued-index-status.notifier';
import { I_REALTIME_PUBLISHER } from '../../../src/modules/realtime';
import type { IRealtimePublisher, RealtimeNotice } from '../../../src/modules/realtime';
import { StorageWorkerModule } from '../../../src/modules/storage';
import { PlanLimitsBindingModule } from '../../../src/plan-limits-binding.module';
import { FakeEmbeddingProvider } from '../../support/fake-embedding.provider';
import { GHOSTSCRIPT_BIN } from '../../support/ghostscript';
import { buildTestEnv, createTestApp } from '../setup/test-app';
import type { TestApp } from '../setup/test-app';
import { createStorageHttpApp, STORAGE_HTTP_BUCKET } from '../storage/storage-http';
import type { StorageClient, StorageHttpApp } from '../storage/storage-http';

const KIB = 1024;
/** Tope indexable de las suites (RN-7): chico para probar `demasiado_grande` sin subir 50 MiB. */
export const TEST_MAX_FILE_BYTES = 512 * KIB;
const WAIT_STEP_MS = 100;
const WAIT_MS = 30_000;
const FINAL_STATES = ['indexado', 'no_indexable', 'fallido'];

export interface Delivered {
  readonly userId: string;
  readonly notice: RealtimeNotice;
}

/** `IRealtimePublisher` que anota lo que se manda a cada cuenta (el canal real lo prueba T-07). */
export class RecordingPublisher implements IRealtimePublisher {
  readonly delivered: Delivered[] = [];

  toUser(userId: string, notice: RealtimeNotice): void {
    this.delivered.push({ userId, notice });
  }

  toDocument(): void {
    // Sin salas de documento en estas suites.
  }
}

@Module({})
class RecordingRealtimeModule {}

export const recordingRealtime = (publisher: RecordingPublisher): DynamicModule => ({
  module: RecordingRealtimeModule,
  providers: [{ provide: I_REALTIME_PUBLISHER, useValue: publisher }],
  exports: [I_REALTIME_PUBLISHER],
});

/**
 * Cómo responde el proveedor: el doble determinista, caído (el error reintentable con que el adaptador traduce red,
 * 5xx y 429) o sin clave (el adaptador real, que falla sin salir a la red).
 */
export type EmbeddingMode = 'up' | 'down' | 'keyless';

/**
 * `IEmbeddingProvider` de las suites: delega en `FakeEmbeddingProvider`, con latencia simulada, caída y un gancho que
 * corre una vez antes de vectorizar («a mitad» del trabajo, CA-16). Anota cada texto recibido para comprobar que nada
 * de eso llega a bitácoras, auditoría ni trabajos (CA-21).
 */
export class ControlledEmbeddingProvider implements IEmbeddingProvider {
  mode: EmbeddingMode = 'up';
  latencyMs = 0;
  calls = 0;
  readonly texts: string[] = [];
  private beforeNext: (() => Promise<void>) | null = null;
  private readonly fake = new FakeEmbeddingProvider();
  private readonly keyless = new GeminiEmbeddingProvider({
    apiKey: undefined,
    model: 'gemini-embedding-001',
    baseUrl: GEMINI_API_BASE_URL,
  });

  /** Corre `hook` una vez, justo antes de la próxima vectorización. */
  onceBeforeEmbed(hook: () => Promise<void>): void {
    this.beforeNext = hook;
  }

  reset(): void {
    this.mode = 'up';
    this.latencyMs = 0;
    this.calls = 0;
    this.beforeNext = null;
  }

  async embed(texts: readonly string[]): Promise<readonly Embedding[]> {
    this.calls += 1;
    this.texts.push(...texts);
    const hook = this.beforeNext;
    this.beforeNext = null;
    if (hook !== null) await hook();
    if (this.latencyMs > 0) await new Promise((resolve) => setTimeout(resolve, this.latencyMs));
    if (this.mode === 'keyless') return this.keyless.embed(texts);
    if (this.mode === 'down') throw new EmbeddingUnavailableError();
    return this.fake.embed(texts);
  }
}

export interface IndexingRow {
  readonly estado: string;
  readonly motivo: string | null;
  readonly intentos: number;
  readonly fragmentos: number;
  readonly duracion_ms: number | null;
}

export interface ChunkRow {
  readonly version_archivo_id: string;
  readonly orden: number;
  readonly texto: string;
  readonly procedencia: Record<string, unknown>;
}

export interface UploadedFile {
  readonly fileId: string;
  readonly versionId: string;
}

/**
 * Mundo de la indexación de punta a punta (019 T-06): el `api` (`StorageModule` + `IntelligenceModule`, que programa
 * por evento) y el `worker` (`StorageWorkerModule` + `IntelligenceWorkerModule`, que consume `indexing` con los
 * extractores reales y Ghostscript), sobre Postgres como `nimbo_app`, Redis y MinIO reales. El proveedor de embeddings
 * es `ControlledEmbeddingProvider`. El `PinoLogger` es estático: `worker.logs` recibe las bitácoras de ambas apps.
 */
export interface IndexingWorld {
  readonly storage: StorageHttpApp;
  readonly worker: TestApp;
  readonly embedder: ControlledEmbeddingProvider;
  readonly indexingQueue: Queue;
  readonly statusQueue: Queue;
  upload(
    client: StorageClient,
    name: string,
    bytes: Buffer,
    replace?: boolean,
  ): Promise<UploadedFile>;
  indexingOf(versionId: string): Promise<IndexingRow | null>;
  /** Espera a que la versión llegue a un estado final y lo devuelve. */
  settled(versionId: string): Promise<IndexingRow>;
  chunksOf(fileId: string): Promise<ChunkRow[]>;
  statusJobsOf(fileId: string): Promise<Job[]>;
  close(): Promise<void>;
}

export const eventually = async <T>(probe: () => Promise<T | null>): Promise<T> => {
  const deadline = Date.now() + WAIT_MS;
  for (;;) {
    const found = await probe();
    if (found !== null) return found;
    if (Date.now() >= deadline) throw new Error(`Nada llegó en ${String(WAIT_MS)} ms`);
    await new Promise((resolve) => setTimeout(resolve, WAIT_STEP_MS));
  }
};

const createWorker = (embedder: ControlledEmbeddingProvider): Promise<TestApp> => {
  const env = buildTestEnv(
    {
      MINIO_BUCKET: STORAGE_HTTP_BUCKET,
      GHOSTSCRIPT_BIN,
      INDEXING_MAX_FILE_BYTES: String(TEST_MAX_FILE_BYTES),
    },
    { withWorkerEnv: true },
  );
  const storage = StorageWorkerModule.forRoot(env);
  return createTestApp({
    validatedEnv: env,
    modules: [PlanLimitsBindingModule, storage, IntelligenceWorkerModule.forRoot(env, storage)],
    overrides: [{ provide: I_EMBEDDING_PROVIDER, useValue: embedder }],
    prefix: '',
  });
};

export const createIndexingWorld = async (): Promise<IndexingWorld> => {
  const publisher = new RecordingPublisher();
  const storage = await createStorageHttpApp({
    withStorage: (_storage, env) => [
      IntelligenceModule.forRoot(env, { realtime: recordingRealtime(publisher) }),
    ],
  });
  const embedder = new ControlledEmbeddingProvider();
  const worker = await createWorker(embedder);
  const indexingQueue = worker.app.get<Queue>(getQueueToken(INDEXING_QUEUE));
  const statusQueue = worker.app.get<Queue>(getQueueToken(INDEX_STATUS_QUEUE));
  const indexingOf = async (versionId: string): Promise<IndexingRow | null> => {
    const [row] = await storage.owner.query<IndexingRow[]>(
      `SELECT estado, motivo, intentos, fragmentos, duracion_ms FROM indexacion WHERE version_archivo_id = $1`,
      [versionId],
    );
    return row ?? null;
  };
  return {
    storage,
    worker,
    embedder,
    indexingQueue,
    statusQueue,
    upload: (client, name, bytes, replace = false) =>
      uploadFile(storage, client, { name, bytes, replace }),
    indexingOf,
    settled: (versionId) =>
      eventually(async () => {
        const row = await indexingOf(versionId);
        return row !== null && FINAL_STATES.includes(row.estado) ? row : null;
      }),
    chunksOf: (fileId) =>
      storage.owner.query<ChunkRow[]>(
        'SELECT version_archivo_id, orden, texto, procedencia FROM fragmento WHERE archivo_id = $1 ORDER BY orden',
        [fileId],
      ),
    statusJobsOf: async (fileId) =>
      (await statusQueue.getJobs(['waiting', 'delayed', 'active', 'completed'])).filter(
        (job) => (job.data as { fileId?: string }).fileId === fileId,
      ),
    close: async () => {
      await Promise.all([
        indexingQueue.obliterate({ force: true }),
        statusQueue.obliterate({ force: true }),
      ]);
      await worker.close();
      await storage.close();
    },
  };
};

interface UploadInput {
  readonly name: string;
  readonly bytes: Buffer;
  readonly replace: boolean;
}

async function uploadFile(
  storage: StorageHttpApp,
  client: StorageClient,
  input: UploadInput,
): Promise<UploadedFile> {
  const response = await client.upload(input.name, input.bytes, input.replace ? 'replace' : 'ask');
  if (response.status !== 200) throw new Error(`Carga rechazada: ${String(response.status)}`);
  const fileId = (response.body as { file: { id: string } }).file.id;
  const [row] = await storage.owner.query<{ version_actual_id: string }[]>(
    'SELECT version_actual_id FROM archivo WHERE id = $1',
    [fileId],
  );
  return { fileId, versionId: row?.version_actual_id ?? '' };
}
