import { z } from 'zod';

import { batchFailureSchema, batchItemsSchema } from '../batch';

import { uuidSchema } from './schema-fields';

/** `POST /nodes/batch/delete` y `POST /nodes/batch/download`: solo los elementos. */
export const batchNodesRequestSchema = z.object({ items: batchItemsSchema }).strict();

/** `POST /nodes/batch/move`: los elementos y la carpeta destino; `null` mueve a la raíz. */
export const batchMoveRequestSchema = z
  .object({
    items: batchItemsSchema,
    targetFolderId: uuidSchema.nullable(),
  })
  .strict();

/**
 * Respuesta de `POST /nodes/batch/download`: una URL prefirmada de un solo uso corto por archivo (las carpetas se
 * expanden a sus archivos accesibles) y los elementos que no se pudieron descargar con su código.
 */
export const batchDownloadResponseSchema = z
  .object({
    downloads: z.array(
      z.object({ id: uuidSchema, name: z.string().min(1), url: z.string().url() }).strict(),
    ),
    failed: z.array(batchFailureSchema),
  })
  .strict();

export type BatchNodesRequest = z.infer<typeof batchNodesRequestSchema>;
export type BatchMoveRequest = z.infer<typeof batchMoveRequestSchema>;
export type BatchDownloadResponse = z.infer<typeof batchDownloadResponseSchema>;
