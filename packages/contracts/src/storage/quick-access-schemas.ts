import { z } from 'zod';

import { uuidSchema } from './schema-fields';
import { FILE_KINDS } from './schemas';

/**
 * Esquemas de los accesos rápidos de la barra lateral (spec 006 CA-27 y CA-28, plan §9.2): fijados y recientes por
 * cuenta. Sin fechas ni carpeta del nodo: el orden lo da el servidor y nadie más las consume.
 */

/** Carpeta o archivo de la barra lateral; `kind` (solo archivos) elige el ícono. */
export const quickAccessItemSchema = z
  .object({
    type: z.enum(['file', 'folder']),
    id: uuidSchema,
    name: z.string().min(1),
    kind: z.enum(FILE_KINDS).optional(),
  })
  .strict();

/** `GET /quick-access`: fijados por fecha de fijado y recientes por apertura, ambos del más nuevo al más viejo. */
export const quickAccessListSchema = z
  .object({
    pinned: z.array(quickAccessItemSchema),
    recent: z.array(quickAccessItemSchema),
    hasMoreRecent: z.boolean(),
  })
  .strict();

/** Segmento `:nodeType` de `/quick-access/{pins|recents}/:nodeType/:nodeId`, como `/trash/{files|folders}`. */
export const QUICK_ACCESS_NODE_PATHS = ['files', 'folders'] as const;
export const quickAccessNodePathSchema = z.enum(QUICK_ACCESS_NODE_PATHS);

/** Mensaje de `STORAGE_QUICK_ACCESS_LIMIT` (CA-28) con el tope de `details.maxPinned`. */
export const quickAccessLimitMessage = (maxPinned: number): string =>
  `Ya fijaste ${String(maxPinned)} elementos. Quita uno para fijar otro.`;

export type QuickAccessItem = z.infer<typeof quickAccessItemSchema>;
export type QuickAccessList = z.infer<typeof quickAccessListSchema>;
export type QuickAccessNodePath = (typeof QUICK_ACCESS_NODE_PATHS)[number];
