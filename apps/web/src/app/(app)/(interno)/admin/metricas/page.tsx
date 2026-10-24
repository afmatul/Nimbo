import type { JSX } from 'react';

import { getEnv } from '../../../../../env';
import { InternalAreaLayout } from '../../../../../features/access/components/internal-area-layout';
import { INTERNAL_PATHS } from '../../../../../features/access/home-path';
import { SessionBackofficeMetrics } from '../../../../../features/backoffice/components/backoffice-metrics';

/** Métricas agregadas del Administrador (011 HU-4, CA-12, CA-17), en su área. */
export default function AdminMetricasPage(): JSX.Element {
  return (
    <InternalAreaLayout activeHref={INTERNAL_PATHS.adminMetrics}>
      <SessionBackofficeMetrics apiPublicUrl={getEnv().API_PUBLIC_URL} />
    </InternalAreaLayout>
  );
}
