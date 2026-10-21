import type { ReactNode } from 'react';

import { getEnv } from '../../../../env';
import { SessionPlanAndBilling } from '../../../../features/billing/components/plan-and-billing';

/**
 * Plan y facturación (spec 009 CA-7, CA-8; mockup `billing/suscripcion/`): plan actual e historial con descarga.
 * Vive en `(cliente)`: los roles internos no llegan. La 010 la amplía con renovación y cambio de plan.
 */
export default function SuscripcionPage(): ReactNode {
  return <SessionPlanAndBilling apiPublicUrl={getEnv().API_PUBLIC_URL} />;
}
