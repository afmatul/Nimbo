import type { JSX } from 'react';

import { getEnv } from '../../../../../env';
import { InternalAreaLayout } from '../../../../../features/access/components/internal-area-layout';
import { INTERNAL_PATHS } from '../../../../../features/access/home-path';
import { SessionAdminPlans } from '../../../../../features/backoffice/components/admin-plans';

/** Catálogo de planes del Administrador (011 HU-3, CA-8), en su área. */
export default function AdminPlanesPage(): JSX.Element {
  return (
    <InternalAreaLayout activeHref={INTERNAL_PATHS.adminPlans}>
      <SessionAdminPlans apiPublicUrl={getEnv().API_PUBLIC_URL} />
    </InternalAreaLayout>
  );
}
