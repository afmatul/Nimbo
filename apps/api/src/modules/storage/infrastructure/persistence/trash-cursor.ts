import type { TrashItemType } from '../../application/ports/i-trash.repository.port';

import {
  decodeCursorTuple,
  encodeCursorTuple,
  invalidCursor,
  isIsoDate,
  isNodeGroup,
  isNodeId,
} from './cursor-codec';

/** Posición de la última raíz de una página de la papelera: su tipo y su lugar en `eliminado_en DESC, id DESC`. */
export interface TrashPosition {
  readonly type: TrashItemType;
  readonly deletedAt: Date;
  readonly id: string;
}

const TUPLE_LENGTH = 3;

/** Cursor opaco de la papelera (base64url de `[tipo, eliminado_en, id]`, plan 006 §2). */
export const encodeTrashCursor = (position: TrashPosition): string =>
  encodeCursorTuple([position.type, position.deletedAt.toISOString(), position.id]);

/** Lanza `InvalidQueryError` (`INVALID_CURSOR`) si el cursor no es uno emitido por `encodeTrashCursor`. */
export const decodeTrashCursor = (cursor: string): TrashPosition => {
  const [type, deletedAt, id] = decodeCursorTuple(cursor, TUPLE_LENGTH);
  if (!isNodeGroup(type) || !isIsoDate(deletedAt) || !isNodeId(id)) throw invalidCursor();
  return { type, deletedAt: new Date(deletedAt), id };
};
