import { z } from 'zod';

import { byteCount, timestamp } from './schema-fields';

/** Esquema del resumen de espacio (spec 007, plan §4). Bytes como enteros seguros, como el resto de `storage`. */

/** Bytes por categoría de los archivos activos y de la papelera (CA-2, CA-3). */
export const spaceBreakdownSchema = z
  .object({
    documentsBytes: byteCount,
    imagesBytes: byteCount,
    otherBytes: byteCount,
    trashBytes: byteCount,
  })
  .strict();

/**
 * `GET /storage/summary`: el nombre visible del plan, lo usado, lo reservado por cargas en curso, la cuota y el máximo
 * por archivo del plan, lo disponible, la retención de la papelera, si la cuenta está en solo lectura (010) y el
 * desglose (CA-1, CA-6). Sin ofertas de ampliación. `quotaBytes` es la cuota efectiva: la del plan (`baseQuotaBytes`)
 * más el extra vigente (`extraQuotaBytes`, hasta `extraQuotaUntil`); sin extra o vencido, `0` y `null` (011b RN-1, CA-5).
 */
export const spaceSummaryResponseSchema = z
  .object({
    planName: z.string().min(1),
    usedBytes: byteCount,
    reservedBytes: byteCount,
    quotaBytes: byteCount,
    baseQuotaBytes: byteCount,
    extraQuotaBytes: byteCount,
    extraQuotaUntil: timestamp.nullable(),
    availableBytes: byteCount,
    maxFileBytes: byteCount,
    trashRetentionDays: z.number().int().positive(),
    /** 010 CA-14: la cuenta está en solo lectura; el explorador muestra el aviso y deshabilita las escrituras. */
    readOnly: z.boolean(),
    breakdown: spaceBreakdownSchema,
  })
  .strict();

export type SpaceBreakdown = z.infer<typeof spaceBreakdownSchema>;
export type SpaceSummaryResponse = z.infer<typeof spaceSummaryResponseSchema>;
