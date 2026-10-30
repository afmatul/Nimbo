import {
  BACKOFFICE_ERROR_CODES,
  BACKOFFICE_FIELD_MESSAGES,
  BILLING_ERROR_CODES,
  EMAIL_REQUEST_COOLDOWN_SECONDS,
  FILE_NAME_MAX_LENGTH,
  IDENTITY_ERROR_CODES,
  IDENTITY_FIELD_MESSAGES,
  INTELLIGENCE_ERROR_CODES,
  LOGIN_LOCK_MINUTES,
  PASSWORD_CHANGE_LOCK_MINUTES,
  REQUIRED_REASON,
  SHARED_ERROR_CODES,
  STORAGE_ERROR_CODES,
  STORAGE_NODE_FIELD_MESSAGES,
  SUPPORT_CONTACT_EMAIL,
  formatBytes,
  type FieldIssueReason,
  type FieldIssueResponse,
} from '@nimbo/contracts';

import { genericErrorMessage, type ApiErrorDetails } from './api-error';
import { dayMonthLabel } from './format-date';
import { formatCount, formatPlanBytes } from './format-plan';

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

/** Para qué se pidió espacio: subir un archivo (005) o restaurar una versión (014 CA-12). */
export type QuotaPurpose = 'upload' | 'restore';

/** Lo que el servidor no envía y la pantalla sí sabe: el nombre del archivo y para qué se pidió espacio. */
export interface StorageMessageContext {
  readonly fileName?: string;
  readonly purpose?: QuotaPurpose;
}

type StorageMessageBuilder = (
  details: ApiErrorDetails,
  context: StorageMessageContext,
) => StorageMessage;

const QUOTA_PURPOSE_TEXT: Readonly<Record<QuotaPurpose, string>> = {
  upload: 'subir este archivo',
  restore: 'restaurar esta versión',
};

function bytesOf(details: ApiErrorDetails, key: string): string {
  return formatBytes(Number(details[key] ?? 0));
}

