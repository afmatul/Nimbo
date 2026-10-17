import { z } from 'zod';

import { READ_ONLY_REASONS } from './error-codes';

/** Esquemas de la apertura del editor (spec 016, plan §4). Nunca llevan clave de objeto, nombre de archivo ni correo. */

/** Tope del id de conexión de Socket.IO que envía el cliente: acota la entrada, no la valida contra el canal. */
const CONNECTION_ID_MAX_LENGTH = 64;

const editorCount = z.number().int().nonnegative();

/** `POST /files/:fileId/edit-session`: solo el id de conexión del canal en vivo, para entrar a la sala (CA-6). */
export const openEditSessionRequestSchema = z
  .object({ connectionId: z.string().min(1).max(CONNECTION_ID_MAX_LENGTH).optional() })
  .strict();

/** Participante conectado: el nombre lo pone el servidor desde la cuenta (RN-12); el cliente nunca lo envía. */
export const participantSchema = z
  .object({ userId: z.string().uuid(), displayName: z.string().min(1) })
  .strict();

const commonFields = {
  documentServerUrl: z.string().url(),
  /** Configuración de ONLYOFFICE firmada (JWT); la interfaz la entrega tal cual al editor. */
  config: z.record(z.unknown()),
  participants: z.array(participantSchema),
  editors: editorCount,
  maxEditors: editorCount,
  /** La sesión más reciente del archivo falló y quien abre participó en ella (CA-14). */
  lastSaveFailed: z.boolean(),
};

const editModeSchema = z
  .object({
    ...commonFields,
    sessionId: z.string().uuid(),
    mode: z.literal('edit'),
    readOnlyReason: z.null(),
  })
  .strict();

/** En solo lectura no hay sesión ni participación (plan §4). */
const viewModeSchema = z
  .object({
    ...commonFields,
    sessionId: z.null(),
    mode: z.literal('view'),
    readOnlyReason: z.enum(READ_ONLY_REASONS),
  })
  .strict();

/** Abrir responde siempre con un modo: edición o solo lectura con su motivo (spec §3). */
export const openEditSessionResponseSchema = z.discriminatedUnion('mode', [
  editModeSchema,
  viewModeSchema,
]);

/** Avisos de `editing` por el canal en vivo (015 RN-10): sin contenido, nombres de archivo ni tokens (RN-9). */
export const EDITING_EVENTS = {
  PRESENCE: 'editing.presence',
  VERSION_SAVED: 'editing.version-saved',
} as const;

/** `editing.presence`, a la sala del documento: quiénes editan, cuántos y el máximo del plan de la propietaria (CA-6, CA-7). */
export const editingPresenceSchema = z
  .object({
    participants: z.array(participantSchema),
    editors: editorCount,
    maxEditors: editorCount,
  })
  .strict();

/** `editing.version-saved`, a la sala del documento: la sesión dejó una versión nueva (CA-9). */
export const editingVersionSavedSchema = z.object({ sessionId: z.string().uuid() }).strict();

export type OpenEditSessionRequest = z.infer<typeof openEditSessionRequestSchema>;
export type Participant = z.infer<typeof participantSchema>;
export type OpenEditSessionResponse = z.infer<typeof openEditSessionResponseSchema>;
export type EditingPresence = z.infer<typeof editingPresenceSchema>;
export type EditMode = OpenEditSessionResponse['mode'];
export type EditingVersionSaved = z.infer<typeof editingVersionSavedSchema>;
