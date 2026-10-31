import { File } from '../../domain/file';
import { FileName } from '../../domain/file-name.vo';
import { Folder } from '../../domain/folder';
import { FolderName } from '../../domain/folder-name.vo';
import { FolderPath } from '../../domain/folder-path';

import type { ArchivoOrmEntity } from './archivo.orm-entity';
import type { CarpetaOrmEntity } from './carpeta.orm-entity';
import { toTrashState } from './trash-columns';

/** Filas de `archivo` y `carpeta` → entidades de dominio, compartidas por los repositorios de nodos (PD-145). */

/** Fila → `File`; también la usan la papelera y la búsqueda (018); un archivo no guarda ruta: no hay nada que rehacer. */
export const toFile = (row: ArchivoOrmEntity): File =>
  File.rehydrate({
    id: row.id,
    ownerId: row.propietarioId,
    folderId: row.carpetaId,
    name: FileName.of(row.nombre),
    kind: row.tipo,
    sizeBytes: row.tamanoBytes,
    currentVersionId: row.versionActualId,
    createdAt: row.creadoEn,
    updatedAt: row.actualizadoEn,
    trash: toTrashState(row),
  });

/** Fila → `Folder`; también la usa la búsqueda (018). */
export const toFolder = (row: CarpetaOrmEntity): Folder =>
  Folder.rehydrate({
    id: row.id,
    ownerId: row.propietarioId,
    parentId: row.carpetaPadreId,
    name: FolderName.of(row.nombre),
    path: FolderPath.of(row.ruta),
    createdAt: row.creadoEn,
    updatedAt: row.actualizadoEn,
    trash: toTrashState(row),
  });
