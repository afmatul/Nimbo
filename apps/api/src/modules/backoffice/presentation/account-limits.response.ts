import type { AccountLimits, AccountLimitsStatus } from '@nimbo/contracts';

import type { SubscriptionLimits } from '../../billing';
import type { AccountLimitsDetail } from '../application/account-adjustments.service';

/** Sin suscripción `none`; Personal no vence; si no, `suscripcion.estado` (E-R, en español) al contrato. */
const statusOf = (subscription: SubscriptionLimits | null): AccountLimitsStatus => {
  if (subscription === null) return 'none';
  if (subscription.isPersonal) return 'personal';
  return subscription.status === 'solo_lectura' ? 'readOnly' : 'active';
};

/**
 * Lista blanca (011b HU-5, CA-1, CA-3): solo estos campos salen, sin datos de archivos ni de pago; bytes como texto
 * decimal (ADR-0016) y fechas en ISO. El extra vencido ya llega como `0n` y `null` (RN-1).
 */
export const toAccountLimits = ({
  usedBytes,
  subscription,
}: AccountLimitsDetail): AccountLimits => ({
  status: statusOf(subscription),
  planName: subscription?.planName ?? null,
  usedBytes: usedBytes.toString(),
  baseQuotaBytes: subscription?.planQuotaBytes.toString() ?? null,
  extraQuotaBytes: (subscription?.extraQuotaBytes ?? 0n).toString(),
  extraQuotaUntil: subscription?.extraQuotaUntil?.toISOString() ?? null,
  totalQuotaBytes: subscription?.totalQuotaBytes.toString() ?? null,
  expiresAt: subscription?.expiresAt?.toISOString() ?? null,
});
