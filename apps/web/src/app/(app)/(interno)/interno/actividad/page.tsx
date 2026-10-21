import type { JSX } from 'react';

import { getEnv } from '../../../../../env';
import { InternalAreaLayout } from '../../../../../features/access/components/internal-area-layout';
import { SessionActivityPanel } from '../../../../../features/audit/components/activity-view';

/**
 * «Mi actividad» de los roles internos (004 CA-12, 011 CA-17): su propia bitácora dentro del marco interno. Next no
 * admite la misma URL en dos grupos, por eso no comparte `/actividad` con el cliente.
 */
export default function InternoActividadPage(): JSX.Element {
  return (
    <InternalAreaLayout>
      <SessionActivityPanel apiPublicUrl={getEnv().API_PUBLIC_URL} />
    </InternalAreaLayout>
  );
}
