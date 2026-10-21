import type { JSX } from 'react';

import { getEnv } from '../../../../../../env';
import { InternalAreaLayout } from '../../../../../../features/access/components/internal-area-layout';
import { INTERNAL_PATHS } from '../../../../../../features/access/home-path';
import { SessionEnrollAccount } from '../../../../../../features/backoffice/components/enroll-account';

/** Alta de una cuenta interna (011 HU-2, CA-5, CA-6): se llega desde «Nueva cuenta interna» en Cuentas. */
export default function AdminNuevaCuentaPage(): JSX.Element {
  return (
    <InternalAreaLayout activeHref={INTERNAL_PATHS.adminAccounts}>
      <SessionEnrollAccount apiPublicUrl={getEnv().API_PUBLIC_URL} />
    </InternalAreaLayout>
  );
}
