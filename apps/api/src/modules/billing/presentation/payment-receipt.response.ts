import type { PaymentReceipt } from '@nimbo/contracts';

import type { RenewalOutcome } from '../application/renewal-checkout';
import type { SubscribeOutcome } from '../application/subscription-checkout';
import { BillingInvariantError } from '../domain/errors/billing-invariant.error';

/** Lo que el recibo necesita de una contratación (009) o de una renovación (010). */
type PaidOutcome = Pick<
  SubscribeOutcome | RenewalOutcome,
  'payment' | 'plan' | 'subscription' | 'invoice'
>;

/**
 * Lista blanca del contrato (009 CA-3, CA-6; 010 CA-8, CA-10): referencia, plan del periodo, vencimiento, el desglose de
 * RN-2 de la factura y su correo. Nunca la referencia del instrumento.
 */
export const toPaymentReceipt = ({
  payment,
  plan,
  subscription,
  invoice,
}: PaidOutcome): PaymentReceipt => {
  if (subscription.expiresAt === null || invoice === null) {
    throw new BillingInvariantError(
      'Un pago aprobado siempre vence (RN-4) y tiene factura (CA-6).',
    );
  }
  return {
    reference: payment.reference,
    plan: { slug: plan.slug, name: plan.name },
    expiresAt: subscription.expiresAt.toISOString(),
    amounts: {
      subtotalCents: invoice.subtotal.cents,
      vatCents: invoice.vat.cents,
      totalCents: invoice.total.cents,
    },
    receiptEmail: invoice.receiptEmail,
  };
};
