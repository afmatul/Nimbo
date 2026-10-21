import type { JSX } from 'react';

import { getEnv } from '../../../../../env';
import { InternalAreaLayout } from '../../../../../features/access/components/internal-area-layout';
import { INTERNAL_PATHS } from '../../../../../features/access/home-path';
import { SessionAdminAccounts } from '../../../../../features/backoffice/components/admin-accounts';

/** Inicio del área del Administrador (011 HU-1, CA-1, CA-17): cuentas de clientes e internas. */
export default function AdminCuentasPage(): JSX.Element {
  return (
    <InternalAreaLayout activeHref={INTERNAL_PATHS.adminAccounts}>
      <SessionAdminAccounts apiPublicUrl={getEnv().API_PUBLIC_URL} />
    </InternalAreaLayout>
  );
}
