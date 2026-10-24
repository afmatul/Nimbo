import {
  EMBEDDING_DIMENSIONS,
  type Embedding,
  type IEmbeddingProvider,
} from '../../src/modules/intelligence/application/ports/i-embedding-provider.port';

/**
 * Contrato de `IEmbeddingProvider` (Liskov, 019 T-04): lo cumplen `GeminiEmbeddingProvider` (contra un servidor HTTP
 * local) y el doble `FakeEmbeddingProvider` que usan las pruebas del pipeline, para que el doble no prometa lo que el
 * real no da.
 */
const UNIT_NORM_DIGITS = 6;
/** Más de un lote del proveedor (100): el reparto en lotes no se nota desde fuera. */
const MANY_TEXTS = 250;

const norm = (vector: Embedding): number =>
  Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));

const expectUnitVector = (vector: Embedding | undefined): void => {
  expect(vector).toHaveLength(EMBEDDING_DIMENSIONS);
  expect(vector?.every((value) => Number.isFinite(value))).toBe(true);
  expect(norm(vector ?? [])).toBeCloseTo(1, UNIT_NORM_DIGITS);
};

export function itBehavesAsEmbeddingProvider(provider: () => IEmbeddingProvider): void {
  it('contrato: un vector unitario de 768 dimensiones por texto', async () => {
    const vectors = await provider().embed(['contrato de arrendamiento', 'informe trimestral']);

    expect(vectors).toHaveLength(2);
    vectors.forEach(expectUnitVector);
  });

  it('contrato: conserva el orden, también a través de varios lotes', async () => {
    const texts = Array.from({ length: MANY_TEXTS }, (_v, index) => `texto número ${index}`);

    const all = await provider().embed(texts);
    const [last] = await provider().embed([texts[MANY_TEXTS - 1] ?? '']);

    expect(all).toHaveLength(MANY_TEXTS);
    all.forEach(expectUnitVector);
    expect(all[MANY_TEXTS - 1]).toEqual(last);
    expect(all[0]).not.toEqual(last);
  });

  it('contrato: una lista vacía da una lista vacía', async () => {
    expect(await provider().embed([])).toEqual([]);
  });
}
