import { z } from 'zod';

import { BACKOFFICE_FIELD_MESSAGES, type BackofficeFieldIssueReason } from './error-codes';

/**
 * Piezas de los esquemas del backoffice que comparten `schemas.ts` y `adjustments.ts` (011, 011b). Interno: `index.ts`
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
