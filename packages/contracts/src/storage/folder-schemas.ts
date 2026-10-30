import { z } from 'zod';

import { STORAGE_NODE_FIELD_MESSAGES } from './error-codes';
import {
  folderField,
  nameField,
  onConflictField,
  optionField,
  pageQuerySchema,
  timestamp,
  uuidSchema,
} from './schema-fields';
import { fileSummarySchema } from './schemas';

/** Esquemas de carpetas y de organizar archivos (spec 006, plan §4) y orden del explorador (spec 007, plan §4). */

/** Criterio de orden de `GET /folders/contents`: nombre, tamaño, fecha de modificación o de creación (007 CA-10). */
export const NODE_SORTS = ['name', 'size', 'updated', 'created'] as const;
export type NodeSort = (typeof NODE_SORTS)[number];

export const SORT_DIRECTIONS = ['asc', 'desc'] as const;
export type SortDirection = (typeof SORT_DIRECTIONS)[number];

/**
 * Nivel del actor sobre lo que abre (spec 012 CA-13): `OWNER` en lo propio y en la raíz, `EDITOR` o `VIEWER` en lo
 * compartido con él (el mayor si tiene varios). La web lo usa solo para ocultar acciones (012b RN-1); la API decide.
 */
export const NODE_ACCESS_LEVELS = ['OWNER', 'EDITOR', 'VIEWER'] as const;
export type NodeAccessLevel = (typeof NODE_ACCESS_LEVELS)[number];

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
    updatedAt: timestamp,
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

/**
 * `GET /folders/contents`: sin `folderId` lista la raíz. Reemplaza a `GET /files`. `sort` y `dir` ausentes quedan
 * ausentes: la API aplica el orden de 006 (007 D-6: `created`; `desc` con `created` y `asc` con los demás).
 */
export const folderContentsQuerySchema = pageQuerySchema.extend({
  folderId: folderField.optional(),
  sort: optionField(NODE_SORTS, 'INVALID_SORT').optional(),
  dir: optionField(SORT_DIRECTIONS, 'INVALID_DIRECTION').optional(),
});

/**
 * Respuesta de `GET /folders/contents`: carpetas primero y luego en el orden pedido (por defecto, más recientes primero). `folder` es `null` en la raíz;
 * `breadcrumbs` va desde la raíz hasta la carpeta abierta, sin «Mis archivos» (en lo compartido, desde la carpeta
 * compartida, 012 CA-13). `accessLevel` es el nivel del actor sobre la carpeta abierta; en la raíz, `OWNER`.
 */
export const folderContentsResponseSchema = z
  .object({
    folder: folderRefSchema.nullable(),
    breadcrumbs: z.array(folderRefSchema),
    items: z.array(nodeSummarySchema),
    nextCursor: z.string().min(1).nullable(),
    accessLevel: z.enum(NODE_ACCESS_LEVELS),
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
