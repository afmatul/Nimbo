import type { SubscribeResponse } from '@nimbo/contracts';

import type { SubscribeOutcome } from '../application/subscription-checkout';

/** Lista blanca del contrato (CA-3, CA-6): referencia, plan, vencimiento, el desglose de RN-2 de la factura y su correo. */
export const toSubscribeResponse = ({
  payment,
  plan,
  subscription,
  invoice,
}: SubscribeOutcome): SubscribeResponse => {
  if (subscription.expiresAt === null || invoice === null) {
    throw new Error('Un pago aprobado siempre vence (RN-4) y tiene factura (CA-6).');
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
