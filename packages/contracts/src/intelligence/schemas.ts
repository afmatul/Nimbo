import { z } from 'zod';

import { INDEXING_REASONS, INDEXING_STATES } from './constants';
import type { IndexingReason, IndexingState } from './constants';

/** Esquemas del estado de indexación (spec 019, plan §4). Nunca llevan texto, nombres, extractos ni vectores. */

const stateSchema = z.enum(INDEXING_STATES);
const reasonSchema = z.enum(INDEXING_REASONS).nullable();

/** Estados que llevan motivo; en los demás el motivo es `null` (CA-14, `ck_indexacion_motivo`). */
const STATES_WITH_REASON: readonly IndexingState[] = ['no_indexable', 'fallido'];

interface StateAndReason {
  readonly state: IndexingState | null;
  readonly reason: IndexingReason | null;
}

/** `no_indexable` y `fallido` llevan motivo y los demás estados no (CA-14). */
const reasonMatchesState = ({ state, reason }: StateAndReason): boolean =>
  (state !== null && STATES_WITH_REASON.includes(state)) === (reason !== null);

const REASON_MESSAGE =
  'El motivo va solo con `no_indexable` y `fallido`, y en ellos es obligatorio';

/**
 * `GET /files/:fileId/indexing`. `state: null` si el tipo no se indexa (imágenes, «otros»: sin fecha ni reintento);
 * un tipo indexable sin fila todavía es `pendiente` sin fecha. `canRetry` solo en `fallido` y con permiso de edición.
 */
export const indexingStatusResponseSchema = z
  .object({
    state: stateSchema.nullable(),
    reason: reasonSchema,
    updatedAt: z.string().datetime().nullable(),
    canRetry: z.boolean(),
  })
  .strict()
  .refine(reasonMatchesState, { message: REASON_MESSAGE, path: ['reason'] })
  .refine((status) => !status.canRetry || status.state === 'fallido', {
    message: 'Solo un archivo `fallido` se puede reintentar',
    path: ['canRetry'],
  })
  .refine((status) => status.state !== null || status.updatedAt === null, {
    message: 'Un tipo que no se indexa no tiene fecha de indexación',
    path: ['updatedAt'],
  });

/** `POST /files/:fileId/indexing/retry` → `202`: el archivo vuelve a `pendiente` (CA-13). */
export const indexingRetryResponseSchema = z.object({ state: z.literal('pendiente') }).strict();

/** Avisos de `intelligence` por el canal en vivo (015, `toUser`): sin nombres, texto ni versión. */
export const INDEXING_EVENTS = {
  STATUS_CHANGED: 'indexing.status-changed',
} as const;

/** `indexing.status-changed`, a la propietaria: el estado del archivo cambió (CA-14). */
export const indexingStatusChangedSchema = z
  .object({ fileId: z.string().uuid(), state: stateSchema, reason: reasonSchema })
  .strict()
  .refine(reasonMatchesState, { message: REASON_MESSAGE, path: ['reason'] });

/**
 * `GET /files/:fileId/thumbnail`: extracto de texto de un `.docx` para su miniatura; `null` si no es un `.docx`, es
 * muy grande, está dañado o no tiene texto (la web dibuja entonces la hoja de renglones).
 */
export const fileThumbnailResponseSchema = z
  .object({ text: z.string().min(1).max(600).nullable() })
  .strict();

export type FileThumbnailResponse = z.infer<typeof fileThumbnailResponseSchema>;
export type IndexingStatusResponse = z.infer<typeof indexingStatusResponseSchema>;
export type IndexingRetryResponse = z.infer<typeof indexingRetryResponseSchema>;
export type IndexingStatusChanged = z.infer<typeof indexingStatusChangedSchema>;
