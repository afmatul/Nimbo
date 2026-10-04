/** Rutas de `storage` que la web enlaza desde varios componentes (spec 006: una URL por carpeta). */
export const MY_FILES_PATH = '/archivos';
export const MY_FILES_LABEL = 'Mis archivos';
export const TRASH_PATH = '/papelera';

export function folderPath(folderId: string): string {
  return `${MY_FILES_PATH}/carpeta/${encodeURIComponent(folderId)}`;
}

/** Ruta de una carpeta o de la raíz (`null`). */
export function locationPath(folderId: string | null): string {
  return folderId === null ? MY_FILES_PATH : folderPath(folderId);
}
