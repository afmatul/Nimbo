import { z } from 'zod';

import { isValidEmail } from './identity';
import { byteCount } from './storage/schema-fields';

/**
 * Contratos de `sharing` (specs 012 y 013, plan §4). El dominio de `api` no importa este paquete (ADR-0008). Las
 * respuestas llevan correos y nombres, y la de generar un enlace público su token: viajan solo en el cuerpo
 * (`Cache-Control: no-store`), nunca en bitácoras ni en la URL.
 */

/** Códigos de error de `sharing`. Las clases de `api` los reutilizan (Art. VI). */
export const SHARING_ERROR_CODES = {
  SHARING_INVALID_REQUEST: 'SHARING_INVALID_REQUEST',
  SHARING_INVALID_LEVEL: 'SHARING_INVALID_LEVEL',
  SHARING_RECIPIENT_NOT_FOUND: 'SHARING_RECIPIENT_NOT_FOUND',
  SHARING_CANNOT_SHARE_WITH_SELF: 'SHARING_CANNOT_SHARE_WITH_SELF',
  SHARING_SHARE_NOT_FOUND: 'SHARING_SHARE_NOT_FOUND',
  SHARING_LINK_NOT_FOUND: 'SHARING_LINK_NOT_FOUND',
  SHARING_LINK_UNAVAILABLE: 'SHARING_LINK_UNAVAILABLE',
  SHARING_LINK_PASSWORD_INVALID: 'SHARING_LINK_PASSWORD_INVALID',
} as const;
export type SharingErrorCode = (typeof SHARING_ERROR_CODES)[keyof typeof SHARING_ERROR_CODES];

/** `fields[].reason` de una petición de `sharing`; `INVALID_LEVEL` se responde como `SHARING_INVALID_LEVEL` (CA-2). */
export type SharingFieldIssueReason =
  'INVALID_LEVEL' | 'INVALID_EMAIL' | 'INVALID_NODE' | 'INVALID_EXPIRY' | 'INVALID_PASSWORD';

export const SHARING_FIELD_MESSAGES: Readonly<Record<SharingFieldIssueReason, string>> = {
  INVALID_LEVEL: 'Elige si la persona puede ver o editar.',
  INVALID_EMAIL: 'Escribe un correo válido, por ejemplo nombre@dominio.com.',
  INVALID_NODE: 'Elige un archivo o una carpeta válidos y vuelve a intentarlo.',
  INVALID_EXPIRY: 'Elige un vencimiento de 1, 7 o 30 días.',
  INVALID_PASSWORD: 'Escribe una contraseña de 8 a 128 caracteres o deja el campo vacío.',
};

/** Niveles que se asignan; `OWNER` nace de la propiedad y no se asigna (RN-2, DF-31). */
export const SHARE_LEVELS = ['VIEWER', 'EDITOR'] as const;
export type ShareLevel = (typeof SHARE_LEVELS)[number];

export const SHARE_NODE_TYPES = ['file', 'folder'] as const;
export type ShareNodeType = (typeof SHARE_NODE_TYPES)[number];

/** Origen de un acceso: compartido en el nodo o heredado de una carpeta que lo contiene (CA-8, RN-4). */
export const ACCESS_ORIGINS = ['direct', 'inherited'] as const;
export type AccessOrigin = (typeof ACCESS_ORIGINS)[number];

const timestamp = z.string().datetime();
const levelSchema = z.enum(SHARE_LEVELS);
const nodeTypeSchema = z.enum(SHARE_NODE_TYPES);

/** Campo que acepta `isValid` o se marca con `reason` y su mensaje; `normalize` prepara el valor antes. */
function reasonField<T>(
  reason: SharingFieldIssueReason,
  isValid: (value: unknown) => value is T,
  normalize: (value: unknown) => unknown = (value) => value,
) {
  return z.unknown().transform((raw, ctx): T => {
    const value = normalize(raw);
    if (isValid(value)) return value;
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: SHARING_FIELD_MESSAGES[reason],
      params: { reason },
    });
    return z.NEVER;
  });
}

