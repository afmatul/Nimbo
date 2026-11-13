import type { AccountLimits } from '@nimbo/contracts';

import type { BackofficeApi } from './api';

/** Bytes de `n` GB del catálogo (base 1000, PD-91), como texto decimal (ADR-0016). */
export const gb = (n: number): string => String(n * 1000 ** 3);

/**
 * Límites de Laura (plan Equipo, mockup `backoffice/admin--ficha`): 350 GB del plan, 304 GB usados, sin extra y vigente
 * hasta el 31/10/2030 (`vence_en` a las 00:00 del día siguiente en Guatemala, 06:00 UTC). Fechas lejanas para que «hoy»
 * no las alcance.
 */
export function accountLimits(overrides: Partial<AccountLimits> = {}): AccountLimits {
  return {
    status: 'active',
    planName: 'Equipo',
    usedBytes: gb(304),
    baseQuotaBytes: gb(350),
    extraQuotaBytes: '0',
    extraQuotaUntil: null,
    totalQuotaBytes: gb(350),
    expiresAt: '2030-11-01T06:00:00.000Z',
    ...overrides,
  };
}

/** Con 50 GB extra hasta el 15/11/2030 (mockup `cuota-guardada`). */
export const WITH_EXTRA = accountLimits({
  extraQuotaBytes: gb(50),
  extraQuotaUntil: '2030-11-16T06:00:00.000Z',
  totalQuotaBytes: gb(400),
});

/** Vencida y en solo lectura (mockup `extender-vigencia`). */
export const READ_ONLY = accountLimits({
  status: 'readOnly',
  expiresAt: '2026-10-21T06:00:00.000Z',
});

/** Plan Personal: no vence (mockup `personal`). */
export const PERSONAL = accountLimits({
  status: 'personal',
  planName: 'Personal',
  usedBytes: '0',
  baseQuotaBytes: gb(15),
  totalQuotaBytes: gb(15),
  expiresAt: null,
});

/** Sin suscripción (mockup `sin-suscripcion`): sin plan, cuota ni vencimiento. */
export const NO_SUBSCRIPTION = accountLimits({
  status: 'none',
  planName: null,
  usedBytes: '0',
  baseQuotaBytes: null,
  totalQuotaBytes: null,
  expiresAt: null,
});

/** Los límites quedan cargando: para las pruebas de la ficha que no miran el bloque (011). */
export function pendingLimitsApi(): Pick<
  BackofficeApi,
  'getAccountLimits' | 'adjustQuota' | 'removeQuota' | 'adjustValidity'
> {
  const pending = (): Promise<AccountLimits> => new Promise<AccountLimits>(() => undefined);
  return {
    getAccountLimits: pending,
    adjustQuota: pending,
    removeQuota: pending,
    adjustValidity: pending,
  };
}
