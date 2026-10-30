import { z } from 'zod';

import { isValidEmail } from './identity';

/**
 * Contratos de `sharing` (spec 012, plan §4). El dominio de `api` no importa este paquete (ADR-0008). Las respuestas
 * llevan correos y nombres: viajan solo en el cuerpo (`Cache-Control: no-store`), nunca en bitácoras ni en la URL.
 */

/** Códigos de error de `sharing`. Las clases de `api` los reutilizan (Art. VI). */
export const SHARING_ERROR_CODES = {
  SHARING_INVALID_REQUEST: 'SHARING_INVALID_REQUEST',
  SHARING_INVALID_LEVEL: 'SHARING_INVALID_LEVEL',
  SHARING_RECIPIENT_NOT_FOUND: 'SHARING_RECIPIENT_NOT_FOUND',
  SHARING_CANNOT_SHARE_WITH_SELF: 'SHARING_CANNOT_SHARE_WITH_SELF',
  SHARING_SHARE_NOT_FOUND: 'SHARING_SHARE_NOT_FOUND',
} as const;
export type SharingErrorCode = (typeof SHARING_ERROR_CODES)[keyof typeof SHARING_ERROR_CODES];

/** `fields[].reason` de una petición de `sharing`; `INVALID_LEVEL` se responde como `SHARING_INVALID_LEVEL` (CA-2). */
export type SharingFieldIssueReason = 'INVALID_LEVEL' | 'INVALID_EMAIL' | 'INVALID_NODE';

export const SHARING_FIELD_MESSAGES: Readonly<Record<SharingFieldIssueReason, string>> = {
  INVALID_LEVEL: 'Elige si la persona puede ver o editar.',
  INVALID_EMAIL: 'Escribe un correo válido, por ejemplo nombre@dominio.com.',
  INVALID_NODE: 'Elige un archivo o una carpeta válidos y vuelve a intentarlo.',
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

export type ShareRequest = z.infer<typeof shareRequestSchema>;
export type AccessEntry = z.infer<typeof accessEntrySchema>;
export type AccessList = z.infer<typeof accessListSchema>;
export type ReceivedShare = z.infer<typeof receivedShareSchema>;
export type ReceivedShares = z.infer<typeof receivedSharesSchema>;
