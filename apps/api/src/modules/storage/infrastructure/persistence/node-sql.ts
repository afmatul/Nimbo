import type { EntityManager } from 'typeorm';

import type { AccessibleNodesFragment } from '../../../access';
import type { FolderPath } from '../../domain/folder-path';

/** `tipo_nodo` de los fragmentos de `access`: mezclan archivos y carpetas (plan 006 §2). */
export type NodeTable = 'archivo' | 'carpeta';

/** SQL con sus parámetros con nombre, para un `where`/`andWhere` de TypeORM. */
export interface Condition {
  readonly sql: string;
  readonly parameters: Readonly<Record<string, unknown>>;
}

/**
 * `idColumn` está entre los nodos de `table` que da `fragment` (`accessibleNodes` u `ownedTrashedNodes`): el fragmento
 * de `access` va dentro de la consulta (ADR-0005).
 */
export const nodesIn = (
  fragment: AccessibleNodesFragment,
  idColumn: string,
  table: NodeTable,
): Condition => ({
  sql: `${idColumn} IN (SELECT nodo_id FROM (${fragment.sql}) nodos WHERE nodos.tipo_nodo = '${table}')`,
  parameters: fragment.parameters,
});

/**
 * Reubica la `ruta` y la `profundidad` de todo el subárbol del dueño guardado bajo `from` (incluida la propia carpeta y
 * lo que está en la papelera) para que cuelgue de `to`. La ruta solo lleva UUID y «/»: no hay comodines que escapar.
 * `idx_carpeta_ruta` sirve al prefijo.
 */
export const rebaseSubtree = async (
  manager: EntityManager,
  ownerId: string,
  from: FolderPath,
  to: FolderPath,
): Promise<void> => {
  await manager.query(
    `UPDATE carpeta SET ruta = $1 || substr(ruta, $2), profundidad = profundidad + $3
      WHERE propietario_id = $4 AND ruta LIKE $5`,
    [to.value, from.value.length + 1, to.depth - from.depth, ownerId, `${from.value}%`],
  );
};
