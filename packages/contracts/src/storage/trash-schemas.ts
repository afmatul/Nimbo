import { z } from 'zod';

import { folderRefSchema, nodeSummarySchema } from './folder-schemas';
import { byteCount, pageQuerySchema, timestamp, uuidSchema } from './schema-fields';
import { FILE_KINDS } from './schemas';

/** Esquemas de la papelera (spec 006, plan §4). Desde la papelera no hay descarga ni vista previa (CA-12). */

/**
 * Elemento propio de la papelera: un archivo o una carpeta con todo lo que arrastró (CA-11). `sizeBytes` de una
 * carpeta es la suma de su contenido (RN-6). Los días restantes los calcula `web` desde `purgeAt`.
 */
export const trashItemSchema = z
  .object({
    id: uuidSchema,
    type: z.enum(['file', 'folder']),
    name: z.string().min(1),
    kind: z.enum(FILE_KINDS).optional(),
    sizeBytes: byteCount,
    originalFolder: folderRefSchema.nullable(),
    deletedAt: timestamp,
    purgeAt: timestamp,
  })
  .strict();

/** `GET /trash`: más recientes primero. */
export const listTrashQuerySchema = pageQuerySchema;

export const listTrashResponseSchema = z
  .object({ items: z.array(trashItemSchema), nextCursor: z.string().min(1).nullable() })
  .strict();

/** `GET /trash/summary`: espacio que ocupa la papelera y retención del plan (CA-12). */
export const trashSummarySchema = z
  .object({
    itemCount: z.number().int().nonnegative(),
    totalBytes: byteCount,
    retentionDays: z.number().int().positive(),
  })
  .strict();

/** Cómo volvió el elemento: en su lugar (CA-13), como «nombre (n)» (CA-14) o en la raíz (CA-15). */
export const RESTORE_OUTCOMES = ['restored', 'renamed', 'moved_to_root'] as const;
export type RestoreOutcome = (typeof RESTORE_OUTCOMES)[number];

/** `POST /trash/{files|folders}/:id/restore`. */
export const restoreResponseSchema = z
  .object({
    item: nodeSummarySchema,
    outcome: z.enum(RESTORE_OUTCOMES),
    originalName: z.string().min(1),
  })
  .strict();

/** `DELETE /trash/{files|folders}/:id` (síncrono, CA-18). */
export const purgeResponseSchema = z.object({ freedBytes: byteCount }).strict();

/** `202` de `DELETE /trash`: el espacio baja cuando termina el trabajo `trash-purge` (CA-18). */
export const emptyTrashResponseSchema = z
  .object({ scheduledItems: z.number().int().nonnegative(), pendingBytes: byteCount })
  .strict();

export type TrashItem = z.infer<typeof trashItemSchema>;
export type ListTrashQuery = z.output<typeof listTrashQuerySchema>;
export type ListTrashResponse = z.infer<typeof listTrashResponseSchema>;
export type TrashSummary = z.infer<typeof trashSummarySchema>;
export type RestoreResponse = z.infer<typeof restoreResponseSchema>;
export type PurgeResponse = z.infer<typeof purgeResponseSchema>;
export type EmptyTrashResponse = z.infer<typeof emptyTrashResponseSchema>;
