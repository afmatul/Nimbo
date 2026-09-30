import type { ValueTransformer } from 'typeorm';

/**
 * Columnas `bigint` de Postgres ↔ `bigint` de TypeScript (RN-11, D-13). `pg` entrega `bigint` como texto para no
 * perder precisión; este transformador lo convierte sin pasar nunca por `number`. `BigInt('1.5')` lanza: un valor
 * no entero no se trunca en silencio. Lo comparten las entidades con bytes (`*Bytes`) de cualquier módulo.
 */
export const BIGINT_TRANSFORMER = {
  from: (value: string | null): bigint | null => (value === null ? null : BigInt(value)),
  to: (value: bigint | null | undefined): string | null | undefined =>
    value === null || value === undefined ? value : value.toString(),
} satisfies ValueTransformer;
