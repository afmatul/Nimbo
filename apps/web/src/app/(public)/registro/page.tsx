import type { ReactNode } from 'react';

import { getEnv } from '../../../env';
import { RegisterFlow } from '../../../features/identity/components/register-flow';
import { loadPlanCatalog } from '../../../features/identity/plan-catalog';

export const revalidate = 60;

/** Lee el catálogo en el servidor y pasa la URL pública al formulario (CA-29). */
export default async function RegistroPage(): Promise<ReactNode> {
  const env = getEnv();
  const catalog = await loadPlanCatalog(env.API_INTERNAL_URL);
  return (
    <RegisterFlow
      apiPublicUrl={env.API_PUBLIC_URL}
      plans={catalog.plans}
      unavailable={catalog.unavailable}
    />
  );
}
