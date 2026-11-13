import type { Plan } from '@nimbo/contracts';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { PlanCard } from '../../../components/nimbo/plan-card';
import { StateView } from '../../../components/nimbo/state-view';
import { buttonVariants } from '../../../components/ui/button';
import { getEnv } from '../../../env';
import { fetchPlanCatalog, PlanComparisonTable } from '../../../features/billing';
import { registerWithPlanHref } from '../../../features/identity/routes';
import { cn } from '../../../lib/utils';

/** Se lee de la API en cada visita: sin esto Next intenta prerenderizarla al compilar y falla si la API no responde. */
export const dynamic = 'force-dynamic';

/** Catálogo público (008): se lee en el servidor; la carga y el error los muestran `loading.tsx` y `error.tsx`. */
export default async function PlanesPage(): Promise<ReactNode> {
  const { plans } = await fetchPlanCatalog(getEnv().API_INTERNAL_URL);

  return (
    <section className="flex flex-col gap-4 p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-foreground">Elige tu plan</h1>
          <p className="text-xs text-muted-foreground">
            Todos los planes incluyen indexación, historial con autoría y cifrado en reposo
          </p>
        </div>
        <span className="px-3 py-1.5 text-xs text-muted-foreground bg-muted/20 border border-border rounded-lg">
          Precios en quetzales · cobro mensual
        </span>
      </header>

      <PlanCatalog plans={plans} />
    </section>
  );
}

/** Tarjetas y tabla con la misma respuesta (CA-2); la rejilla se ajusta a cuantos planes haya. */
function PlanCatalog({ plans }: { readonly plans: readonly Plan[] }): ReactNode {
  if (plans.length === 0) {
    return <StateView type="empty" title="Ahora no hay planes para mostrar." headingLevel="h2" />;
  }
  return (
    <>
      <div className="flex flex-wrap gap-4">
        {plans.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            className="min-w-0 flex-1 basis-56"
            action={plan.priceCents > 0 ? <SubscribeLink slug={plan.slug} /> : undefined}
          />
        ))}
      </div>
      <PlanComparisonTable plans={plans} />
    </>
  );
}

/**
 * Solo los planes de pago se contratan; Personal ya lo tiene toda cuenta verificada. El visitante crea su cuenta con el
 * plan elegido y lo paga al iniciar sesión (con sesión, el cambio de plan vive en `/suscripcion/cambiar-plan`).
 */
function SubscribeLink({ slug }: { readonly slug: string }): ReactNode {
  return (
    <Link href={registerWithPlanHref(slug)} className={cn(buttonVariants(), 'w-full')}>
      Contratar
    </Link>
  );
}
