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

/** Columnas del fragmento para una tabla de nodos (`archivo` o `carpeta`) cuyo alias es su inicial. */
const ownedSelect = (table: 'archivo' | 'carpeta', alias: string): string =>
  `SELECT ${alias}.id AS nodo_id, '${table}'::text AS tipo_nodo, 'OWNER'::text AS nivel FROM ${table} ${alias} ` +
  `WHERE ${alias}.propietario_id = :access_actor_id`;

/**
 * Rama de propiedad (plan 005 D-17, plan 006 §1): los archivos y carpetas del actor fuera de la papelera. Eliminar una
 * carpeta marca todo su subárbol, así que el filtro sigue siendo plano. `access` lee las tablas por SQL, sin importar
 * `storage` (ADR-0010). 012 agrega aquí el `UNION ALL` de comparticiones.
 */
const OWNED_LIVE_NODES_SQL =
  `${ownedSelect('archivo', 'a')} AND a.eliminado_en IS NULL UNION ALL ` +
  `${ownedSelect('carpeta', 'c')} AND c.eliminado_en IS NULL`;

/**
 * Raíces de la papelera del actor (plan 006 §1): lo que eliminó él mismo, sin lo que arrastró una carpeta. Sin
 * comparticiones: solo el propietario restaura y purga (RN-7).
 */
const OWNED_TRASH_ROOTS_SQL =
  `${ownedSelect('archivo', 'a')} AND a.eliminado_en IS NOT NULL AND a.eliminado_con_carpeta_id IS NULL UNION ALL ` +
  `${ownedSelect('carpeta', 'c')} AND c.eliminado_en IS NOT NULL AND c.eliminado_con_carpeta_id IS NULL`;

/** Fragmento del actor si es `CLIENT`; los roles internos reciben siempre el conjunto vacío (CA-9 de 003). */
const clientFragment = (actor: Actor, sql: string): AccessibleNodesFragment =>
  actor.role === Role.CLIENT
    ? Object.freeze({ sql, parameters: Object.freeze({ access_actor_id: actor.id }) })
    : EMPTY_ACCESSIBLE_NODES;

/**
 * Nodos a los que el actor tiene acceso, con su nivel (plan 003 §6.5). Función pura, sin DI. Los roles internos
 * reciben siempre el conjunto vacío (CA-9): ven metadatos por `INodeMetadataReader` (011), nunca por aquí.
 */
export const accessibleNodes = (actor: Actor): AccessibleNodesFragment =>
  clientFragment(actor, OWNED_LIVE_NODES_SQL);

/**
 * Raíces de la papelera del actor, con las mismas columnas que `accessibleNodes` (plan 006 §2). Función pura; vacío
 * para los roles internos.
 */
export const ownedTrashedNodes = (actor: Actor): AccessibleNodesFragment =>
  clientFragment(actor, OWNED_TRASH_ROOTS_SQL);
