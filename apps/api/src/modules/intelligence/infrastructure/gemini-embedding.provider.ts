import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';

import {
  EMBEDDING_DIMENSIONS,
  type Embedding,
  type IEmbeddingProvider,
} from '../application/ports/i-embedding-provider.port';
import { EmbeddingUnavailableError } from '../domain/errors';

/** Base de la API REST de Gemini; las pruebas la apuntan a un servidor local. */
export const GEMINI_API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

/**
 * `GEMINI_API_KEY` (opcional, secreta) y `GEMINI_EMBEDDING_MODEL` (plan 019 §5). Las lee el `worker` para los
 * fragmentos y, desde la 020 (D-8), también el `api` para la pregunta al agente.
 */
export interface GeminiEmbeddingConfig {
  readonly apiKey: string | undefined;
  readonly model: string;
  readonly baseUrl: string;
}

export const GEMINI_EMBEDDING_CONFIG = Symbol('GeminiEmbeddingConfig');

/** Tope de `batchEmbedContents` por petición. */
const MAX_BATCH_SIZE = 100;
/** Un lote de 100 fragmentos responde en segundos; más es un proveedor lento y la cola reintenta (CA-12). */
const REQUEST_TIMEOUT_MS = 30_000;
/** Los fragmentos se vectorizan para ser recuperados; las preguntas de 020 usarán `RETRIEVAL_QUERY`. */
const DOCUMENT_TASK_TYPE = 'RETRIEVAL_DOCUMENT';
const REQUEST_TIMEOUT_STATUS = 408;
const TOO_MANY_REQUESTS_STATUS = 429;
const FIRST_SERVER_ERROR_STATUS = 500;

const batchResponseSchema = z.object({
  embeddings: z.array(
    z.object({ values: z.array(z.number().finite()).length(EMBEDDING_DIMENSIONS) }),
  ),
});

/** 408, 429 y 5xx pasan solos; cualquier otro rechazo (clave inválida, petición rechazada) se repetiría igual. */
function isTransientStatus(status: number): boolean {
  return (
    status === REQUEST_TIMEOUT_STATUS ||
    status === TOO_MANY_REQUESTS_STATUS ||
    status >= FIRST_SERVER_ERROR_STATUS
  );
}

function batchesOf(texts: readonly string[]): readonly (readonly string[])[] {
  const batches: string[][] = [];
  for (let start = 0; start < texts.length; start += MAX_BATCH_SIZE) {
    batches.push(texts.slice(start, start + MAX_BATCH_SIZE));
  }
  return batches;
}

/** Norma L2 = 1: Gemini solo normaliza la dimensión nativa (3072), no la reducida a 768. */
function normalize(values: readonly number[]): Embedding {
  const length = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
  if (length === 0) throw new EmbeddingUnavailableError();
  return values.map((value) => value / length);
}

async function parseBatch(response: Response, expected: number): Promise<readonly Embedding[]> {
  const parsed = batchResponseSchema.safeParse(await response.json().catch(() => null));
  if (!parsed.success || parsed.data.embeddings.length !== expected) {
    throw new EmbeddingUnavailableError();
  }
  return parsed.data.embeddings.map((embedding) => normalize(embedding.values));
}

/**
 * `IEmbeddingProvider` sobre la API REST de Gemini con `fetch`, sin SDK (ADR-0007, ADR-0033 c): `batchEmbedContents`
 * en lotes de hasta 100, 768 dimensiones (`outputDimensionality`) y normalización L2. La clave va solo en la cabecera
 * `x-goog-api-key`: nunca en la URL, en un error ni en bitácora, y los errores no llevan la respuesta del proveedor.
 * Sin clave, `EmbeddingUnavailableError` no reintentable sin llamar a la red (CA-12).
 */
@Injectable()
export class GeminiEmbeddingProvider implements IEmbeddingProvider {
  constructor(@Inject(GEMINI_EMBEDDING_CONFIG) private readonly config: GeminiEmbeddingConfig) {}

  async embed(texts: readonly string[]): Promise<readonly Embedding[]> {
    if (texts.length === 0) return [];
    const apiKey = this.config.apiKey;
    if (apiKey === undefined) throw new EmbeddingUnavailableError({ retryable: false });
    const vectors: Embedding[] = [];
    for (const batch of batchesOf(texts)) vectors.push(...(await this.embedBatch(apiKey, batch)));
    return vectors;
  }

  private async embedBatch(
    apiKey: string,
    batch: readonly string[],
  ): Promise<readonly Embedding[]> {
    const response = await this.post(apiKey, batch);
    if (!response.ok) {
      throw new EmbeddingUnavailableError({ retryable: isTransientStatus(response.status) });
    }
    return parseBatch(response, batch.length);
  }

  private async post(apiKey: string, batch: readonly string[]): Promise<Response> {
    try {
      return await fetch(this.endpoint(), {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({ requests: batch.map((text) => this.request(text)) }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        redirect: 'error',
      });
    } catch {
      throw new EmbeddingUnavailableError();
    }
  }

  private endpoint(): string {
    return `${this.config.baseUrl}/models/${encodeURIComponent(this.config.model)}:batchEmbedContents`;
  }

  private request(text: string): Readonly<Record<string, unknown>> {
    return {
      model: `models/${this.config.model}`,
      content: { parts: [{ text }] },
      outputDimensionality: EMBEDDING_DIMENSIONS,
      taskType: DOCUMENT_TASK_TYPE,
    };
  }
}
