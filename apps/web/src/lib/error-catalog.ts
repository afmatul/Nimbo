import {
  EMAIL_REQUEST_COOLDOWN_SECONDS,
  FILE_NAME_MAX_LENGTH,
  IDENTITY_ERROR_CODES,
  IDENTITY_FIELD_MESSAGES,
  LOGIN_LOCK_MINUTES,
  PASSWORD_CHANGE_LOCK_MINUTES,
  SHARED_ERROR_CODES,
  STORAGE_ERROR_CODES,
  STORAGE_NODE_FIELD_MESSAGES,
  STORAGE_PREVIEW_FAILURE_CODES,
  SUPPORT_CONTACT_EMAIL,
  formatBytes,
  type FieldIssueReason,
} from '@nimbo/contracts';

import { genericErrorMessage, type ApiErrorDetails } from './api-error';

export { IDENTITY_FIELD_MESSAGES };

const SECONDS_PER_MINUTE = 60;

/** Pantalla con texto propio para `IDENTITY_TOO_MANY_REQUESTS` (002 DT-20); sin ella, el de los enlaces de 001. */
export type ErrorScreen = 'login';

export interface MessageOptions {
  readonly correlationId?: string;
  readonly retryAfterSeconds?: number | undefined;
  readonly screen?: ErrorScreen;
  /** `details` del error (005): cifras, `reason` o `extension`. */
  readonly details?: ApiErrorDetails;
  /** Nombre del archivo, para la extensión de `STORAGE_INVALID_FILE_TYPE` si `details` no la trae. */
  readonly fileName?: string;
}

/** Mensaje de `storage` en dos partes: qué pasó (va en negrita en el panel) y qué hacer (005 spec §9). */
export interface StorageMessage {
  readonly cause: string;
  readonly fix: string;
}

type StorageMessageBuilder = (details: ApiErrorDetails, fileName: string) => StorageMessage;

function bytesOf(details: ApiErrorDetails, key: string): string {
  return formatBytes(Number(details[key] ?? 0));
}

function extensionOf(details: ApiErrorDetails, fileName: string): string {
  const fromServer = details['extension'];
  if (typeof fromServer === 'string' && fromServer !== '') return fromServer;
  return fileName.split('.').pop() ?? '';
}

const fixed =
  (cause: string, fix: string): StorageMessageBuilder =>
  () => ({ cause, fix });

