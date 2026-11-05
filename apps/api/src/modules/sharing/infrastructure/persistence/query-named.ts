import type { EntityManager } from 'typeorm';

/** Consulta con parámetros con nombre (los de los fragmentos de `access` y los propios) de los repositorios de `sharing`. */
export const queryNamed = async <T>(
  manager: EntityManager,
  sql: string,
  parameters: Readonly<Record<string, unknown>>,
): Promise<T[]> => {
  const [escaped, values] = manager.connection.driver.escapeQueryWithParameters(
    sql,
    parameters,
    {},
  );
  return (await manager.query(escaped, values)) as T[];
};
