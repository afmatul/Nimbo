import { z } from 'zod';

import { isValidEmail } from '../identity';

import { BACKOFFICE_FIELD_MESSAGES, type BackofficeFieldIssueReason } from './error-codes';

/**
 * Piezas de los esquemas del backoffice que comparten `schemas.ts`, `adjustments.ts` y `trash.ts` (011, 011b). Interno: `index.ts`
 * no lo reexporta, así no entra en el contrato público.
 */

export const timestamp = z.string().datetime();

/** Bytes como texto decimal sin signo ni ceros a la izquierda: un `bigint` no cabe en un número de JSON (ADR-0016). */
export const byteText = z.string().regex(/^(0|[1-9][0-9]*)$/);

/** Marca el campo con su `reason` y el mensaje del catálogo; el valor transformado se descarta. */
export function addReason(
  ctx: z.RefinementCtx,
  reason: BackofficeFieldIssueReason,
): typeof z.NEVER {
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    message: BACKOFFICE_FIELD_MESSAGES[reason],
    params: { reason },
  });
  return z.NEVER;
}

/** Correo exacto de un cliente (011 CA-13, 011b CA-12): recortado, en minúsculas, obligatorio y válido. */
export const exactEmailField = z.unknown().transform((value, ctx): string => {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (email === '') return addReason(ctx, 'REQUIRED');
  return isValidEmail(email) ? email : addReason(ctx, 'INVALID_EMAIL');
});

/** El cliente encontrado por su correo: id, nombre y correo, nada más. */
export const clientRefSchema = z
  .object({ id: z.string().uuid(), fullName: z.string().min(1), email: z.string().email() })
  .strict();
