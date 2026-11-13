import type { ReactNode } from 'react';

import { getEnv } from '../../../env';
import { RegisterFlow } from '../../../features/identity/components/register-flow';
import { loadPlanCatalog } from '../../../features/identity/plan-catalog';
import { REGISTER_PLAN_PARAM } from '../../../features/identity/routes';

export const revalidate = 60;

interface RegistroPageProps {
  readonly searchParams: Promise<Readonly<Record<string, string | string[] | undefined>>>;
}

/** Lee el catálogo en el servidor y pasa la URL pública al formulario (CA-29); `?plan=` preselecciona un plan. */
export default async function RegistroPage({
  searchParams,
}: RegistroPageProps): Promise<ReactNode> {
  const env = getEnv();
  const [catalog, query] = await Promise.all([loadPlanCatalog(env.API_INTERNAL_URL), searchParams]);
  const plan = query[REGISTER_PLAN_PARAM];
  return (
    <RegisterFlow
      apiPublicUrl={env.API_PUBLIC_URL}
      plans={catalog.plans}
      unavailable={catalog.unavailable}
      initialPlanSlug={typeof plan === 'string' ? plan : undefined}
    />
  );
}
