import {
  BACKOFFICE_FIELD_MESSAGES,
  type AccountLimits,
  type AdjustQuotaRequest,
  type AdjustValidityRequest,
} from '@nimbo/contracts';

import type { ApiClientError } from '../../lib/api-error';
import { backofficeFieldMessage } from '../../lib/error-catalog';
import { calendarDayLabel, lastDayInputValue } from '../../lib/format-date';

import type { FormIssue } from './components/form-dialog';
import { amountAndUnit, bytesOf } from './plan-form-values';

/**
 * Lo que se escribe en los diálogos de cuota y vigencia (011b RN-1, RN-2, RN-8; mockup `backoffice/admin`): el extra en
 * GB enteros del catálogo (base 1024) y los días como `YYYY-MM-DD` de Guatemala. Aquí solo la forma y «hoy»; la suma
 * `plan + extra` frente a lo usado y el último día vigente los vuelve a validar el servidor (ADR-0035).
 */

/** Id de cada campo; el resumen de errores enlaza a ellos y los `fields` del servidor se ubican con él. */
export const QUOTA_FIELD_IDS = { extraBytes: 'cuota-extra', until: 'cuota-hasta' } as const;
export const VALIDITY_FIELD_IDS = { expiresAt: 'vigencia-hasta' } as const;

export const EXTRA_NOT_POSITIVE = 'El espacio extra debe ser mayor que cero.';
export const END_BEFORE_TODAY = 'La fecha de fin no puede ser anterior a hoy.';

const CALENDAR_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Un `<input type="date">` con un día (`YYYY-MM-DD`); vacío si se borró. */
export const isCalendarDay = (day: string): boolean => CALENDAR_DAY.test(day);

export interface QuotaValues {
  /** GB enteros, como el catálogo de planes. */
  readonly extra: string;
  readonly until: string;
}

/** Una petición lista para enviar, o los campos que no valen. */
export type Parsed<Req> = { readonly request: Req } | { readonly issues: readonly FormIssue[] };

/** El extra que ya tiene la cuenta en GB y su último día; vacío si no tiene. */
export function initialQuotaValues(limits: AccountLimits): QuotaValues {
  const amount = amountAndUnit(Number(limits.extraQuotaBytes), ['GB'])?.amount ?? '0';
  return {
    extra: amount === '0' ? '' : amount,
    until: limits.extraQuotaUntil === null ? '' : lastDayInputValue(limits.extraQuotaUntil),
  };
}

/** Bytes del extra escrito, o `null` si no es un entero de GB dentro del tope técnico (RN-1). */
export function extraBytesOf(extra: string): string | null {
  const bytes = bytesOf(extra, 'GB');
  return bytes === null || Number(bytes) > Number.MAX_SAFE_INTEGER ? null : bytes;
}

function extraIssue(bytes: string | null): string | null {
  if (bytes === null) return BACKOFFICE_FIELD_MESSAGES.INVALID_EXTRA_BYTES;
  return bytes === '0' ? EXTRA_NOT_POSITIVE : null;
}

/** El día no puede faltar ni ser anterior a hoy (RN-1, RN-2). */
function dayIssue(day: string, today: string): string | null {
  if (!isCalendarDay(day)) return BACKOFFICE_FIELD_MESSAGES.INVALID_DAY;
  return day < today ? END_BEFORE_TODAY : null;
}

function issuesOf(entries: readonly (readonly [string, string | null])[]): FormIssue[] {
  return entries.flatMap(([fieldId, message]) => (message === null ? [] : [{ fieldId, message }]));
}

/** `PUT …/quota` (CA-1, CA-3): extra mayor que cero y día no anterior a hoy. */
export function quotaRequestOf(values: QuotaValues, today: string): Parsed<AdjustQuotaRequest> {
  const extraBytes = extraBytesOf(values.extra);
  const issues = issuesOf([
    [QUOTA_FIELD_IDS.extraBytes, extraIssue(extraBytes)],
    [QUOTA_FIELD_IDS.until, dayIssue(values.until, today)],
  ]);
  if (issues.length > 0 || extraBytes === null) return { issues };
  return { request: { extraBytes, until: values.until } };
}

/** «Elige un día posterior al 31 oct 2026.»: el rechazo de un día que no extiende (mockup `fecha-no-posterior`). */
export function notLaterIssue(expiresAt: string): FormIssue {
  const lastDay = calendarDayLabel(lastDayInputValue(expiresAt));
  return {
    fieldId: VALIDITY_FIELD_IDS.expiresAt,
    message: `Elige un día posterior al ${lastDay}.`,
  };
}

/** La vigencia actual y hoy, contra los que se compara el día elegido. */
export interface ValidityBounds {
  readonly expiresAt: string;
  readonly today: string;
}

function validityIssue(day: string, bounds: ValidityBounds): FormIssue | null {
  const fieldId = VALIDITY_FIELD_IDS.expiresAt;
  if (!isCalendarDay(day)) return { fieldId, message: BACKOFFICE_FIELD_MESSAGES.INVALID_DAY };
  if (day <= lastDayInputValue(bounds.expiresAt)) return notLaterIssue(bounds.expiresAt);
  return day < bounds.today ? { fieldId, message: END_BEFORE_TODAY } : null;
}

/** `PUT …/validity` (CA-6, CA-7): un día posterior al último vigente y no anterior a hoy. */
export function validityRequestOf(
  day: string,
  bounds: ValidityBounds,
): Parsed<AdjustValidityRequest> {
  const issue = validityIssue(day, bounds);
  return issue === null ? { request: { expiresAt: day } } : { issues: [issue] };
}

/** Los `fields` de un `422` del servidor, ubicados en sus campos con el texto de `contracts`. */
export function serverIssuesOf(
  rejection: ApiClientError | null,
  fieldIds: Readonly<Record<string, string>>,
): readonly FormIssue[] {
  if (rejection === null) return [];
  return rejection.fields.flatMap((issue) => {
    const fieldId = fieldIds[issue.field];
    if (fieldId === undefined) return [];
    return [{ fieldId, message: backofficeFieldMessage(issue.reason, rejection.correlationId) }];
  });
}

/** `plan + extra` en bytes (texto decimal); un extra que no vale cuenta como cero. */
export function resultingTotal(baseBytes: string, extraBytes: string | null): string {
  return (BigInt(baseBytes) + BigInt(extraBytes ?? '0')).toString();
}

/** Porcentaje entero de lo usado sobre un total; sobre un total en cero, 0. */
export function usedPercent(usedBytes: string, totalBytes: string): number {
  const total = Number(totalBytes);
  return total === 0 ? 0 : Math.round((Number(usedBytes) / total) * 100);
}
