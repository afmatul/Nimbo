import type { ReactNode } from 'react';

import { getEnv } from '../../../../../env';
import { SessionPlanChangePage } from '../../../../../features/billing/components/plan-change-page';

/**
 * Cambiar de plan (spec 010 CA-16 a CA-18, CA-21, CA-27; mockups `billing/planes/planes--*`): elige el plan del siguiente
 * ciclo. Vive en `(cliente)`: los roles internos no llegan.
 */
export default function CambiarPlanPage(): ReactNode {
  return <SessionPlanChangePage apiPublicUrl={getEnv().API_PUBLIC_URL} />;
}
