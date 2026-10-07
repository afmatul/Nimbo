import type { NodeOrderKey, NodeSort } from '../../domain/node-order';

import type { NodeListPosition } from './node-list-cursor';
import type { Condition } from './node-sql';

export type SqlDirection = 'ASC' | 'DESC';

/** Propiedad de la entidad (`archivo` o `carpeta`) que ordena cada criterio; el nombre va sin mayúsculas. */
const PROPERTY_OF: Readonly<Record<Exclude<NodeSort, 'name'>, string>> = {
  size: 'tamanoBytes',
  updated: 'actualizadoEn',
  created: 'creadoEn',
};

/** Clave de orden de la fila: `lower(nombre)`, igual que los índices únicos de hermanos (plan 007 §2). */
const keyExpression = (alias: string, sort: NodeSort): string =>
  sort === 'name' ? `lower(${alias}.nombre)` : `${alias}.${PROPERTY_OF[sort]}`;

/** El valor del cursor llega como texto; con el nombre se baja igual que la columna. */
const valueExpression = (sort: NodeSort): string =>
  sort === 'name' ? 'lower(CAST(:afterValue AS text))' : ':afterValue';

const directionOf = (key: NodeOrderKey): SqlDirection => (key.dir === 'asc' ? 'ASC' : 'DESC');

/**
 * `ORDER BY` de un grupo del listado: su clave y el id, en la misma dirección. Sin orden pedido es
 * `creado_en DESC, id DESC`, el de 006, que sirven los índices `idx_*_creado`.
 */
export const orderByOf = (
  alias: string,
  key: NodeOrderKey,
): readonly (readonly [string, SqlDirection])[] => {
  const direction = directionOf(key);
  return [
    [keyExpression(alias, key.sort), direction],
    [`${alias}.id`, direction],
  ];
};

/** Paginación por teclado: las filas que siguen a `after` en `orderByOf(alias, key)`, sin incluirla. */
export const afterCondition = (
  alias: string,
  key: NodeOrderKey,
  after: NodeListPosition,
): Condition => {
  const comparator = directionOf(key) === 'ASC' ? '>' : '<';
  return {
    sql: `(${keyExpression(alias, key.sort)}, ${alias}.id) ${comparator} (${valueExpression(key.sort)}, :afterId)`,
    parameters: { afterValue: after.value, afterId: after.id },
  };
};
