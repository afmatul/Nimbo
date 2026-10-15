import type { BillingHistoryPayment, BillingHistoryResponse } from '@nimbo/contracts';

import type {
  BillingHistory,
  PaymentRecord,
} from '../application/ports/i-billing-history.reader.port';

const toPayment = ({ invoice, createdAt, ...payment }: PaymentRecord): BillingHistoryPayment => ({
  ...payment,
  createdAt: createdAt.toISOString(),
  invoice:
    invoice === null
      ? null
      : { id: invoice.id, number: invoice.number, downloadable: invoice.objectKey !== null },
});

/** Lista blanca de `GET /billing/history` (CA-7): la clave del objeto nunca sale; solo si hay PDF para descargar. */
export const toBillingHistoryResponse = ({
  subscription,
  payments,
}: BillingHistory): BillingHistoryResponse => ({
  subscription:
    subscription === null
      ? null
      : {
          planName: subscription.planName,
          expiresAt: subscription.expiresAt?.toISOString() ?? null,
        },
  payments: payments.map(toPayment),
});
