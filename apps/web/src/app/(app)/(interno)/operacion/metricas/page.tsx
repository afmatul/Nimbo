import type { JSX } from 'react';

import { getEnv } from '../../../../../env';
import { InternalAreaLayout } from '../../../../../features/access/components/internal-area-layout';
import { INTERNAL_PATHS } from '../../../../../features/access/home-path';
import { SessionBackofficeMetrics } from '../../../../../features/backoffice/components/backoffice-metrics';

/** Inicio del área del Operador (011 HU-4, CA-12, CA-17): las métricas agregadas, lo único de su área hasta la 022b. */
export default function OperacionMetricasPage(): JSX.Element {
  return (
    <InternalAreaLayout activeHref={INTERNAL_PATHS.operatorMetrics}>
      <SessionBackofficeMetrics apiPublicUrl={getEnv().API_PUBLIC_URL} />
    </InternalAreaLayout>
  );
}
