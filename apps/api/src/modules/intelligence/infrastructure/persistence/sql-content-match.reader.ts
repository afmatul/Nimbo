import { Injectable } from '@nestjs/common';

import type {
  ContentMatchCondition,
  ContentMatchRequest,
  IContentMatchReader,
} from '../../../storage';

/** Ruta de propiedad del *query builder* de `storage`: `alias.propiedad`, sin espacios, comillas ni operadores. */
const PROPERTY_PATH = /^[A-Za-z_][A-Za-z0-9_]*\.[A-Za-z_][A-Za-z0-9_]*$/u;

const propertyPath = (path: string): string => {
  if (!PROPERTY_PATH.test(path)) {
    throw new TypeError('La columna de la coincidencia por contenido debe ser `alias.propiedad`.');
  }
  return path;
};

/**
 * `IContentMatchReader` sobre `fragmento` (spec 018b D-2, DF-95): el archivo y su versión vigente están entre los
 * fragmentos cuyo `texto_busq` (`to_tsvector('spanish', texto)`, 019) contiene todas las palabras significativas del
 * texto (`plainto_tsquery` las une con AND y quita las vacías). La subconsulta no está correlacionada, para que el
 * planificador pueda ir por `idx_fragmento_texto_busq` (GIN) en lugar de evaluar `@@` archivo por archivo (plan R-1).
 * No lee tablas de `storage`: recibe sus columnas. Solo el fragmento de la versión vigente cuenta; existe solo si su `indexacion` es
 * `indexado` (`IndexingService.swap` los escribe juntos en una transacción y `indexado` es final, RN-4).
 */
@Injectable()
export class SqlContentMatchReader implements IContentMatchReader {
  matchCondition(request: ContentMatchRequest): ContentMatchCondition {
    const fileId = propertyPath(request.fileIdColumn);
    const versionId = propertyPath(request.versionIdColumn);
    return {
      sql:
        `(${fileId}, ${versionId}) IN (SELECT f.archivo_id, f.version_archivo_id FROM fragmento f ` +
        "WHERE f.texto_busq @@ plainto_tsquery('spanish', :contentText))",
      parameters: { contentText: request.text },
    };
  }
}
