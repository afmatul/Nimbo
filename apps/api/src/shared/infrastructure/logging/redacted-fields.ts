import { SECRET_KEYS } from '../config/secret-keys';

/** Los 13 campos de CA-15 (RN-2). */
const SPEC_REDACTED_FIELDS = [
  'password',
  'passwordHash',
  'token',
  'accessToken',
  'refreshToken',
  'authorization',
  'cookie',
  'secret',
  'apiKey',
  'fileName',
  'nombre',
  'content',
  'prompt',
] as const;

/**
 * Campos de la spec 001 (plan §6.7, D-18): el correo y el nombre completo de la persona, y los del mensaje de
 * correo (`to` lleva la dirección; `html` y `text`, el enlace de verificación). Defensa en profundidad de la regla:
 * **nunca** se registra `job.data` ni un `MailMessage` completo; las bitácoras de correo solo llevan `tag`,
 * `recipientId`, `jobId`, `attemptsMade` y códigos de error.
 */
const IDENTITY_REDACTED_FIELDS = ['email', 'correo', 'fullName', 'to', 'html', 'text'] as const;

/**
 * Campos de la spec 005 (T-41, CA-20): URLs firmadas y sus firmas, la clave de objeto y el `upload_id` de S3, y los
 * nombres de archivo (`name`, `suggestedName`). La auditoría solo lleva UUID, tamaño y modo.
 */
const STORAGE_REDACTED_FIELDS = [
  'url',
  'uploadUrl',
  'claveObjeto',
  'objectKey',
  'uploadId',
  'signature',
  'suggestedName',
  'name',
] as const;

/** Campos de la spec 002 (plan §6.7, CA-25): las contraseñas del cambio de contraseña. */
const SESSION_REDACTED_FIELDS = ['currentPassword', 'newPassword'] as const;

/**
 * Campos del cobro de la spec 009 (§5): la tarjeta completa, su número, el CVC y el NIT; y de la 010 (plan §2, ADR-0031):
 * el instrumento con el que se cobra y su referencia, con su nombre de columna.
 */
const BILLING_REDACTED_FIELDS = [
  'card',
  'cardNumber',
  'number',
  'cvc',
  'nit',
  'instrument',
  'instrumentRef',
  'referencia_instrumento',
] as const;

/** URLs de conexión: llevan usuario y contraseña embebidos (`postgres://usuario:clave@host/bd`). */
const CONNECTION_URL_FIELDS = ['DATABASE_URL', 'DATABASE_MIGRATION_URL', 'REDIS_URL'] as const;

/**
 * Única lista de nombres de campo que el logger redacta, en minúsculas porque la comparación
 * es insensible a mayúsculas (`redactDeep`). Incluye las claves secretas del entorno y las URLs
 * de conexión.
 *
 * Limitación conocida: la redacción es **por nombre de campo**, así que no alcanza a una URL
 * incrustada en el texto de un mensaje o en un `stack`. Para ese caso la mitigación es no
 * registrar al pie de la letra los errores de conexión (ver `RedisHealthIndicator`).
 */
export const REDACTED_FIELDS: ReadonlySet<string> = new Set(
  [
    ...SPEC_REDACTED_FIELDS,
    ...IDENTITY_REDACTED_FIELDS,
    ...SESSION_REDACTED_FIELDS,
    ...STORAGE_REDACTED_FIELDS,
    ...BILLING_REDACTED_FIELDS,
    ...SECRET_KEYS,
    ...CONNECTION_URL_FIELDS,
  ].map((field) => field.toLowerCase()),
);
