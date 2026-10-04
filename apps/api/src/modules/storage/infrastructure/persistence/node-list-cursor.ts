import { STORAGE_FIELD_MESSAGES } from '@nimbo/contracts';

import { InvalidQueryError } from '../../domain/errors';

/** Grupo de la fila: el listado da primero las carpetas y después los archivos. */
export type NodeListGroup = 'folder' | 'file';

/** Posición de la última fila de una página: su grupo y su lugar en `creado_en DESC, id DESC`. */
export interface NodeListPosition {
  readonly type: NodeListGroup;
  readonly createdAt: Date;
  readonly id: string;
}

const GROUPS: ReadonlySet<unknown> = new Set<NodeListGroup>(['folder', 'file']);
const TUPLE_LENGTH = 3;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const invalidCursor = (): InvalidQueryError =>
  new InvalidQueryError([
    { field: 'cursor', reason: 'INVALID_CURSOR', message: STORAGE_FIELD_MESSAGES.INVALID_CURSOR },
  ]);

const parseTuple = (cursor: string): unknown => {
  try {
    return JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    throw invalidCursor();
  }
};

/** Cursor opaco (base64url de `[grupo, creado_en, id]`): el cliente lo devuelve tal cual y no depende de su forma. */
export const encodeNodeListCursor = (position: NodeListPosition): string =>
  Buffer.from(
    JSON.stringify([position.type, position.createdAt.toISOString(), position.id]),
  ).toString('base64url');

/** Lanza `InvalidQueryError` (`INVALID_CURSOR`) si el cursor no es uno emitido por `encodeNodeListCursor`. */
export const decodeNodeListCursor = (cursor: string): NodeListPosition => {
  const tuple = parseTuple(cursor);
  if (!Array.isArray(tuple) || tuple.length !== TUPLE_LENGTH) throw invalidCursor();
  const [type, createdAt, id] = tuple as unknown[];
  if (!GROUPS.has(type) || typeof createdAt !== 'string' || typeof id !== 'string') {
    throw invalidCursor();
  }
  const date = new Date(createdAt);
  if (!UUID_PATTERN.test(id) || Number.isNaN(date.getTime())) throw invalidCursor();
  return { type: type as NodeListGroup, createdAt: date, id };
};
