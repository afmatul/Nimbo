import { z } from 'zod';

import { AUDIT_NOTE_MAX_LENGTH } from '../audit';
import { FILES_PAGE_DEFAULT, FILES_PAGE_MAX, trashItemSchema } from '../storage';

import { addReason, clientRefSchema, exactEmailField } from './fields';

/**
 * Papelera de un cliente vista por Soporte (spec 011b CA-10 a CA-12, plan §4). Sin contenido, versiones, claves de
 * objeto ni URLs: reutiliza el elemento de la papelera de la 006; la restauración responde `RestoreResponse` (006).
 */

const LIMIT_PATTERN = /^[1-9][0-9]*$/;

/** Cursor opaco que emitió la página anterior; vacío no vale. Si no se puede leer, lo rechaza la API (400). */
const cursorField = z.unknown().transform((value, ctx): string | undefined => {
  if (value === undefined) return undefined;
  return typeof value === 'string' && value !== '' ? value : addReason(ctx, 'INVALID_CURSOR');
});

/** CA-12: a diferencia de `GET /trash`, un `limit` fuera de 1..`FILES_PAGE_MAX` no se ajusta, es `400`. */
const limitField = z.unknown().transform((value, ctx): number => {
  if (value === undefined) return FILES_PAGE_DEFAULT;
  const text = typeof value === 'number' ? String(value) : value;
  if (typeof text !== 'string' || !LIMIT_PATTERN.test(text)) return addReason(ctx, 'INVALID_LIMIT');
  const limit = Number(text);
  return limit <= FILES_PAGE_MAX ? limit : addReason(ctx, 'INVALID_LIMIT');
});

/** RN-3: el motivo se recorta y va de 1 a `AUDIT_NOTE_MAX_LENGTH` caracteres. */
const noteField = z.unknown().transform((value, ctx): string => {
  const note = typeof value === 'string' ? value.trim() : '';
  if (note === '') return addReason(ctx, 'NOTE_REQUIRED');
  return note.length <= AUDIT_NOTE_MAX_LENGTH ? note : addReason(ctx, 'NOTE_TOO_LONG');
});

const nodeTypeField = z
  .unknown()
  .transform((value, ctx): 'file' | 'folder' =>
    value === 'file' || value === 'folder' ? value : addReason(ctx, 'INVALID_NODE_TYPE'),
  );

/** `GET /backoffice/client-trash?email&cursor&limit` (CA-10). Responde `400 BACKOFFICE_INVALID_QUERY` con `fields`. */
export const clientTrashQuerySchema = z.object({
  email: exactEmailField,
  cursor: cursorField,
  limit: limitField,
});

/** CA-10: el cliente encontrado y las raíces de su papelera con retención vigente, más recientes primero. */
export const clientTrashResponseSchema = z
  .object({
    client: clientRefSchema,
    items: z.array(trashItemSchema).max(FILES_PAGE_MAX),
    nextCursor: z.string().min(1).nullable(),
  })
  .strict();

/** `POST /backoffice/client-trash/:nodeId/restore` (CA-11, CA-12): `422 BACKOFFICE_INVALID_INPUT` con `fields`. */
export const restoreClientNodeRequestSchema = z
  .object({ email: exactEmailField, note: noteField, type: nodeTypeField })
  .strict();

export type ClientTrashQuery = z.output<typeof clientTrashQuerySchema>;
export type ClientTrashResponse = z.infer<typeof clientTrashResponseSchema>;
export type RestoreClientNodeRequest = z.output<typeof restoreClientNodeRequestSchema>;
