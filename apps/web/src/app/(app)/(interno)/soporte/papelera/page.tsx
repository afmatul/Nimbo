import type { JSX } from 'react';

import { getEnv } from '../../../../../env';
import { InternalAreaLayout } from '../../../../../features/access/components/internal-area-layout';
import { INTERNAL_PATHS } from '../../../../../features/access/home-path';
import { SessionSupportTrash } from '../../../../../features/backoffice/components/support-trash';

/** Papelera de un cliente para Soporte (011b CA-10, CA-11, CA-17): ver sus raíces y restaurarlas con motivo. */
export default function SoportePapeleraPage(): JSX.Element {
  return (
    <InternalAreaLayout activeHref={INTERNAL_PATHS.supportTrash}>
      <SessionSupportTrash apiPublicUrl={getEnv().API_PUBLIC_URL} />
    </InternalAreaLayout>
  );
}