/** Reproduce los mensajes que arma el servidor con `details` (plan 005 §5, Art. VI.3). */
const STORAGE_MESSAGES: Readonly<Record<string, StorageMessageBuilder>> = {
  [STORAGE_ERROR_CODES.STORAGE_FILE_TOO_LARGE]: (details) => ({
    cause: `Este archivo pesa ${bytesOf(details, 'sizeBytes')} y tu plan permite hasta ${bytesOf(details, 'maxBytes')} por archivo.`,
    fix: 'Reduce su tamaño o cambia de plan.',
  }),
  [STORAGE_ERROR_CODES.STORAGE_QUOTA_EXCEEDED]: (details) => ({
    cause: `Te faltan ${bytesOf(details, 'missingBytes')} de espacio para subir este archivo.`,
    fix: 'Libera espacio o cambia de plan.',
  }),
  [STORAGE_ERROR_CODES.STORAGE_INVALID_FILE_TYPE]: (details, fileName) =>
    details['reason'] === 'executable'
      ? { cause: 'No se permiten archivos ejecutables.', fix: 'Sube otro archivo.' }
      : {
          cause: `Este archivo no es un .${extensionOf(details, fileName)} válido.`,
          fix: 'Comprueba que sea el archivo correcto.',
        },
  [STORAGE_ERROR_CODES.STORAGE_EMPTY_FILE]: fixed(
    'El archivo está vacío.',
    'Revisa que tenga contenido y súbelo de nuevo.',
  ),
  [STORAGE_ERROR_CODES.STORAGE_UPLOAD_SIZE_MISMATCH]: fixed(
    'El archivo cambió durante la carga.',
    'Vuelve a subirlo.',
  ),
  [STORAGE_ERROR_CODES.STORAGE_UPLOAD_EXPIRED]: fixed(
    'Esta carga caducó.',
    'Vuelve a subir el archivo.',
  ),
  [STORAGE_ERROR_CODES.STORAGE_TOO_MANY_REQUESTS]: fixed(
    'Hiciste demasiadas solicitudes.',
    'Espera un momento e inténtalo de nuevo.',
  ),
  [STORAGE_ERROR_CODES.STORAGE_NAME_CONFLICT]: fixed(
    'Ya tienes un archivo con ese nombre.',
    'Elige «Conservar ambos» o cancela la carga.',
  ),
  [STORAGE_ERROR_CODES.STORAGE_UPLOAD_NOT_FOUND]: fixed(
    'No encontramos esta carga.',
    'Vuelve a subir el archivo.',
  ),
  [STORAGE_ERROR_CODES.STORAGE_UPLOAD_INCOMPLETE]: fixed(
    'Aún faltan partes del archivo por subir.',
    'Reanuda la carga para completarla.',
  ),
  // Lo responden subir y crear cuando la carpeta de destino ya no existe o está en la papelera (006 CA-6).
  [STORAGE_ERROR_CODES.STORAGE_NODE_NOT_FOUND]: fixed(
    'No encontramos la carpeta de destino.',
    'Puede que la hayas movido a la papelera. Elige otra carpeta y vuelve a intentarlo.',
  ),
  [STORAGE_ERROR_CODES.STORAGE_INVALID_UPLOAD_REQUEST]: fixed(
    'El nombre o el tamaño del archivo no son válidos.',
    'Revisa el nombre y el tamaño del archivo y vuelve a intentarlo.',
  ),
  [STORAGE_ERROR_CODES.STORAGE_INVALID_QUERY]: fixed(
    'No pudimos leer esta página de la lista.',
    'Actualiza la lista e inténtalo de nuevo.',
  ),
  [STORAGE_ERROR_CODES.STORAGE_INVALID_NODE_REQUEST]: fixed(
    'El nombre no es válido.',
    'Revisa el nombre y vuelve a intentarlo.',
  ),
  [STORAGE_ERROR_CODES.STORAGE_INVALID_MOVE]: fixed(
    'No puedes mover una carpeta dentro de sí misma.',
    'Elige otro destino.',
  ),
  [STORAGE_ERROR_CODES.STORAGE_FOLDER_DEPTH_EXCEEDED]: (details) => ({
    cause: `Llegaste al máximo de ${String(details['maxDepth'] ?? '')} niveles de carpetas.`,
    fix: 'Crea la carpeta en otro lugar.',
  }),
  // Mismo texto que `quickAccessLimitMessage` de contracts, en dos partes (006 CA-28).
  [STORAGE_ERROR_CODES.STORAGE_QUICK_ACCESS_LIMIT]: (details) => ({
    cause: `Ya fijaste ${String(details['maxPinned'] ?? '')} elementos.`,
    fix: 'Quita uno para fijar otro.',
  }),
  // Mismo texto que `PreviewUnsupportedError` de api (017 CA-11, RN-1).
  [STORAGE_ERROR_CODES.STORAGE_PREVIEW_UNSUPPORTED]: () => ({
    cause: 'Este tipo de archivo no tiene vista previa.',
    fix: 'Descárgalo para abrirlo.',
  }),
  [STORAGE_PREVIEW_FAILURE_CODES.STORAGE_PREVIEW_PASSWORD_PROTECTED]: fixed(
    'Este archivo está protegido con contraseña.',
    'La vista previa no abre archivos con contraseña y Nimbo no te la pedirá. Descárgalo y ábrelo en tu equipo con su contraseña.',
  ),
  [STORAGE_PREVIEW_FAILURE_CODES.STORAGE_PREVIEW_CORRUPT]: fixed(
    'No pudimos leer este archivo.',
    'Puede estar dañado o su contenido no corresponde a su tipo. El original no cambió: descárgalo para revisarlo en tu equipo.',
  ),
  [STORAGE_PREVIEW_FAILURE_CODES.STORAGE_PREVIEW_UNAVAILABLE]: fixed(
    'La vista previa no está disponible para este archivo.',
    'Tu navegador no pudo abrirlo; puede ser demasiado grande para mostrarlo aquí. El archivo no cambió: descárgalo para abrirlo en tu equipo.',
  ),
  [STORAGE_PREVIEW_FAILURE_CODES.STORAGE_PREVIEW_EXPIRED]: fixed(
    'La vista previa caducó.',
    'Por seguridad, el acceso a la vista previa dura unos minutos. Reintenta para abrirla de nuevo.',
  ),
};

