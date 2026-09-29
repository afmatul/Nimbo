import { Inject, Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';

import { TransactionContext } from '../../../../shared';
import type { Actor } from '../../../../shared';
import type { IAccessLevelReader } from '../../application/i-access-level-reader.port';
import { AccessLevel } from '../../domain/access-level.enum';

import { accessibleNodes } from './accessible-nodes';
import type { AccessibleNodesFragment } from './accessible-nodes';

/** Si un nodo aparece con varios niveles, gana el primero de esta lista (plan 003 §6.5). */
const LEVEL_PRECEDENCE: readonly AccessLevel[] = [
  AccessLevel.OWNER,
  AccessLevel.EDITOR,
  AccessLevel.VIEWER,
];

/**
 * El nivel filtra también los valores que no son de `AccessLevel`: un nivel desconocido no da acceso (cerrado por
 * defecto) y el resultado siempre es un `AccessLevel`.
 */
const levelQuery = (fragment: AccessibleNodesFragment): string =>
  `SELECT accesibles.nivel AS nivel FROM (${fragment.sql}) accesibles
   WHERE accesibles.nodo_id = :access_node_id AND accesibles.nivel IN (:...access_levels)
   ORDER BY array_position(ARRAY[:...access_levels]::text[], accesibles.nivel)
   LIMIT 1`;

/** Nivel del nodo según `fragment`, con la precedencia `OWNER > EDITOR > VIEWER`; `null` si no aparece. */
export const readAccessLevel = async (
  manager: EntityManager,
  fragment: AccessibleNodesFragment,
  nodeId: string,
): Promise<AccessLevel | null> => {
  const [sql, values] = manager.connection.driver.escapeQueryWithParameters(
    levelQuery(fragment),
    { ...fragment.parameters, access_node_id: nodeId, access_levels: LEVEL_PRECEDENCE },
    {},
  );
  const [row] = (await manager.query(sql, values)) as { nivel: AccessLevel }[];
  return row?.nivel ?? null;
};

/**
 * `IAccessLevelReader` sobre Postgres (plan 003 §6.5): consulta `accessibleNodes(actor)` con el `EntityManager` de la
 * transacción del actor. Sin `withActor` lanza `ActorScopeMissingError` (ADR-0005), nunca cae al manager raíz.
 * `@Inject` explícito: con `tsx` (esbuild) no hay `design:paramtypes` (nota de T-31).
 */
@Injectable()
export class SqlAccessLevelReader implements IAccessLevelReader {
  constructor(@Inject(TransactionContext) private readonly context: TransactionContext) {}

  async levelFor(actor: Actor, nodeId: string): Promise<AccessLevel | null> {
    return readAccessLevel(this.context.requireActorScope(actor), accessibleNodes(actor), nodeId);
  }
}
