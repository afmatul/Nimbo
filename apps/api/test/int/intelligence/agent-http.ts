import type { AddressInfo } from 'node:net';

import { agentEventSchema } from '@nimbo/contracts';
import type { AgentEvent } from '@nimbo/contracts';
import type { DataSource } from 'typeorm';

import { agentUsagePeriod } from '../../../src/modules/billing/domain/agent-usage-period';
import { IntelligenceModule } from '../../../src/modules/intelligence';
import { I_EMBEDDING_PROVIDER } from '../../../src/modules/intelligence/application/ports/i-embedding-provider.port';
import { I_LANGUAGE_MODEL } from '../../../src/modules/intelligence/application/ports/i-language-model.port';
import type { ILanguageModel } from '../../../src/modules/intelligence/application/ports/i-language-model.port';
import type { AgentPrompt } from '../../../src/modules/intelligence/domain/prompt-builder';
import { Role } from '../../../src/shared';
import { CORRELATION_ID_HEADER } from '../../../src/shared/infrastructure/correlation/correlation-id.middleware';
import { FakeLanguageModel } from '../../support/fake-language-model';
import { createStorageHttpApp } from '../storage/storage-http';
import type { StorageHttpApp } from '../storage/storage-http';
import { insertFileWithVersion } from '../storage/storage-test-db';

import {
  ControlledEmbeddingProvider,
  RecordingPublisher,
  recordingRealtime,
} from './indexing-world';
import { insertChunk, insertIndexing } from './intelligence-test-db';
import type { IndexedVersionRow } from './intelligence-test-db';

const API_PREFIX = '/api/v1';
const SSE_DATA_PREFIX = 'data: ';
const SSE_FRAME_END = '\n\n';

/**
 * `ILanguageModel` de las suites del agente: delega en el doble que la prueba elija (`use`) y anota cada prompt para
 * comprobar qué llega al proveedor (S-1). Por defecto, `FakeLanguageModel` sin trozos.
 */
export class SwitchableLanguageModel implements ILanguageModel {
  readonly prompts: AgentPrompt[] = [];
  private current: ILanguageModel = new FakeLanguageModel([]);

  use(model: ILanguageModel): void {
    this.current = model;
  }

  reset(): void {
    this.prompts.length = 0;
    this.current = new FakeLanguageModel([]);
  }

  stream(prompt: AgentPrompt, signal: AbortSignal): AsyncIterable<string> {
    this.prompts.push(prompt);
    return this.current.stream(prompt, signal);
  }
}

/**
 * Modelo que entrega `before`, se detiene hasta `open()` y entrega `after` (CA-2: el primer evento llega sin esperar al
 * resto; S-4: cancelar con el modelo detenido). `started` se cumple al pedir el flujo. Respeta la cancelación.
 */
export class GatedLanguageModel implements ILanguageModel {
  readonly started: Promise<void>;
  private markStarted: () => void = () => undefined;
  private release: () => void = () => undefined;
  private readonly gate: Promise<void>;

  constructor(
    private readonly before: readonly string[],
    private readonly after: readonly string[],
  ) {
    this.started = new Promise((resolve) => (this.markStarted = resolve));
    this.gate = new Promise((resolve) => (this.release = resolve));
  }

  open(): void {
    this.release();
  }

  async *stream(_prompt: AgentPrompt, signal: AbortSignal): AsyncGenerator<string> {
    this.markStarted();
    yield* this.before;
    await Promise.race([this.gate, abortOf(signal)]);
    signal.throwIfAborted();
    yield* this.after;
  }
}

const abortOf = (signal: AbortSignal): Promise<void> =>
  new Promise((resolve) => signal.addEventListener('abort', () => resolve(), { once: true }));

/** Respuesta de `POST /agent/ask` leída entera: estado, cabeceras y, si es un flujo, sus eventos validados. */
export interface AskResult {
  readonly status: number;
  readonly headers: Headers;
  readonly correlationId: string;
  readonly events: readonly AgentEvent[];
  readonly body: Record<string, unknown>;
}

/** Marcos `data:` completos del texto recibido y lo que sobra (un marco a medias). */
export const parseFrames = (text: string): { events: AgentEvent[]; rest: string } => {
  const parts = text.split(SSE_FRAME_END);
  const rest = parts.pop() ?? '';
  const events = parts.map((frame) =>
    agentEventSchema.parse(JSON.parse(frame.slice(SSE_DATA_PREFIX.length))),
  );
  return { events, rest };
};

