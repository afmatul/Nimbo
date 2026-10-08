import type { PlanDto } from '@nimbo/contracts';
import { formatQuetzales, formatBytes, formatEditores } from '../format-plan';

interface PlanCardsProps {
  readonly planes: PlanDto[];
}

// El color sale del slug, no del índice. Solo tokens de globals.css (ui-guidelines.md: nada de hex ni colores crudos).
const DOT_BY_SLUG: Record<string, string> = {
  personal: 'bg-muted-foreground/50',
  pro: 'bg-live',
  equipo: 'bg-brand',
  institucional: 'bg-primary',
};

export function PlanCards({ planes }: PlanCardsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      {planes.map((plan) => (
        <div key={plan.id} className="bg-card border border-border rounded-xl p-5 flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className={`w-2.5 h-2.5 rounded-full ${DOT_BY_SLUG[plan.slug] ?? 'bg-muted-foreground/50'}`}
            />
            <h2 className="text-base font-semibold text-foreground">{plan.nombre}</h2>
          </div>

          <p className="text-xs text-muted-foreground min-h-8">{plan.descripcion}</p>

          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold text-foreground tabular-nums">
              {formatQuetzales(plan.precioCentavos)}
            </span>
            <span className="text-xs text-muted-foreground">al mes</span>
          </div>

          <div className="flex flex-col gap-2 pt-2 border-t border-border text-xs text-foreground">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Almacenamiento</span>
              <span className="tabular-nums font-medium">{formatBytes(plan.cuotaBytes)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Archivo máx.</span>
              <span className="tabular-nums font-medium">{formatBytes(plan.maxArchivoBytes)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Edición .docx</span>
              <span className="font-medium">{formatEditores(plan.maxEditores)}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}