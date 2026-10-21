import { formatGtq, type BillingHistoryResponse, type SubscriptionView } from '@nimbo/contracts';

import { longDayLabel } from '../../../lib/format-date';

export type Card = NonNullable<BillingHistoryResponse['paymentMethod']>;

/** «Visa ···· 4242» (spec 010 §6): marca con mayúscula inicial y solo los últimos 4 (RN-9). */
export const cardLabel = ({ brand, last4 }: Card): string =>
  `${brand.charAt(0).toUpperCase()}${brand.slice(1)} ···· ${last4}`;

/** Q110.00, o «Gratis» en Personal. */
export const priceLabel = (priceCents: number): string =>
  priceCents > 0 ? formatGtq(priceCents) : 'Gratis';

/** El vencimiento en largo; Personal no vence. */
export const expiryLabel = ({ expiresAt }: SubscriptionView): string =>
  expiresAt === null ? 'Sin vencimiento' : longDayLabel(expiresAt);

/** La bajada a Personal está programada (CA-21): no hay cobro ni renovación automática que mostrar. */
export const isDowngradeToPersonal = ({ pendingPlan }: SubscriptionView): boolean =>
  pendingPlan !== null && pendingPlan.priceCents === 0;

/** Aviso de suscripción vencida (spec 010 §6, «Vencida»), en «Plan y facturación» y en «Cambiar de plan». */
export const EXPIRED_BANNER = {
  title: 'Tu suscripción venció.',
  description: 'Puedes ver y descargar tus archivos, pero no subir ni editar. Renueva tu plan.',
} as const;
