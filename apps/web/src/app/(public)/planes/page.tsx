// apps/web/src/app/planes/page.tsx
import { PlanCatalogResponseSchema } from '@nimbo/contracts';
import { PlanCards } from '@/features/billing/components/plan-cards';
import { PlanComparisonTable } from '@/features/billing/components/plan-comparison-table';
import { messageForCode } from '@/lib/error-catalog';

async function getPlans() {
  try {
    const baseUrl = process.env.API_PUBLIC_URL;
    if (!baseUrl) throw new Error('API_PUBLIC_URL no configurada');

    const res = await fetch(`${baseUrl}/api/v1/billing/plans`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = PlanCatalogResponseSchema.parse(await res.json());
    return { planes: data.planes, error: null };
  } catch (e) {
    console.error('[planes] no se pudo cargar el catálogo:', e);
    return { planes: null, error: messageForCode('PLAN_CATALOG_UNAVAILABLE') };
  }
}

export default async function PlanesPage() {
  const { planes, error } = await getPlans();

  if (error) {
    return (
      <div role="alert" className="p-12 text-center text-destructive font-medium">
        {error}
      </div>
    );
  }

  if (!planes || planes.length === 0) {
    return (
      <div role="status" className="p-12 text-center text-muted-foreground">
        Ahora no hay planes para mostrar.
      </div>
    );
  }

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

      <PlanCards planes={planes} />
      <PlanComparisonTable planes={planes} />
    </section>
  );
}