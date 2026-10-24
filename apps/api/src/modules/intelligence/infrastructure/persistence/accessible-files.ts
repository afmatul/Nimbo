import type { EntityManager } from 'typeorm';

import type { Actor } from '../../../../shared';
import { accessibleNodes } from '../../../access';

/** SQL con sus parámetros con nombre (`:nombre`), como los fragmentos de `access`. */
export interface NamedQuery {
  readonly sql: string;
  readonly parameters: Readonly<Record<string, unknown>>;
}

/**
 * `column` está entre los archivos vivos que el actor ve: el fragmento de `access` va **dentro** de la consulta
 * (ADR-0005, DF-14). Vacío para los roles internos.
 */
export const accessibleFiles = (actor: Actor, column: string): NamedQuery => {
  const fragment = accessibleNodes(actor);
  return {
    sql: `${column} IN (SELECT nodo_id FROM (${fragment.sql}) nodos WHERE nodos.tipo_nodo = 'archivo')`,
    parameters: fragment.parameters,
  };
};

/** Ejecuta una consulta con parámetros con nombre en el `EntityManager` del actor. */
export const runNamed = async <T>(manager: EntityManager, query: NamedQuery): Promise<T[]> => {
  const [sql, values] = manager.connection.driver.escapeQueryWithParameters(
    query.sql,
    { ...query.parameters },
    {},
  );
  return (await manager.query(sql, values)) as T[];
};
