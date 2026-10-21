import type { JSX } from 'react';

import { getEnv } from '../../../../../../env';
import { InternalAreaLayout } from '../../../../../../features/access/components/internal-area-layout';
import { INTERNAL_PATHS } from '../../../../../../features/access/home-path';
import { SessionAccountProfile } from '../../../../../../features/backoffice/components/account-profile';

interface AdminCuentaPageProps {
  readonly params: Promise<{ readonly id: string }>;
}

/**
 * Ficha de una cuenta (011 CA-1 a CA-4): una URL por cuenta, con su id (nunca el correo, RNF-17). Si no existe, la
 * vista muestra «No encontramos esta cuenta.».
 */
export default async function AdminCuentaPage({
  params,
}: AdminCuentaPageProps): Promise<JSX.Element> {
  const { id } = await params;
  return (
    <InternalAreaLayout activeHref={INTERNAL_PATHS.adminAccounts}>
      <SessionAccountProfile key={id} apiPublicUrl={getEnv().API_PUBLIC_URL} accountId={id} />
    </InternalAreaLayout>
  );
}
