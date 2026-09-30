/** Vida de una carga iniciada y de su reserva de cuota, desde su inicio (RN-7). */
export const UPLOAD_TTL_HOURS = 24;

/** Vida de la URL firmada de descarga (RNF-06, CA-13). */
export const DOWNLOAD_URL_TTL_SECONDS = 300;

/** Longitud máxima del nombre de archivo, en puntos de código (`archivo.nombre varchar(255)`). */
export const FILE_NAME_MAX_LENGTH = 255;

/** Tamaño de página de `GET /files`: por defecto y máximo; un `limit` fuera de rango se ajusta. */
export const FILES_PAGE_DEFAULT = 50;
export const FILES_PAGE_MAX = 100;
