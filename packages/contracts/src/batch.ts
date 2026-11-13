import { z } from 'zod';

/**
 * Operaciones por lote del explorador (mover, enviar a la papelera, descargar y compartir varios nodos): cada elemento
 * pasa por la misma regla que su operación individual y el resultado dice cuáles salieron bien y cuáles no.
 */
export const BATCH_MAX_ITEMS = 100;

export const BATCH_NODE_TYPES = ['file', 'folder'] as const;

export const batchItemSchema = z
  .object({
    type: z.enum(BATCH_NODE_TYPES, {
      errorMap: () => ({ message: 'Cada elemento es un archivo o una carpeta.' }),
    }),
    id: z.string().uuid('Cada elemento lleva el id de un archivo o una carpeta.'),
  })
  .strict();

export const batchItemsSchema = z
  .array(batchItemSchema)
  .min(1, 'Selecciona al menos un elemento.')
  .max(BATCH_MAX_ITEMS, `Selecciona ${String(BATCH_MAX_ITEMS)} elementos o menos.`);

/** Un elemento que falló y el código de error que habría respondido su operación individual. */
export const batchFailureSchema = batchItemSchema.extend({ code: z.string().min(1) });

/** Respuesta de `POST /nodes/batch/move`, `POST /nodes/batch/delete` y `POST /shares/batch`. */
export const batchResultSchema = z
  .object({ succeeded: z.array(batchItemSchema), failed: z.array(batchFailureSchema) })
  .strict();

export type BatchItem = z.infer<typeof batchItemSchema>;
export type BatchFailure = z.infer<typeof batchFailureSchema>;
export type BatchResult = z.infer<typeof batchResultSchema>;
