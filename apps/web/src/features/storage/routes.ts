/** Rutas de `storage` que la web enlaza desde varios componentes (spec 006: una URL por carpeta). */
export const MY_FILES_PATH = '/archivos';
export const MY_FILES_LABEL = 'Mis archivos';
export const TRASH_PATH = '/papelera';
/** Resumen de espacio (spec 007 D-18). */
export const SPACE_PATH = '/espacio';

export function folderPath(folderId: string): string {
  return `${MY_FILES_PATH}/carpeta/${encodeURIComponent(folderId)}`;
}

/** Ficha de un archivo con su historial de versiones (014 D-10). */
export function fileDetailPath(fileId: string): string {
  return `${MY_FILES_PATH}/archivo/${encodeURIComponent(fileId)}`;
}

/** Ruta de una carpeta o de la raíz (`null`). */
export function locationPath(folderId: string | null): string {
  return folderId === null ? MY_FILES_PATH : folderPath(folderId);
}
