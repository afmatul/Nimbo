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

/** Conjunto vacío con las columnas tipadas: nadie ve nada por aquí (roles internos siempre; `CLIENT` hasta 005). */
const EMPTY_ACCESSIBLE_NODES: AccessibleNodesFragment = Object.freeze({
  sql: 'SELECT NULL::uuid AS nodo_id, NULL::text AS tipo_nodo, NULL::text AS nivel WHERE false',
  parameters: Object.freeze({}),
});

/**
 * Nodos a los que el actor tiene acceso, con su nivel (plan 003 §6.5). Función pura, sin DI. Los roles internos
 * reciben siempre el conjunto vacío (CA-9): ven metadatos por `INodeMetadataReader` (005/011), nunca por aquí.
 * 005 reemplaza el caso `CLIENT` por la propiedad y 012 agrega las comparticiones (§6.11).
 */
export const accessibleNodes = (_actor: Actor): AccessibleNodesFragment => EMPTY_ACCESSIBLE_NODES;