const isShareLevel = (value: unknown): value is ShareLevel => levelSchema.safeParse(value).success;
const isNodeType = (value: unknown): value is ShareNodeType =>
  nodeTypeSchema.safeParse(value).success;
const isNodeId = (value: unknown): value is string => z.string().uuid().safeParse(value).success;
const isEmail = (value: unknown): value is string =>
  typeof value === 'string' && isValidEmail(value);
const normalizeEmail = (value: unknown): unknown =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

/** `POST /shares` (CA-1, CA-5): compartir o cambiar el nivel de un acceso directo. El correo va en el cuerpo. */
export const shareRequestSchema = z
  .object({
    nodeType: reasonField('INVALID_NODE', isNodeType),
    nodeId: reasonField('INVALID_NODE', isNodeId),
    email: reasonField('INVALID_EMAIL', isEmail, normalizeEmail),
    level: reasonField('INVALID_LEVEL', isShareLevel),
  })
  .strict();

/** `GET /shares?nodeType&nodeId` (CA-8): el nodo cuyos accesos se piden. */
export const accessListQuerySchema = z
  .object({
    nodeType: reasonField('INVALID_NODE', isNodeType),
    nodeId: reasonField('INVALID_NODE', isNodeId),
  })
  .strict();

const granteeSchema = z
  .object({ id: z.string().uuid(), displayName: z.string().min(1), email: z.string().email() })
  .strict();

const entryFields = { grantee: granteeSchema, level: levelSchema, createdAt: timestamp };

const directEntrySchema = z
  .object({
    ...entryFields,
    shareId: z.string().uuid(),
    origin: z.literal('direct'),
    inheritedFrom: z.null(),
  })
  .strict();

/** Un heredado se revoca en la carpeta que lo da: no tiene `shareId` propio (RN-4). */
const inheritedEntrySchema = z
  .object({
    ...entryFields,
    shareId: z.null(),
    origin: z.literal('inherited'),
    inheritedFrom: z
      .object({ folderId: z.string().uuid(), folderName: z.string().min(1) })
      .strict(),
  })
  .strict();

/** Una persona con acceso a un nodo (CA-8); también la respuesta de `POST /shares` (CA-1, `direct`). */
export const accessEntrySchema = z.discriminatedUnion('origin', [
  directEntrySchema,
  inheritedEntrySchema,
]);

/** `GET /shares?nodeType&nodeId` (CA-8): sin paginar (S-3). */
export const accessListSchema = z.object({ entries: z.array(accessEntrySchema) }).strict();

/** Un acceso directo recibido (CA-22). Del propietario solo viaja su nombre visible, nunca su correo. */
export const receivedShareSchema = z
  .object({
    shareId: z.string().uuid(),
    nodeType: nodeTypeSchema,
    nodeId: z.string().uuid(),
    name: z.string().min(1),
    owner: z.object({ displayName: z.string().min(1) }).strict(),
    level: levelSchema,
    createdAt: timestamp,
  })
  .strict();

/** `GET /shares/received` (CA-22): más recientes primero, sin paginar (S-8). */
export const receivedSharesSchema = z.object({ entries: z.array(receivedShareSchema) }).strict();

/** Vencimientos que se ofrecen al generar un enlace público, en días (013 RN-2). */
export const PUBLIC_LINK_EXPIRY_OPTIONS = [1, 7, 30] as const;
export type PublicLinkExpiryDays = (typeof PUBLIC_LINK_EXPIRY_OPTIONS)[number];
export const PUBLIC_LINK_DEFAULT_EXPIRY_DAYS: PublicLinkExpiryDays = 7;

/** Longitud de la contraseña de un enlace, sin la política de complejidad de la cuenta (013 S-2). */
export const PUBLIC_LINK_PASSWORD_MIN_LENGTH = 8;
export const PUBLIC_LINK_PASSWORD_MAX_LENGTH = 128;

/** Estado de un enlace sin revocar que ve su propietario (013 CA-7). */
export const PUBLIC_LINK_STATUSES = ['active', 'expired'] as const;
export type PublicLinkStatus = (typeof PUBLIC_LINK_STATUSES)[number];

const isExpiryDays = (value: unknown): value is PublicLinkExpiryDays =>
  (PUBLIC_LINK_EXPIRY_OPTIONS as readonly unknown[]).includes(value);
