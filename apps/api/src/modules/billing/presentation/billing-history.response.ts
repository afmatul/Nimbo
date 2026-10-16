import type { BillingHistoryPayment, BillingHistoryResponse } from '@nimbo/contracts';

import type { BillingHistory } from '../application/billing-history.service';
import type { PaymentRecord } from '../application/ports/i-billing-history.reader.port';

import { toPlanResponse } from './plan.response';

const toPayment = ({ invoice, createdAt, ...payment }: PaymentRecord): BillingHistoryPayment => ({
  ...payment,
  createdAt: createdAt.toISOString(),
  invoice:
    invoice === null
      ? null
      : { id: invoice.id, number: invoice.number, downloadable: invoice.objectKey !== null },
});

/**
 * Lista blanca de `GET /billing/history` (CA-7): el plan con el contrato del catálogo (008), la tarjeta solo con marca y
 * últimos 4, y de cada factura solo si se puede descargar; la clave del objeto nunca sale.
 */
export const toBillingHistoryResponse = ({
  subscription,
  paymentMethod,
  receiptEmail,
  payments,
}: BillingHistory): BillingHistoryResponse => ({
  subscription:
    subscription === null
      ? null
      : {
          plan: toPlanResponse(subscription.plan),
          expiresAt: subscription.expiresAt?.toISOString() ?? null,
        },
  paymentMethod:
    paymentMethod === null ? null : { brand: paymentMethod.brand, last4: paymentMethod.last4 },
  receiptEmail,
  payments: payments.map(toPayment),
});
