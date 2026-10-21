import type { JSX } from 'react';

import { getEnv } from '../../../../../../../env';
import { InternalAreaLayout } from '../../../../../../../features/access/components/internal-area-layout';
import { INTERNAL_PATHS } from '../../../../../../../features/access/home-path';
import { SessionAdminClientFiles } from '../../../../../../../features/backoffice/components/admin-client-files';

interface AdminCuentaMetadatosPageProps {
  readonly params: Promise<{ readonly id: string }>;
}

/**
 * Metadatos de los archivos de un cliente desde su ficha (011 CA-13, estado `desde-admin`): la URL lleva solo el id;
 * el correo lo trae `GET /backoffice/accounts/:id` y no queda en el historial ni en las bitácoras (PD-101).
 */
export default async function AdminCuentaMetadatosPage({
  params,
}: AdminCuentaMetadatosPageProps): Promise<JSX.Element> {
  const { id } = await params;
  return (
    <InternalAreaLayout activeHref={INTERNAL_PATHS.adminAccounts}>
      <SessionAdminClientFiles key={id} apiPublicUrl={getEnv().API_PUBLIC_URL} accountId={id} />
    </InternalAreaLayout>
  );
}