const isLinkPassword = (value: unknown): value is string | undefined =>
  value === undefined ||
  (typeof value === 'string' &&
    value.length >= PUBLIC_LINK_PASSWORD_MIN_LENGTH &&
    value.length <= PUBLIC_LINK_PASSWORD_MAX_LENGTH);
const withDefaultExpiry = (value: unknown): unknown =>
  value === undefined ? PUBLIC_LINK_DEFAULT_EXPIRY_DAYS : value;

/** `POST /public-links` (013 CA-1, CA-2): solo archivos; vencimiento obligatorio, 7 días por omisión. */
export const createPublicLinkSchema = z
  .object({
    fileId: reasonField('INVALID_NODE', isNodeId),
    expiresInDays: reasonField('INVALID_EXPIRY', isExpiryDays, withDefaultExpiry),
    password: reasonField('INVALID_PASSWORD', isLinkPassword),
  })
  .strict();

/** `GET /public-links?fileId` (013 CA-7): el archivo cuyo enlace sin revocar se pide. */
export const publicLinkQuerySchema = z
  .object({ fileId: reasonField('INVALID_NODE', isNodeId) })
  .strict();

/** Un enlace sin revocar, para su propietario (013 CA-7): nunca lleva el token ni la URL (RN-3). */
export const publicLinkSummarySchema = z
  .object({
    id: z.string().uuid(),
    fileId: z.string().uuid(),
    expiresAt: timestamp,
    hasPassword: z.boolean(),
    status: z.enum(PUBLIC_LINK_STATUSES),
    createdAt: timestamp,
  })
  .strict();

/** Respuesta de `GET /public-links?fileId` (013 CA-7): `null` si el archivo no tiene enlace sin revocar. */
export const currentPublicLinkSchema = z
  .object({ link: publicLinkSummarySchema.nullable() })
  .strict();

/** Respuesta de `POST /public-links` (013 CA-1): la URL con el token viaja solo aquí, una vez. */
export const createdPublicLinkSchema = z
  .object({ link: publicLinkSummarySchema, url: z.string().url() })
  .strict();

/**
 * Cuerpos de las rutas del visitante (013 CA-17, plan D-4): solo el token y la contraseña, nunca un id. Todo cuerpo que
 * no los cumple, también uno con un campo de más, se responde con el `404` de CA-11.
 */
export const publicLinkOpenSchema = z.object({ token: z.string() }).strict();
export const publicLinkDownloadSchema = z
  .object({ token: z.string(), password: z.string().optional() })
  .strict();

/** Ficha que ve el visitante (013 CA-9): sin ids, carpeta ni correo de quien comparte. */
export const publicLinkDetailsSchema = z
  .object({
    name: z.string().min(1),
    sizeBytes: byteCount,
    sharedBy: z.object({ displayName: z.string().min(1) }).strict(),
    expiresAt: timestamp,
    requiresPassword: z.boolean(),
  })
  .strict();

export type ShareRequest = z.infer<typeof shareRequestSchema>;
export type AccessListQuery = z.infer<typeof accessListQuerySchema>;
export type AccessEntry = z.infer<typeof accessEntrySchema>;
export type AccessList = z.infer<typeof accessListSchema>;
export type ReceivedShare = z.infer<typeof receivedShareSchema>;
export type ReceivedShares = z.infer<typeof receivedSharesSchema>;
export type CreatePublicLinkRequest = z.infer<typeof createPublicLinkSchema>;
export type PublicLinkQuery = z.infer<typeof publicLinkQuerySchema>;
export type PublicLinkSummary = z.infer<typeof publicLinkSummarySchema>;
export type CurrentPublicLink = z.infer<typeof currentPublicLinkSchema>;
export type CreatedPublicLink = z.infer<typeof createdPublicLinkSchema>;
export type PublicLinkOpenRequest = z.infer<typeof publicLinkOpenSchema>;
export type PublicLinkDownloadRequest = z.infer<typeof publicLinkDownloadSchema>;
export type PublicLinkDetails = z.infer<typeof publicLinkDetailsSchema>;
