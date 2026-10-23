import type { ReactNode } from 'react';

import { getEnv } from '../../../../../env';
import { SessionRenewalPage } from '../../../../../features/billing/components/renewal-payment';

/**
 * Pago de la renovación manual (spec 010 CA-8 a CA-11, CA-26, CA-28; mockups `billing/pago/pago--renovacion*`): la
 * abren «Renovar ahora» y «Renovar plan» del aviso de solo lectura. Vive en `(cliente)`: los roles internos no llegan.
 */
export default function RenovarPage(): ReactNode {
  return <SessionRenewalPage apiPublicUrl={getEnv().API_PUBLIC_URL} />;
}