function extensionOf(details: ApiErrorDetails, fileName = ''): string {
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
  [STORAGE_ERROR_CODES.STORAGE_QUOTA_EXCEEDED]: (details, { purpose = 'upload' }) => ({
    cause: `Te faltan ${bytesOf(details, 'missingBytes')} de espacio para ${QUOTA_PURPOSE_TEXT[purpose]}.`,
    fix: 'Libera espacio o cambia de plan.',
  }),
  [STORAGE_ERROR_CODES.STORAGE_INVALID_FILE_TYPE]: (details, { fileName }) =>
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
  // Historial de versiones (014 CA-10, CA-11): el mismo texto que el servidor, en dos partes.
  [STORAGE_ERROR_CODES.STORAGE_VERSION_NOT_FOUND]: fixed(
    'No encontramos esta versión.',
    'Puede que se haya eliminado al superar las versiones que conserva tu plan. Actualiza el historial para ver las disponibles.',
  ),
  [STORAGE_ERROR_CODES.STORAGE_VERSION_ALREADY_CURRENT]: fixed(
    'Esta ya es la versión actual.',
    'Actualiza el historial para ver los cambios.',
  ),
  [STORAGE_ERROR_CODES.STORAGE_ACCOUNT_READ_ONLY]: fixed(
    'Tu suscripción venció y tu cuenta está en solo lectura.',
    'Renueva tu plan para volver a subir, editar y compartir.',
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
};

/** Mensaje del agente en dos partes, como el de `storage`: qué pasó y qué hacer (020b, RNF-14). */
export interface AgentMessage {
  readonly cause: string;
  readonly fix: string;
}

/** Lo que la pantalla sabe y el servidor no envía: si la respuesta se cortó con texto ya recibido (CA-9). */
export interface AgentMessageContext {
  readonly partial?: boolean;
}

type AgentMessageBuilder = (details: ApiErrorDetails, context: AgentMessageContext) => AgentMessage;

const NOT_CHARGED = 'No se descontó tu consulta.';

function numberOf(details: ApiErrorDetails, key: string): number | null {
  const value = details[key];
  return typeof value === 'number' ? value : null;
}

/** CA-7: vacía, o larga con los caracteres que sobran y el máximo (`details` que suma la web con `GET /agent/status`). */
function invalidQuestionMessage(details: ApiErrorDetails): AgentMessage {
  if (details['reason'] === 'empty') {
    return { cause: 'Escribe una pregunta para consultar a tus documentos.', fix: NOT_CHARGED };
  }
  const excess = numberOf(details, 'excessChars');
  const max = numberOf(details, 'maxChars');
  if (excess === null || max === null) {
    return {
      cause: 'Tu pregunta es demasiado larga.',
      fix: `Acórtala para enviarla. ${NOT_CHARGED}`,
    };
  }
  const unit = excess === 1 ? 'carácter' : 'caracteres';
  return {
    cause: `Tu pregunta tiene ${formatCount(excess)} ${unit} de más.`,
    fix: `Acórtala a ${formatCount(max)} o menos para enviarla. ${NOT_CHARGED}`,
  };
}

/** CA-8, RN-5: con fecha de renovación, o sin ella (solo lectura) con la salida de renovar el plan. */
function quotaMessage(details: ApiErrorDetails): AgentMessage {
  const used = `Usaste tus ${formatCount(numberOf(details, 'limit') ?? 0)} consultas de este mes.`;
  const resetsAt = details['resetsAt'];
  if (typeof resetsAt !== 'string') {
    return { cause: used, fix: 'Renueva tu plan para volver a preguntar.' };
  }
  return {
    cause: `${used} Se renuevan el ${dayMonthLabel(resetsAt)}.`,
    fix: 'Mientras tanto, subir, descargar y buscar archivos funciona igual.',
  };
}

const AGENT_MESSAGES: Readonly<Record<string, AgentMessageBuilder>> = {
  [INTELLIGENCE_ERROR_CODES.AGENT_INVALID_QUESTION]: invalidQuestionMessage,
  [INTELLIGENCE_ERROR_CODES.AGENT_QUOTA_EXCEEDED]: quotaMessage,
  [INTELLIGENCE_ERROR_CODES.AGENT_UNAVAILABLE]: (_details, { partial = false }) => ({
    cause: 'El agente no está disponible. Tus archivos siguen a salvo.',
    fix: partial
      ? `La respuesta se cortó; lo de arriba es lo que alcanzó a llegar. ${NOT_CHARGED}`
      : `${NOT_CHARGED} Inténtalo de nuevo en unos minutos.`,
  }),
  [INTELLIGENCE_ERROR_CODES.AGENT_SCOPE_NOT_FOUND]: () => ({
    cause: 'Esa carpeta o archivo ya no está disponible.',
    fix: 'Elige otro ámbito.',
  }),
};

/** Mensaje de un código del agente en dos partes; `null` si el código no es del agente. */
export function agentMessage(
  code: string,
  details: ApiErrorDetails = {},
  context: AgentMessageContext = {},
): AgentMessage | null {
  return AGENT_MESSAGES[code]?.(details, context) ?? null;
}

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
  // Enlace de alta interna (011 CA-5): el mismo texto que el servidor. Sin reenvío del alta: orienta a recuperar.
  [IDENTITY_ERROR_CODES.SETUP_LINK_EXPIRED]:
    'Este enlace venció. Usa «¿Olvidaste tu contraseña?» en el inicio de sesión para crear tu contraseña.',
  [IDENTITY_ERROR_CODES.SETUP_LINK_INVALID]:
    'Este enlace no es válido o ya se usó. Si ya creaste tu contraseña, inicia sesión; si no, usa «¿Olvidaste tu contraseña?».',
  [IDENTITY_ERROR_CODES.WRONG_PASSWORD]: 'La contraseña actual no es correcta.',
  // Cuentas y altas internas (011 CA-2 a CA-6, plan §4).
  [IDENTITY_ERROR_CODES.ACCOUNT_NOT_FOUND]:
    'No encontramos esa cuenta. Vuelve a Cuentas y búscala de nuevo.',
  [IDENTITY_ERROR_CODES.CANNOT_CHANGE_OWN_STATUS]:
    'No puedes suspender ni reactivar tu propia cuenta. Pídeselo a otro Administrador.',
  [IDENTITY_ERROR_CODES.LAST_ACTIVE_ADMIN]:
    'No se puede suspender: debe quedar al menos un Administrador activo. Nada cambió.',
  [IDENTITY_ERROR_CODES.ACCOUNT_STATE_CONFLICT]:
    'La cuenta ya cambió de estado. Recarga la ficha para ver su estado actual.',
  [IDENTITY_ERROR_CODES.ENROLLMENT_CONFLICT]:
    'Ya existe una cuenta con estos datos. Corrige los campos marcados y vuelve a intentarlo.',
  // Ajustes de cuota y vigencia (011b CA-2, CA-3, CA-7): el mismo texto que el servidor.
  [BACKOFFICE_ERROR_CODES.QUOTA_INVALID]:
    'Revisa el espacio extra: debe ser mayor que cero, la fecha de fin no puede ser anterior a hoy y la cuota total no puede superar el máximo admitido.',
  [BACKOFFICE_ERROR_CODES.QUOTA_BELOW_USAGE]:
    'La cuota total no puede quedar por debajo de lo que la cuenta ya usa. Elige un espacio extra mayor.',
  [BACKOFFICE_ERROR_CODES.VALIDITY_NOT_EXTENDED]:
    'Solo puedes extender la vigencia: elige un día posterior al último día vigente que no sea anterior a hoy.',
  [SHARED_ERROR_CODES.UNAUTHENTICATED]: 'Tu sesión no es válida o expiró. Inicia sesión de nuevo.',
  [SHARED_ERROR_CODES.FORBIDDEN]: `Tu cuenta no tiene permiso para esta acción. Si crees que es un error, escríbenos a ${SUPPORT_CONTACT_EMAIL}.`,
  [BILLING_ERROR_CODES.BILLING_PLAN_CATALOG_UNAVAILABLE]:
    'No pudimos cargar los planes. Intenta recargar la página.',
  [BILLING_ERROR_CODES.BILLING_INVALID_INPUT]:
    'Revisa los datos de pago marcados y corrígelos para continuar.',
  [BILLING_ERROR_CODES.BILLING_PLAN_NOT_AVAILABLE]:
    'Este plan no está disponible para contratar. Elige otro plan en Planes.',
  [BILLING_ERROR_CODES.BILLING_PAYMENT_REJECTED]:
    'La tarjeta fue rechazada. No se hizo ningún cargo. Prueba con otra tarjeta.',
  [BILLING_ERROR_CODES.BILLING_INVOICE_NOT_FOUND]:
    'No encontramos esa factura o su PDF aún no está listo. Actualiza la página e inténtalo de nuevo.',
  [BILLING_ERROR_CODES.BILLING_NO_PAID_SUBSCRIPTION]:
    'Tu cuenta usa el plan Personal, que no se renueva ni se cambia. Contrata un plan en Planes.',
  [BILLING_ERROR_CODES.BILLING_PLAN_CHANGE_INVALID]:
    'No pudimos programar el cambio. Ese plan ya no está disponible. Cierra este aviso y elige otro plan de la lista.',
  [BILLING_ERROR_CODES.BILLING_NO_PENDING_PLAN_CHANGE]:
    'No tienes un cambio de plan programado. Recarga la página para ver tu plan actual.',
  [BILLING_ERROR_CODES.BILLING_ALREADY_RENEWED]:
    'Tu plan ya está renovado para el siguiente periodo. No se hizo ningún cargo.',
  [BILLING_ERROR_CODES.BILLING_PLAN_CHANGE_PENDING]:
    'Tienes un cambio de plan programado. Cancélalo para renovar ahora o espera a que se aplique al vencer.',
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
  [SHARED_ERROR_CODES.TOO_MANY_REQUESTS]: {
    defaultSeconds: SECONDS_PER_MINUTE,
    text: (minutes) =>
      `Hiciste demasiados intentos. Espera ${minutes} minutos e inténtalo de nuevo.`,
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
  context: StorageMessageContext = {},
): StorageMessage | null {
  return STORAGE_MESSAGES[code]?.(details, context) ?? null;
}

function isBackofficeReason(value: string): value is keyof typeof BACKOFFICE_FIELD_MESSAGES {
  return Object.prototype.hasOwnProperty.call(BACKOFFICE_FIELD_MESSAGES, value);
}

/** Mensaje de un `reason` de la búsqueda del backoffice (011 CA-13). Uno desconocido cae en el genérico de 000 §10. */
export function backofficeFieldMessage(reason: string, correlationId = ''): string {
  return isBackofficeReason(reason)
    ? BACKOFFICE_FIELD_MESSAGES[reason]
    : genericErrorMessage(correlationId);
}

/** `422 BACKOFFICE_QUOTA_BELOW_USAGE` con `details.usedBytes` (011b CA-2, §6), en GB del catálogo (RN-8). */
export function quotaBelowUsageMessage(usedBytes: string): string {
  return `La cuota total no puede quedar por debajo de lo que la cuenta ya usa (${formatPlanBytes(usedBytes)}).`;
}

/** Ayuda y rechazo de la vigencia (011b CA-7, §6): `lastDay` es el último día vigente, como se muestra. */
export function validityNotLaterMessage(lastDay: string): string {
  return `Solo puedes extender la vigencia: elige un día posterior al ${lastDay}.`;
}

/** Qué falta en cada campo vacío del alta interna (mockup `backoffice/alta-interna`, decisión 8). */
const ENROLLMENT_REQUIRED_MESSAGES: Readonly<Record<string, string>> = {
  fullName: 'Escribe el nombre completo de la persona.',
  email: 'Escribe el correo de la persona.',
  employeeCode: 'Escribe el código de empleado.',
  role: 'Elige el rol de la cuenta.',
};

/**
 * Mensaje de un campo del alta interna (011 CA-6), del navegador o de la API: un campo vacío dice qué dato falta; los
 * demás motivos (formato, correo o código en uso) usan el texto de `contracts`.
 */
export function enrollmentFieldMessage(issue: FieldIssueResponse): string {
  const required =
    issue.reason === REQUIRED_REASON ? ENROLLMENT_REQUIRED_MESSAGES[issue.field] : undefined;
  return required ?? messageForReason(issue.reason);
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
  const storage = storageMessage(code, options.details, { fileName: options.fileName ?? '' });
  if (storage !== null) return `${storage.cause} ${storage.fix}`;
  const agent = agentMessage(code, options.details);
  if (agent !== null) return `${agent.cause} ${agent.fix}`;
  if (code === IDENTITY_ERROR_CODES.TOO_MANY_REQUESTS && options.screen === 'login') {
    return LOGIN_RATE_LIMIT_MESSAGE;
  }
  const timed = TIMED_MESSAGES[code];
  if (timed !== undefined) {
    return timed.text(minutesFrom(options.retryAfterSeconds ?? timed.defaultSeconds));
  }
  return CODE_MESSAGES[code] ?? genericErrorMessage(options.correlationId ?? '');
}
