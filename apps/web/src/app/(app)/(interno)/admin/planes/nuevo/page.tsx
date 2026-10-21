import type { JSX } from 'react';

import { getEnv } from '../../../../../../env';
import { InternalAreaLayout } from '../../../../../../features/access/components/internal-area-layout';
import { INTERNAL_PATHS } from '../../../../../../features/access/home-path';
import { SessionNewPlanView } from '../../../../../../features/backoffice/components/new-plan-view';

/** El plan nuevo del Administrador (011 HU-3, CA-9), en su área. */
export default function AdminNuevoPlanPage(): JSX.Element {
  return (
    <InternalAreaLayout activeHref={INTERNAL_PATHS.adminPlans}>
      <SessionNewPlanView apiPublicUrl={getEnv().API_PUBLIC_URL} />
    </InternalAreaLayout>
  );
}