/**
 * Campo «Nombre de la carpeta» (mockup `storage/explorador`, 006 CA-2). `INVALID_NAME` usa el texto de `contracts`
 * porque también cubre «.», «..» y caracteres de control, no solo los separadores de ruta.
 */
const FOLDER_NAME_FIELD_MESSAGES: Readonly<Record<string, string>> = {
  REQUIRED: 'Escribe un nombre para la carpeta.',
  NAME_TOO_LONG: `El nombre puede tener hasta ${String(FILE_NAME_MAX_LENGTH)} caracteres.`,
  INVALID_NAME: STORAGE_NODE_FIELD_MESSAGES.INVALID_NAME,
};

/** Mensaje del campo de nombre de carpeta para un `reason` de `fields`; otro motivo cae en «nombre no válido». */
export function folderNameFieldMessage(reason: string): string {
  return FOLDER_NAME_FIELD_MESSAGES[reason] ?? STORAGE_NODE_FIELD_MESSAGES.INVALID_NAME;
}

/** `409` al crear o renombrar una carpeta (CA-3). La API no envía nombres: la web pone el guardado. */
export function folderNameConflictMessage(storedName: string): string {
  return `Ya existe una carpeta llamada «${storedName}» aquí. Elige otro nombre.`;
}

/** `409` al mover una carpeta (CA-3, CA-7): la web pone el nombre y el destino. */
export function folderMoveConflictMessage(storedName: string, destinationName: string): string {
  return `Ya existe una carpeta llamada «${storedName}» en ${destinationName}. Elige otro destino o cambia el nombre de la carpeta.`;
}

const CODE_MESSAGES: Readonly<Record<string, string>> = {
  [IDENTITY_ERROR_CODES.INVALID_INPUT]: 'Revisa los campos marcados y corrígelos para continuar.',
  [IDENTITY_ERROR_CODES.WEAK_PASSWORD]:
    'Tu contraseña no cumple estos requisitos. Elige otra que los cumpla.',
  [IDENTITY_ERROR_CODES.VERIFICATION_LINK_EXPIRED]:
    'Este enlace venció. Pide uno nuevo y ábrelo en las próximas 24 horas.',
  [IDENTITY_ERROR_CODES.VERIFICATION_LINK_INVALID]:
    'Este enlace no es válido. Usa el enlace del correo más reciente o pide uno nuevo.',
  [IDENTITY_ERROR_CODES.INVALID_CREDENTIALS]:
    'El correo o la contraseña no son correctos. Revísalos o restablece tu contraseña.',
  [IDENTITY_ERROR_CODES.EMAIL_NOT_VERIFIED]:
    'Verifica tu correo con el enlace que te enviamos; si venció, pide uno nuevo.',
  [IDENTITY_ERROR_CODES.ACCOUNT_SUSPENDED]: `Tu cuenta está suspendida. Si crees que es un error, escríbenos a ${SUPPORT_CONTACT_EMAIL}.`,
  [IDENTITY_ERROR_CODES.REFRESH_INVALID]: 'Tu sesión no es válida. Inicia sesión de nuevo.',
  [IDENTITY_ERROR_CODES.SESSION_EXPIRED]: 'Tu sesión terminó. Inicia sesión de nuevo.',
  [IDENTITY_ERROR_CODES.SESSION_REVOKED]: 'Tu sesión se cerró. Inicia sesión de nuevo.',
  [IDENTITY_ERROR_CODES.SESSION_NOT_FOUND]: 'No encontramos esa sesión. Actualiza la lista.',
  [IDENTITY_ERROR_CODES.RESET_LINK_EXPIRED]:
    'Este enlace venció. Pide uno nuevo y úsalo en la próxima hora.',
  [IDENTITY_ERROR_CODES.RESET_LINK_INVALID]:
    'Este enlace no es válido. Usa el enlace del correo más reciente o pide uno nuevo.',
  [IDENTITY_ERROR_CODES.WRONG_PASSWORD]: 'La contraseña actual no es correcta.',
  [SHARED_ERROR_CODES.UNAUTHENTICATED]: 'Tu sesión no es válida o expiró. Inicia sesión de nuevo.',
  [SHARED_ERROR_CODES.FORBIDDEN]: `Tu cuenta no tiene permiso para esta acción. Si crees que es un error, escríbenos a ${SUPPORT_CONTACT_EMAIL}.`,
};

