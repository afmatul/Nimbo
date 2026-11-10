/**
 * Qué texto buscar en el contenido indexado y sobre qué archivo de la consulta de `storage` (spec 018b, D-1).
 * `fileIdColumn` y `versionIdColumn` son rutas de propiedad del *query builder* de `storage` con la forma
 * `alias.propiedad` (p. ej. `archivo.versionActualId`): constantes del código, nunca entrada del usuario.
 */
export interface ContentMatchRequest {
  readonly text: string;
  readonly fileIdColumn: string;
  readonly versionIdColumn: string;
}

/** Condición SQL con sus parámetros con nombre, lista para un `andWhere` (sin tipos de TypeORM). */
export interface ContentMatchCondition {
  readonly sql: string;
  readonly parameters: Readonly<Record<string, unknown>>;
}

/**
 * Coincidencia por contenido (spec 018b RN-1, DF-95): el dueño de `fragmento` (`intelligence`) da la condición que dice
 * si algún fragmento indexado de la versión vigente del archivo contiene todas las palabras significativas de `text`;
 * `storage` la inserta en la misma consulta que `accessibleNodes(actor)`, los filtros, el orden y el cursor de 018.
 *
 * Contrato:
 * - `text` viaja solo como el parámetro con nombre `contentText`, nunca interpolado. Es el único parámetro de la
 *   condición y la consulta que la recibe no debe usar ese nombre (TypeORM pisa los parámetros repetidos).
 * - Las columnas son las de `ContentMatchRequest`; la implementación rechaza lo que no sea `alias.propiedad`.
 * - La condición es de solo lectura sobre `fragmento` y no lanza por ningún `text` (uno solo de palabras vacías no
 *   coincide con nada).
 * - Sin `actor`: no ejecuta nada; se evalúa dentro de la consulta de `storage`, sobre el `EntityManager` de
 *   `requireActorScope(actor)`, con la RLS de `fragmento` como segunda barrera.
 */
export interface IContentMatchReader {
  matchCondition(request: ContentMatchRequest): ContentMatchCondition;
}

export const I_CONTENT_MATCH_READER = Symbol('IContentMatchReader');
