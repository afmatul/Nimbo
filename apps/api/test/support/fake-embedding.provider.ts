import { createHash } from 'node:crypto';

import {
  EMBEDDING_DIMENSIONS,
  type Embedding,
  type IEmbeddingProvider,
} from '../../src/modules/intelligence/application/ports/i-embedding-provider.port';

/** Bytes de un SHA-256: cada bloque da 32 componentes del vector. */
const HASH_BYTES = 32;
const BYTE_CENTER = 127.5;

function deterministicVector(text: string): Embedding {
  const blocks = Math.ceil(EMBEDDING_DIMENSIONS / HASH_BYTES);
  const bytes = Buffer.concat(
    Array.from({ length: blocks }, (_v, block) =>
      createHash('sha256').update(`${block}:${text}`).digest(),
    ),
  );
  const raw = Array.from(bytes.subarray(0, EMBEDDING_DIMENSIONS), (byte) => byte - BYTE_CENTER);
  const length = Math.sqrt(raw.reduce((sum, value) => sum + value * value, 0));
  return raw.map((value) => value / length);
}

/**
 * Doble determinista de `IEmbeddingProvider` (ADR-0007): el mismo texto da siempre el mismo vector unitario, sin red.
 * `calls` cuenta las llamadas a `embed` (019 CA-9: reprocesar no vuelve a vectorizar). Cumple el contrato de
 * `embedding-provider.contract.ts`.
 */
export class FakeEmbeddingProvider implements IEmbeddingProvider {
  calls = 0;

  embed(texts: readonly string[]): Promise<readonly Embedding[]> {
    this.calls += 1;
    return Promise.resolve(texts.map(deterministicVector));
  }
}
