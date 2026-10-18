/** Vida del enlace de contenido que ONLYOFFICE usa para leer el documento (plan §4): minutos, no horas (RNF-06). */
export const CONTENT_LINK_TTL_SECONDS = 300;

/** Ruta del contenido firmado, relativa a `EDITING_CALLBACK_BASE_URL` (prefijo `api/v1` incluido). */
export const CONTENT_PATH = '/api/v1/editing/content';

/** Ruta del aviso de guardado (`callbackUrl`), relativa a `EDITING_CALLBACK_BASE_URL`; lleva el enlace en `link`. */
export const CALLBACK_PATH = '/api/v1/editing/callback';
export const CALLBACK_LINK_PARAMETER = 'link';

/**
 * Conexión con ONLYOFFICE ya validada (plan §5). Las cuatro variables son opcionales: si falta alguna, `editing` no
 * está configurado y abrir responde `EDITING_UNAVAILABLE` (RNF-09, CA-15) sin afectar al resto del `api`.
 */
export interface OnlyOfficeConnection {
  /** `ONLYOFFICE_JWT_SECRET`: firma la configuración del editor, sus avisos y los enlaces de contenido. */
  readonly jwtSecret: string;
  /** `ONLYOFFICE_PUBLIC_URL`: desde donde el navegador carga el editor. */
  readonly publicUrl: string;
  /** `ONLYOFFICE_INTERNAL_URL`: el `api` comprueba la salud y (T-05) descarga lo guardado. */
  readonly internalUrl: string;
  /** `EDITING_CALLBACK_BASE_URL`: cómo llega ONLYOFFICE al `api` (en local, `host.docker.internal`). */
  readonly callbackBaseUrl: string;
}

export interface EditingConfig {
  /** `null` si falta alguna variable de ONLYOFFICE. */
  readonly onlyOffice: OnlyOfficeConnection | null;
  /** `EDITING_MAX_DOC_BYTES`: tope editable (RN-10). */
  readonly maxDocBytes: bigint;
}

export const EDITING_CONFIG = Symbol('EDITING_CONFIG');
