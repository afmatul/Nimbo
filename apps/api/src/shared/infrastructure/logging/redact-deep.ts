import { REDACTED_FIELDS } from './redacted-fields';

export const REDACTED_VALUE = '[REDACTED]';
const CIRCULAR_VALUE = '[Circular]';
const TRUNCATED_VALUE = '[TRUNCATED]';
/** Niveles de anidamiento que se recorren; más allá, el subárbol se sustituye por `[TRUNCATED]`. */
const MAX_DEPTH = 16;

const isSensitiveField = (key: string): boolean => REDACTED_FIELDS.has(key.toLowerCase());

/** Solo se recorren objetos planos y arreglos; `Error`, `Date`, `Buffer` y demás instancias pasan intactas. */
const isPlainObject = (value: object): boolean => {
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
};

const redactValue = (value: unknown, depth: number, seen: WeakSet<object>): unknown => {
  if (typeof value !== 'object' || value === null) {
    return value;
  }
  if (!Array.isArray(value) && !isPlainObject(value)) {
    return value;
  }
  if (seen.has(value)) {
    return CIRCULAR_VALUE;
  }
  if (depth > MAX_DEPTH) {
    return TRUNCATED_VALUE;
  }
  seen.add(value);
  const result = Array.isArray(value)
    ? value.map((item: unknown) => redactValue(item, depth + 1, seen))
    : redactEntries(value as Record<string, unknown>, depth, seen);
  seen.delete(value);
  return result;
};

const redactEntries = (
  source: Record<string, unknown>,
  depth: number,
  seen: WeakSet<object>,
): Record<string, unknown> => {
  const target: Record<string, unknown> = {};
  for (const key of Object.keys(source)) {
    target[key] = isSensitiveField(key)
      ? REDACTED_VALUE
      : redactValue(source[key], depth + 1, seen);
  }
  return target;
};

/**
 * Devuelve una copia de `value` con todo campo de `REDACTED_FIELDS` sustituido por `[REDACTED]`,
 * en cualquier nivel (CA-15). No muta la entrada; corta ciclos y limita la profundidad.
 */
export const redactDeep = (value: unknown): unknown => redactValue(value, 1, new WeakSet());
