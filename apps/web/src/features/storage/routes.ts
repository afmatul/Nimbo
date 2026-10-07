/** Rutas de `storage` que la web enlaza desde varios componentes (spec 006: una URL por carpeta). */
export const MY_FILES_PATH = '/archivos';
export const MY_FILES_LABEL = 'Mis archivos';
export const TRASH_PATH = '/papelera';
/** Resumen de espacio (spec 007 D-18). */
export const SPACE_PATH = '/espacio';

export function folderPath(folderId: string): string {
  return `${MY_FILES_PATH}/carpeta/${encodeURIComponent(folderId)}`;
}

/** Ruta de una carpeta o de la raíz (`null`). */
export function locationPath(folderId: string | null): string {
  return folderId === null ? MY_FILES_PATH : folderPath(folderId);
}

/** Parámetro de búsqueda con la fila que recibe el foco al volver de la vista previa (017 §6). */
const RETURN_FOCUS_PARAM = 'foco';

/** Búsqueda de una ruta de Next (`searchParams`). */
export type RouteSearch = Readonly<Record<string, string | readonly string[] | undefined>>;

/** Vuelta acotada (017 plan §2.5): la carpeta del archivo, o la raíz, con su fila como objetivo de foco. */
export function returnPathOf(file: {
  readonly id: string;
  readonly folderId: string | null;
}): string {
  const search = new URLSearchParams({ [RETURN_FOCUS_PARAM]: file.id });
  return `${locationPath(file.folderId)}?${search.toString()}`;
}

/** Fila que pide el foco al volver; sin valor único, ninguna. */
export function returnFocusOf(search: RouteSearch): string | null {
  const value = search[RETURN_FOCUS_PARAM];
  return typeof value === 'string' && value !== '' ? value : null;
}
