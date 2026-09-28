import { z } from 'zod';

/** `code` estable en SCREAMING_SNAKE_CASE con prefijo de módulo (spec 000 RN-1). */
const ERROR_CODE_PATTERN = /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$/;

/**
 * Un campo rechazado en un error de entrada (001, ADR-0020). `reason` es genérico en la raíz: cada módulo
 * declara su conjunto cerrado de `reason` en su propia carpeta de contratos.
 */
export const fieldIssueSchema = z
  .object({
    field: z.string(),
    reason: z.string().regex(ERROR_CODE_PATTERN),
    message: z.string().min(1),
  })
  .strict();

export type FieldIssueResponse = z.infer<typeof fieldIssueSchema>;

/**
 * Forma única de todo error HTTP de Nimbo (000 CA-16). Nunca incluye `stack` ni detalles internos.
 * `fields` aparece solo en errores de entrada (001 CA-5, CA-6).
 */
export const errorResponseSchema = z
  .object({
    code: z.string().regex(ERROR_CODE_PATTERN),
    message: z.string().min(1),
    correlationId: z.string().min(1),
    fields: z.array(fieldIssueSchema).optional(),
  })
  .strict();

export type ErrorResponse = z.infer<typeof errorResponseSchema>;