/** Mundo HTTP del agente: `storage` + `intelligence` (con `billing`) reales en un puerto efímero y dobles del proveedor. */
export interface AgentWorld {
  readonly storage: StorageHttpApp;
  readonly model: SwitchableLanguageModel;
  readonly embedder: ControlledEmbeddingProvider;
  readonly owner: DataSource;
  newClient(role?: Role): Promise<string>;
  /** `POST /agent/ask` como `userId`; `signal` permite cancelar la petición. */
  askRaw(userId: string, body: unknown, signal?: AbortSignal): Promise<Response>;
  ask(userId: string, body: unknown): Promise<AskResult>;
  status(userId: string): Promise<{ status: number; body: Record<string, unknown> }>;
  /** Archivo `nombre` con su versión vigente `indexado` y un fragmento con `text` y `location`. */
  indexedFile(userId: string, chunk: IndexedChunk): Promise<IndexedVersionRow>;
  /** Consultas guardadas en el periodo actual de una cuenta Personal (sin fila, 0). */
  usedThisPeriod(userId: string): Promise<number>;
  /** Fija el contador del periodo actual (Personal) a `count`. */
  setUsedThisPeriod(userId: string, count: number): Promise<void>;
  close(): Promise<void>;
}

export interface IndexedChunk {
  readonly name: string;
  readonly text: string;
  readonly location?: unknown;
  /** Carpeta del archivo (ya insertada); sin ella, la raíz. */
  readonly folderId?: string;
}

/** Inicio del periodo Personal de hoy (RN-4): el que usa `billing` para la fila de `uso_agente`. */
export const currentPersonalPeriod = (): { startsAt: Date; resetsAt: Date | null } =>
  agentUsagePeriod(null, new Date());

const readAll = async (response: Response): Promise<AskResult> => {
  const text = await response.text();
  const isStream = (response.headers.get('content-type') ?? '').startsWith('text/event-stream');
  return {
    status: response.status,
    headers: response.headers,
    correlationId: response.headers.get(CORRELATION_ID_HEADER) ?? '',
    events: isStream ? parseFrames(text).events : [],
    body: isStream ? {} : (JSON.parse(text) as Record<string, unknown>),
  };
};

export const createAgentWorld = async (
  env: Readonly<Record<string, string>> = {},
): Promise<AgentWorld> => {
  const model = new SwitchableLanguageModel();
  const embedder = new ControlledEmbeddingProvider();
  const storage = await createStorageHttpApp({
    env,
    withStorage: (storageModule, validated) => {
      const realtime = recordingRealtime(new RecordingPublisher());
      return [
        realtime,
        IntelligenceModule.forRoot(validated, { storage: storageModule, realtime }),
      ];
    },
    overrides: [
      { provide: I_LANGUAGE_MODEL, useValue: model },
      { provide: I_EMBEDDING_PROVIDER, useValue: embedder },
    ],
  });
  const { app } = storage.testApp;
  await app.listen(0);
  const { port } = app.getHttpServer().address() as AddressInfo;
  const base = `http://127.0.0.1:${String(port)}${API_PREFIX}`;
  const owner = storage.owner;
  const auth = (userId: string) => ({ Authorization: `Bearer ${storage.tokenOf(userId) ?? ''}` });

  const askRaw = (userId: string, body: unknown, signal?: AbortSignal): Promise<Response> =>
    fetch(`${base}/agent/ask`, {
      method: 'POST',
      headers: { ...auth(userId), 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: signal ?? null,
    });

  const periodRows = async (userId: string): Promise<number> => {
    const rows = await owner.query<{ consultas: number }[]>(
      'SELECT consultas FROM uso_agente WHERE usuario_id = $1 AND periodo_inicio = $2',
      [userId, currentPersonalPeriod().startsAt],
    );
    return rows[0]?.consultas ?? 0;
  };

  return {
    storage,
    model,
    embedder,
    owner,
    newClient: async (role = Role.CLIENT) => (await storage.newClient(role)).id,
    askRaw,
    ask: async (userId, body) => readAll(await askRaw(userId, body)),
    status: async (userId) => {
      const response = await fetch(`${base}/agent/status`, { headers: auth(userId) });
      return { status: response.status, body: (await response.json()) as Record<string, unknown> };
    },
    indexedFile: (userId, chunk) =>
      owner.transaction(async (manager) => {
        const version = await insertFileWithVersion(manager, userId, {
          name: chunk.name,
          folderId: chunk.folderId ?? null,
        });
        await insertChunk(manager, version, { text: chunk.text, location: chunk.location });
        await insertIndexing(manager, version, { state: 'indexado' });
        return version;
      }),
    usedThisPeriod: periodRows,
    setUsedThisPeriod: async (userId, count) => {
      await owner.query(
        `INSERT INTO uso_agente (usuario_id, periodo_inicio, consultas) VALUES ($1, $2, $3)
         ON CONFLICT (usuario_id, periodo_inicio) DO UPDATE SET consultas = EXCLUDED.consultas`,
        [userId, currentPersonalPeriod().startsAt, count],
      );
    },
    close: () => storage.close(),
  };
};
