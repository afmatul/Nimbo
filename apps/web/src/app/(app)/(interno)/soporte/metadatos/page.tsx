import type { JSX } from 'react';

import { getEnv } from '../../../../../env';
import { InternalAreaLayout } from '../../../../../features/access/components/internal-area-layout';
import { INTERNAL_PATHS } from '../../../../../features/access/home-path';
import { SessionSupportClientFiles } from '../../../../../features/backoffice/components/support-client-files';

/** Inicio del área de Soporte (011 HU-5, CA-13, CA-17): metadatos de los archivos de un cliente. */
export default function SoporteMetadatosPage(): JSX.Element {
  return (
    <InternalAreaLayout activeHref={INTERNAL_PATHS.supportFiles}>
      <SessionSupportClientFiles apiPublicUrl={getEnv().API_PUBLIC_URL} />
    </InternalAreaLayout>
  );
}
