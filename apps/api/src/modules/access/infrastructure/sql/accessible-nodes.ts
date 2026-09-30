import { Role } from '../../../../shared';
import type { Actor } from '../../../../shared';

/**
 * `SELECT` con columnas `(nodo_id uuid, tipo_nodo text, nivel text)` y sus parámetros con nombre, todos con prefijo
 * `access_`, para usarlo dentro de un QueryBuilder (plan 003 §5), p. ej.
 * `archivo.id IN (SELECT nodo_id FROM (<sql>) accesibles)` con `parameters`.
 */
export interface AccessibleNodesFragment {
  readonly sql: string;
  readonly parameters: Readonly<Record<string, unknown>>;
}

/** Conjunto vacío con las columnas tipadas: los roles internos nunca ven nodos de cliente por aquí. */
const EMPTY_ACCESSIBLE_NODES: AccessibleNodesFragment = Object.freeze({
  sql: 'SELECT NULL::uuid AS nodo_id, NULL::text AS tipo_nodo, NULL::text AS nivel WHERE false',
  parameters: Object.freeze({}),
});

/**
 * Rama de propiedad (plan 005 D-17): los archivos del actor fuera de la papelera. `access` lee `archivo` por SQL,
 * sin importar `storage` (ADR-0010). 012 agrega aquí el `UNION ALL` de comparticiones.
 */
const OWNED_FILES_SQL =
  "SELECT a.id AS nodo_id, 'archivo'::text AS tipo_nodo, 'OWNER'::text AS nivel FROM archivo a " +
  'WHERE a.propietario_id = :access_actor_id AND a.eliminado_en IS NULL';

const ownedNodes = (actor: Actor): AccessibleNodesFragment =>
  Object.freeze({
    sql: OWNED_FILES_SQL,
    parameters: Object.freeze({ access_actor_id: actor.id }),
  });

/**
 * Nodos a los que el actor tiene acceso, con su nivel (plan 003 §6.5). Función pura, sin DI. Los roles internos
 * reciben siempre el conjunto vacío (CA-9): ven metadatos por `INodeMetadataReader` (011), nunca por aquí.
 */
export const accessibleNodes = (actor: Actor): AccessibleNodesFragment =>
  actor.role === Role.CLIENT ? ownedNodes(actor) : EMPTY_ACCESSIBLE_NODES;
