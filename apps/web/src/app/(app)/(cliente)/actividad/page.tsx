import type { ReactNode } from 'react';

import { getEnv } from '../../../../env';
import { SessionActivityView } from '../../../../features/audit/components/activity-view';

/**
 * Mi actividad (004): lo que se hizo en la cuenta del cliente, por él y por el personal de Nimbo. Vive en `(cliente)`;
 * el área interna no tiene página de actividad hasta 011 (plan 004 §7).
 */
export default function ActividadPage(): ReactNode {
  return <SessionActivityView apiPublicUrl={getEnv().API_PUBLIC_URL} />;
}
