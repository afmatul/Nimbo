import { STORAGE_FIELD_MESSAGES } from '@nimbo/contracts';

import { InvalidQueryError } from '../../domain/errors';

/** Posición de la última fila de una página, en el orden del listado (`creado_en DESC, id DESC`). */
export interface FileListPosition {
  readonly createdAt: Date;
  readonly id: string;
}

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

/** Cursor opaco (base64url de `[creado_en, id]`): el cliente lo devuelve tal cual y no depende de su forma. */
export const encodeFileListCursor = (position: FileListPosition): string =>
  Buffer.from(JSON.stringify([position.createdAt.toISOString(), position.id])).toString(
    'base64url',
  );

/** Lanza `InvalidQueryError` (`INVALID_CURSOR`) si el cursor no es uno emitido por `encodeFileListCursor`. */
export const decodeFileListCursor = (cursor: string): FileListPosition => {
  const tuple = parseTuple(cursor);
  if (!Array.isArray(tuple) || tuple.length !== 2) throw invalidCursor();
  const [createdAt, id] = tuple as unknown[];
  if (typeof createdAt !== 'string' || typeof id !== 'string' || !UUID_PATTERN.test(id)) {
    throw invalidCursor();
  }
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) throw invalidCursor();
  return { createdAt: date, id };
};
