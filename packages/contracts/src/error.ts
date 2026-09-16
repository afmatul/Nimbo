import { z } from 'zod';

/** `code` estable en SCREAMING_SNAKE_CASE con prefijo de módulo (spec 000 RN-1). */
const ERROR_CODE_PATTERN = /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$/;

/** Forma única de todo error HTTP de Nimbo (CA-16). Nunca incluye `stack` ni detalles internos. */
export const errorResponseSchema = z
  .object({
    code: z.string().regex(ERROR_CODE_PATTERN),
    message: z.string().min(1),
    correlationId: z.string().min(1),
  })
  .strict();

export type ErrorResponse = z.infer<typeof errorResponseSchema>;
