import { z } from 'zod';

import { addReason, byteText, timestamp } from './fields';

/**
 * Ajustes de cuota y vigencia del Administrador (spec 011b, plan §2 y §4). Aquí solo la forma: la suma
 * `plan + extra`, el uso y el estado de la suscripción los valida la función SQL, fuente de verdad (ADR-0035).
 */

/** Tope técnico de un valor en bytes (RN-1, RN-8): el mayor entero exacto de un `number`, 2^53-1. */
const MAX_BYTES = BigInt(Number.MAX_SAFE_INTEGER);
/** Mayor que cero, sin ceros a la izquierda y de 16 cifras como mucho: cero se quita con `DELETE` (RN-1). */
const POSITIVE_BYTES = /^[1-9][0-9]{0,15}$/;
const CALENDAR_DAY = /^\d{4}-\d{2}-\d{2}$/;

const isPositiveBytes = (value: string): boolean =>
  POSITIVE_BYTES.test(value) && BigInt(value) <= MAX_BYTES;

/**
 * Un día `YYYY-MM-DD` que existe en el calendario: `2026-02-30` y `2026-13-01` tienen la forma pero no son días. Lo usan
 * el contrato y los formularios de la web (RN-1, RN-2).
 */
export const isCalendarDay = (value: string): boolean => {
  if (!CALENDAR_DAY.test(value)) return false;
  const midnight = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(midnight.getTime()) && midnight.toISOString().startsWith(value);
};

const extraBytesField = z
  .unknown()
  .transform((value, ctx): string =>
    typeof value === 'string' && isPositiveBytes(value)
      ? value
      : addReason(ctx, 'INVALID_EXTRA_BYTES'),
  );

/** Un día en `America/Guatemala` (`YYYY-MM-DD`); el dominio lo convierte en el instante de fin (RN-1, RN-2). */
const calendarDayField = z
  .unknown()
  .transform((value, ctx): string =>
    typeof value === 'string' && isCalendarDay(value) ? value : addReason(ctx, 'INVALID_DAY'),
  );

/** `PUT /backoffice/accounts/:id/quota` (CA-1 a CA-3): el extra que reemplaza al anterior y el último día que vale. */
export const adjustQuotaRequestSchema = z
  .object({ extraBytes: extraBytesField, until: calendarDayField })
  .strict();

/** `PUT /backoffice/accounts/:id/validity` (CA-6, CA-7): el último día de la vigencia nueva. */
export const adjustValidityRequestSchema = z.object({ expiresAt: calendarDayField }).strict();

/** Estado de la suscripción en la ficha: vigente, en solo lectura, Personal (no vence) o sin suscripción. */
export const ACCOUNT_LIMITS_STATUSES = ['active', 'readOnly', 'personal', 'none'] as const;

/**
 * Límites y vigencia de una cuenta (HU-5, CA-1, CA-3). El extra y su fecha son los vigentes: uno vencido se ve como
 * `0` y `null` (RN-1). Sin suscripción, plan, base y total son `null`. Bytes como texto decimal (ADR-0016).
 */
export const accountLimitsSchema = z
  .object({
    status: z.enum(ACCOUNT_LIMITS_STATUSES),
    planName: z.string().min(1).nullable(),
    usedBytes: byteText,
    baseQuotaBytes: byteText.nullable(),
    extraQuotaBytes: byteText,
    extraQuotaUntil: timestamp.nullable(),
    totalQuotaBytes: byteText.nullable(),
    expiresAt: timestamp.nullable(),
  })
  .strict();

export type AccountLimitsStatus = (typeof ACCOUNT_LIMITS_STATUSES)[number];
export type AccountLimits = z.infer<typeof accountLimitsSchema>;
export type AdjustQuotaRequest = z.output<typeof adjustQuotaRequestSchema>;
export type AdjustValidityRequest = z.output<typeof adjustValidityRequestSchema>;
