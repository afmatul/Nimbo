import { z } from 'zod';

import { STORAGE_NODE_FIELD_MESSAGES } from './error-codes';
import {
  folderField,
  nameField,
  onConflictField,
  pageQuerySchema,
  timestamp,
  uuidSchema,
} from './schema-fields';
import { fileSummarySchema } from './schemas';

/** Esquemas de carpetas y de organizar archivos (spec 006, plan §4). */

const UNKNOWN_FIELD_MESSAGE = STORAGE_NODE_FIELD_MESSAGES.UNKNOWN_FIELD;

/** Nombre de un nodo al crear o renombrar: mismas reglas que al subir, mensajes sin «subir». */
const nodeName = () => nameField(STORAGE_NODE_FIELD_MESSAGES);

/** Referencia mínima a una carpeta (migas, ubicación original). */
export const folderRefSchema = z.object({ id: uuidSchema, name: z.string().min(1) }).strict();

/** Carpeta tal como la ve el cliente. Su tamaño no se guarda (RN-6) y no se lista aquí. */
export const folderSummarySchema = z
  .object({
    id: uuidSchema,
    name: z.string().min(1),
    parentId: uuidSchema.nullable(),
    createdAt: timestamp,
  })
  .strict();

/** Elemento del explorador: carpeta o archivo, discriminado por `type`. */
export const nodeSummarySchema = z.discriminatedUnion('type', [
  folderSummarySchema.extend({ type: z.literal('folder') }),
  fileSummarySchema.extend({ type: z.literal('file') }),
]);

/** `POST /folders`: `parentId: null` crea en la raíz. */
export const createFolderSchema = z
  .object({ name: nodeName(), parentId: folderField })
  .strict(UNKNOWN_FIELD_MESSAGE);

/** `PATCH /folders/:folderId`. */
export const renameFolderSchema = z.object({ name: nodeName() }).strict(UNKNOWN_FIELD_MESSAGE);

/** `POST /folders/:folderId/move`: `parentId: null` mueve a la raíz. */
export const moveFolderSchema = z.object({ parentId: folderField }).strict(UNKNOWN_FIELD_MESSAGE);

/** `PATCH /files/:fileId`: nombre repetido como en 005 (`onConflict`). */
export const renameFileSchema = z
  .object({ name: nodeName(), onConflict: onConflictField })
  .strict(UNKNOWN_FIELD_MESSAGE);

/** `POST /files/:fileId/move`: `folderId: null` mueve a la raíz. */
export const moveFileSchema = z
  .object({ folderId: folderField, onConflict: onConflictField })
  .strict(UNKNOWN_FIELD_MESSAGE);

/** `GET /folders/contents`: sin `folderId` lista la raíz. Reemplaza a `GET /files`. */
export const folderContentsQuerySchema = pageQuerySchema.extend({
  folderId: folderField.optional(),
});

/**
 * Respuesta de `GET /folders/contents`: carpetas primero y luego más recientes primero. `folder` es `null` en la raíz;
 * `breadcrumbs` va desde la raíz hasta la carpeta abierta, sin «Mis archivos».
 */
export const folderContentsResponseSchema = z
  .object({
    folder: folderRefSchema.nullable(),
    breadcrumbs: z.array(folderRefSchema),
    items: z.array(nodeSummarySchema),
    nextCursor: z.string().min(1).nullable(),
  })
  .strict();

export type FolderRef = z.infer<typeof folderRefSchema>;
export type FolderSummary = z.infer<typeof folderSummarySchema>;
export type NodeSummary = z.infer<typeof nodeSummarySchema>;
export type CreateFolderRequest = z.input<typeof createFolderSchema>;
export type CreateFolderInput = z.output<typeof createFolderSchema>;
export type RenameFolderInput = z.output<typeof renameFolderSchema>;
export type MoveFolderInput = z.output<typeof moveFolderSchema>;
export type RenameFileRequest = z.input<typeof renameFileSchema>;
export type RenameFileInput = z.output<typeof renameFileSchema>;
export type MoveFileRequest = z.input<typeof moveFileSchema>;
export type MoveFileInput = z.output<typeof moveFileSchema>;
export type FolderContentsQuery = z.output<typeof folderContentsQuerySchema>;
export type FolderContentsResponse = z.infer<typeof folderContentsResponseSchema>;
