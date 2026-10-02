import type { NodeGroup, NodeOrder, NodeSort } from '../../domain/node-order';
import type { StorageNode } from '../../domain/storage-node';

import {
  decodeCursorTuple,
  encodeCursorTuple,
  invalidCursor,
  isIsoDate,
  isNodeGroup,
  isNodeId,
} from './cursor-codec';

/**
 * Posición de la última fila de una página: su grupo, el valor de su clave de orden en texto (nombre, bytes en
 * decimal o fecha ISO) y su id, que desempata.
 */
export interface NodeListPosition {
  readonly group: NodeGroup;
  readonly value: string;
  readonly id: string;
}

const TUPLE_LENGTH = 5;
const BYTES_PATTERN = /^\d+$/;

/** Forma válida del valor según la clave del grupo: lo que `valueOf` emite y lo único que la consulta acepta. */
const VALUE_IS_VALID: Readonly<Record<NodeSort, (value: string) => boolean>> = {
  name: (value) => value.length > 0,
  size: (value) => BYTES_PATTERN.test(value),
  updated: isIsoDate,
  created: isIsoDate,
};

/** Valor de la clave `sort` en `node`; `size` solo es la clave de los archivos (`NodeOrder.keyFor`). */
const valueOf = (sort: NodeSort, node: StorageNode): string => {
  if (sort === 'updated') return node.updatedAt.toISOString();
  if (sort === 'created') return node.createdAt.toISOString();
  if (sort === 'size' && node.type === 'file') return node.sizeBytes.toString();
  return node.name.value;
};

/** La tupla `[sort, dir, grupo, valor, id]` fue emitida para `order` y su valor es del tipo de la clave del grupo. */
const positionIn = (tuple: readonly unknown[], order: NodeOrder): NodeListPosition | null => {
  const [sort, dir, group, value, id] = tuple;
  if (sort !== order.sort || dir !== order.dir || !isNodeGroup(group) || !isNodeId(id)) return null;
  if (typeof value !== 'string') return null;
  return VALUE_IS_VALID[order.keyFor(group).sort](value) ? { group, value, id } : null;
};

/**
 * Cursor opaco (base64url de `[sort, dir, grupo, valor, id]`, plan 007 D-8) de la fila `node` en el listado ordenado
 * por `order`: el cliente lo devuelve tal cual y no depende de su forma.
 */
export const encodeNodeListCursor = (order: NodeOrder, node: StorageNode): string => {
  const value = valueOf(order.keyFor(node.type).sort, node);
  return encodeCursorTuple([order.sort, order.dir, node.type, value, node.id]);
};

/**
 * Lanza `InvalidQueryError` (`INVALID_CURSOR`) si el cursor no lo emitió `encodeNodeListCursor` para `order`: otro
 * orden, otro grupo, un valor de otro tipo o un cursor de 006 (CA-11).
 */
export const decodeNodeListCursor = (cursor: string, order: NodeOrder): NodeListPosition => {
  const position = positionIn(decodeCursorTuple(cursor, TUPLE_LENGTH), order);
  if (position === null) throw invalidCursor();
  return position;
};
