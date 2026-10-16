import type { ReactNode } from 'react';

import { getEnv } from '../../../../env';
import { SessionInvoiceHistory } from '../../../../features/billing/components/invoice-history';

/**
 * Mi suscripción (spec 009 CA-7, CA-8): plan actual e historial de pagos y facturas con descarga. Vive en `(cliente)`:
 * los roles internos no llegan. La 010 la amplía con renovación y cambio de plan.
 */
export default function SuscripcionPage(): ReactNode {
  return <SessionInvoiceHistory apiPublicUrl={getEnv().API_PUBLIC_URL} />;
}
