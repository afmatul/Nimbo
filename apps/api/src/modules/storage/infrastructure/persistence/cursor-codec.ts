import { STORAGE_FIELD_MESSAGES } from '@nimbo/contracts';

import { InvalidQueryError } from '../../domain/errors';
import type { NodeGroup } from '../../domain/node-order';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const GROUPS: ReadonlySet<unknown> = new Set<NodeGroup>(['folder', 'file']);

/** `STORAGE_INVALID_QUERY` con `fields: cursor/INVALID_CURSOR` (006 CA-5, 007 CA-11). */
export const invalidCursor = (): InvalidQueryError =>
  new InvalidQueryError([
    { field: 'cursor', reason: 'INVALID_CURSOR', message: STORAGE_FIELD_MESSAGES.INVALID_CURSOR },
  ]);

/** Cursor opaco: base64url de la tupla en JSON. El cliente lo devuelve tal cual y no depende de su forma. */
export const encodeCursorTuple = (tuple: readonly unknown[]): string =>
  Buffer.from(JSON.stringify(tuple)).toString('base64url');

/** La tupla de un cursor con `length` elementos; lanza `invalidCursor()` si no es base64url de un arreglo así. */
export const decodeCursorTuple = (cursor: string, length: number): readonly unknown[] => {
  let tuple: unknown;
  try {
    tuple = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    throw invalidCursor();
  }
  if (!Array.isArray(tuple) || tuple.length !== length) throw invalidCursor();
  return tuple as unknown[];
};

export const isNodeId = (value: unknown): value is string =>
  typeof value === 'string' && UUID_PATTERN.test(value);

export const isNodeGroup = (value: unknown): value is NodeGroup => GROUPS.has(value);

/** Fecha ISO tal como la emite `Date.toISOString` (no basta con que `Date` la entienda). */
export const isIsoDate = (value: unknown): value is string => {
  if (typeof value !== 'string') return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.toISOString() === value;
};