interface TimedMessage {
  /** Espera por omisión si no llegó `Retry-After`. */
  readonly defaultSeconds: number;
  readonly text: (minutes: string) => string;
}

/** Mensajes con los minutos de espera, calculados de `Retry-After` (spec 002 §11). */
const TIMED_MESSAGES: Readonly<Record<string, TimedMessage>> = {
  [IDENTITY_ERROR_CODES.LOGIN_LOCKED]: {
    defaultSeconds: LOGIN_LOCK_MINUTES * SECONDS_PER_MINUTE,
    text: (minutes) =>
      `Hubo demasiados intentos fallidos. Espera ${minutes} minutos o restablece tu contraseña.`,
  },
  [IDENTITY_ERROR_CODES.PASSWORD_CHANGE_LOCKED]: {
    defaultSeconds: PASSWORD_CHANGE_LOCK_MINUTES * SECONDS_PER_MINUTE,
    text: (minutes) =>
      `Hiciste demasiados intentos con una contraseña incorrecta. Espera ${minutes} minutos o restablece tu contraseña.`,
  },
  [IDENTITY_ERROR_CODES.TOO_MANY_REQUESTS]: {
    defaultSeconds: EMAIL_REQUEST_COOLDOWN_SECONDS,
    text: (minutes) =>
      `Ya te enviamos un enlace hace poco. Revisa tu bandeja y la carpeta de spam, o inténtalo de nuevo en ${minutes} minutos.`,
  },
};

const LOGIN_RATE_LIMIT_MESSAGE =
  'Hiciste demasiados intentos. Espera unos minutos y vuelve a intentarlo.';

function isReason(value: string): value is FieldIssueReason {
  return Object.prototype.hasOwnProperty.call(IDENTITY_FIELD_MESSAGES, value);
}

function minutesFrom(seconds: number): string {
  return String(Math.max(1, Math.ceil(seconds / SECONDS_PER_MINUTE)));
}

/** Mensaje de un código de `storage` en dos partes; `null` si el código no es de `storage`. */
export function storageMessage(
  code: string,
  details: ApiErrorDetails = {},
  fileName = '',
): StorageMessage | null {
  return STORAGE_MESSAGES[code]?.(details, fileName) ?? null;
}

/** Mensaje de un `reason` de `fields`. Uno desconocido cae en el genérico de 000 §10. */
export function messageForReason(reason: string, correlationId = ''): string {
  return isReason(reason) ? IDENTITY_FIELD_MESSAGES[reason] : genericErrorMessage(correlationId);
}

/**
 * Mensaje de un `code` (specs 001, 002 §11 y 005 §9; 003 plan §6.2 para `SHARED_*`). Los bloqueos usan los minutos
 * de `Retry-After`; el 429 por IP del inicio de sesión tiene su propio texto (DT-20); los de `storage`, las cifras de
 * `details`. Un código desconocido es el genérico de 000 §10.
 */
export function messageForCode(code: string, options: MessageOptions = {}): string {
  const storage = storageMessage(code, options.details, options.fileName);
  if (storage !== null) return `${storage.cause} ${storage.fix}`;
  if (code === IDENTITY_ERROR_CODES.TOO_MANY_REQUESTS && options.screen === 'login') {
    return LOGIN_RATE_LIMIT_MESSAGE;
  }
  const timed = TIMED_MESSAGES[code];
  if (timed !== undefined) {
    return timed.text(minutesFrom(options.retryAfterSeconds ?? timed.defaultSeconds));
  }
  return CODE_MESSAGES[code] ?? genericErrorMessage(options.correlationId ?? '');
}
