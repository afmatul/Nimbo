import type { Actor } from '../../../../shared';
import type { KeywordQuery, VectorQuery } from '../../application/ports/i-chunk-search.port';
import type { AgentScope } from '../../domain/agent-scope';
import type { IndexingState } from '../../domain/file-indexing';

import { accessibleFiles, accessibleFolders } from './accessible-files';
import type { NamedQuery } from './accessible-files';
import { CHUNK_COLUMNS, toVectorLiteral } from './chunk-rows';

/**
 * SQL de lectura del agente (plan 020 D-2). **Único archivo de `intelligence` que lee tablas de `storage`** (ADR-0035
 * y su enmienda, `architecture.md` §3 regla 7): solo `archivo(id, carpeta_id, version_actual_id, nombre)` y
 * `carpeta(id, ruta)`, de solo lectura y siempre junto a `accessibleNodes(actor)` en la misma consulta. `nombre` solo
 * viaja a la cita del dueño (S-1), nunca al modelo ni a bitácoras. También es el único que lee `indexacion` para el
 * agente. `test/int/intelligence/chunk-search.int-spec.ts` falla si esas columnas cambian.
 */

const INDEXED: IndexingState = 'indexado';
const NO_FILTER: NamedQuery = { sql: 'true', parameters: {} };

/** Fragmento de la versión vigente de su archivo (RN-2): `archivo.version_actual_id`. */
const LIVE_CHUNKS_SOURCE =
  'fragmento f JOIN archivo a ON a.id = f.archivo_id AND a.version_actual_id = f.version_archivo_id';

/** Columnas de una búsqueda: las del fragmento y el nombre de su archivo (`SearchedChunkRow`). */
const SEARCH_COLUMNS = `${CHUNK_COLUMNS}, a.nombre AS archivo_nombre`;

/**
 * Archivos dentro de una carpeta accesible y de todas sus subcarpetas: `carpeta.ruta` es el camino materializado
 * `/<id>/…/<id>/` (solo UUID y «/», sin comodines que escapar), así que el subárbol es el prefijo de la ruta.
 */
const folderScope = (actor: Actor, folderId: string): NamedQuery => {
  const folder = accessibleFolders(actor, 's.id');
  return {
    sql:
      "a.carpeta_id IN (SELECT c.id FROM carpeta s JOIN carpeta c ON c.ruta LIKE s.ruta || '%' " +
      `WHERE s.id = :scopeId AND ${folder.sql})`,
    parameters: { ...folder.parameters, scopeId: folderId },
  };
};

/** Ámbito de la pregunta (RN-9) sobre el alias `a` de `archivo`. */
const scopeFilter = (actor: Actor, scope: AgentScope): NamedQuery => {
  if (scope.type === 'all') return NO_FILTER;
  if (scope.type === 'file') return { sql: 'a.id = :scopeId', parameters: { scopeId: scope.id } };
  return folderScope(actor, scope.id);
};

/** `FROM`/`WHERE` común: versión vigente, archivos que el actor ve vivos y ámbito, todo en la misma consulta. */
const liveChunksIn = (actor: Actor, scope: AgentScope): NamedQuery => {
  const access = accessibleFiles(actor, 'f.archivo_id');
  const inScope = scopeFilter(actor, scope);
  return {
    sql: `${LIVE_CHUNKS_SOURCE} WHERE ${access.sql} AND ${inScope.sql}`,
    parameters: { ...access.parameters, ...inScope.parameters },
  };
};

/**
 * Léxica: OR de los lexemas de la pregunta (`plainto_tsquery` los une con AND, y una pregunta casi nunca coincide
 * entera), ordenada por `ts_rank_cd`. Una pregunta solo con palabras vacías da una consulta vacía, que no encuentra nada.
 */
export const keywordSearchQuery = (actor: Actor, query: KeywordQuery): NamedQuery => {
  const live = liveChunksIn(actor, query.scope);
  return {
    sql:
      "WITH consulta AS (SELECT replace(plainto_tsquery('spanish', :questionText)::text, ' & ', ' | ')::tsquery AS q) " +
      `SELECT ${SEARCH_COLUMNS} FROM consulta, ${live.sql} AND f.texto_busq @@ consulta.q ` +
      'ORDER BY ts_rank_cd(f.texto_busq, consulta.q) DESC, f.id LIMIT :resultLimit',
    parameters: { ...live.parameters, questionText: query.text, resultLimit: query.limit },
  };
};

/**
 * Vectorial por barrido exacto (D-2): `MATERIALIZED` reduce primero a lo de la cuenta, la versión vigente y el ámbito,
 * y solo eso se ordena por coseno; el índice HNSW global filtraría después y perdería resultados.
 */
export const vectorSearchQuery = (actor: Actor, query: VectorQuery): NamedQuery => {
  const live = liveChunksIn(actor, query.scope);
  return {
    sql:
      `WITH candidatos AS MATERIALIZED (SELECT ${SEARCH_COLUMNS}, f.embedding FROM ${live.sql}) ` +
      `SELECT ${CHUNK_COLUMNS}, f.archivo_nombre, ` +
      '1 - (f.embedding <=> CAST(:queryVector AS vector)) AS similitud ' +
      'FROM candidatos f ORDER BY similitud DESC, f.id LIMIT :resultLimit',
    parameters: {
      ...live.parameters,
      queryVector: toVectorLiteral(query.vector),
      resultLimit: query.limit,
    },
  };
};

/** Alguna indexación `indexado` de la versión vigente de un archivo que el actor ve vivo (CA-7). */
export const hasIndexedQuery = (actor: Actor): NamedQuery => {
  const access = accessibleFiles(actor, 'i.archivo_id');
  return {
    sql:
      'SELECT EXISTS (SELECT 1 FROM indexacion i JOIN archivo a ' +
      'ON a.id = i.archivo_id AND a.version_actual_id = i.version_archivo_id ' +
      `WHERE i.estado = :indexedState AND ${access.sql}) AS existe`,
    parameters: { ...access.parameters, indexedState: INDEXED },
  };
};

/** El archivo o la carpeta del ámbito está entre los nodos vivos del actor; ajeno e inexistente dan lo mismo. */
export const scopeExistsQuery = (
  actor: Actor,
  scope: Exclude<AgentScope, { type: 'all' }>,
): NamedQuery => {
  const nodes = scope.type === 'file' ? accessibleFiles : accessibleFolders;
  const membership = nodes(actor, 'CAST(:scopeId AS uuid)');
  return {
    sql: `SELECT ${membership.sql} AS existe`,
    parameters: { ...membership.parameters, scopeId: scope.id },
  };
};
