import type { ReactNode } from 'react';

import { StateView } from '../../../components/nimbo/state-view';
import { getEnv } from '../../../env';
import { fetchPlanCatalog, PlanCards, PlanComparisonTable } from '../../../features/billing';

/** Catálogo público (008): se lee en el servidor; la carga y el error los muestran `loading.tsx` y `error.tsx`. */
export default async function PlanesPage(): Promise<ReactNode> {
  const { planes } = await fetchPlanCatalog(getEnv().API_INTERNAL_URL);

  return (
    <section className="flex flex-col gap-4 p-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-foreground">Elige el plan de tu equipo</h1>
          <p className="text-xs text-muted-foreground">
            Todos los planes incluyen indexación, historial con autoría y cifrado en reposo
          </p>
        </div>
        <span className="px-3 py-1.5 text-xs text-muted-foreground bg-muted/20 border border-border rounded-lg">
          Precios en quetzales · cobro mensual
        </span>
      </header>

      {planes.length === 0 ? (
        <StateView type="empty" title="Ahora no hay planes para mostrar." headingLevel="h2" />
      ) : (
        <>
          <PlanCards planes={planes} />
          <PlanComparisonTable planes={planes} />
        </>
      )}
    </section>
  );
}
