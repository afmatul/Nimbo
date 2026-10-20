import { formatGtq, type Plan } from '@nimbo/contracts';
import type { ReactNode } from 'react';

import { formatDocxEditing, formatPlanBytes } from '../../lib/format-plan';
import { cn } from '../../lib/utils';
import { Card } from '../ui/card';

/** Un límite de la tarjeta: etiqueta y valor (008 CA-2; la variante de administración usa los suyos, 011 CA-8). */
export interface PlanFactValue {
  readonly label: string;
  readonly value: ReactNode;
}

export interface PlanCardProps {
  readonly plan: Plan;
  readonly className?: string | undefined;
  /** Acción al pie (009 CA-9: «Contratar» en los planes de pago); la decide la página. */
  readonly action?: ReactNode;
  /** Distintivo junto al nombre (010: «Plan actual»; 011: «Activo» o «Inactivo»). */
  readonly badge?: ReactNode;
  /** Límites que muestra la tarjeta; por defecto, los tres del comparador (008 CA-2). */
  readonly facts?: readonly PlanFactValue[] | undefined;
  /** Contenido entre los límites y el pie (011: cuentas con este plan y fecha de desactivación). */
  readonly meta?: ReactNode;
  /** Recuadro al pie (011: «Plan por defecto», el plan que no se puede desactivar). */
  readonly note?: ReactNode;
}

/** Los tres límites del comparador (008 CA-2); la administración muestra los seis del catálogo (011 CA-8). */
function defaultFacts(plan: Plan): readonly PlanFactValue[] {
  return [
    { label: 'Almacenamiento', value: formatPlanBytes(plan.quotaBytes) },
    { label: 'Archivo máx.', value: formatPlanBytes(plan.maxFileBytes) },
    { label: 'Edición .docx', value: formatDocxEditing(plan.maxEditors) },
  ];
}

/** El nombre del plan y, si lo hay, el distintivo a su lado (010: «Plan actual»; 011: «Activo» o «Inactivo»). */
function PlanHeading({
  plan,
  badge,
}: {
  readonly plan: Plan;
  readonly badge?: ReactNode;
}): ReactNode {
  return (
    <div className="flex items-start justify-between gap-2">
      <h2 className="text-base font-semibold text-foreground">{plan.name}</h2>
      {badge}
    </div>
  );
}

/** Los límites de la tarjeta: los del comparador o los que trae la variante de administración (011 CA-8). */
function PlanFacts({
  plan,
  facts,
}: {
  readonly plan: Plan;
  readonly facts?: readonly PlanFactValue[] | undefined;
}): ReactNode {
  return (
    <dl className="flex flex-col gap-2 border-t border-border pt-2 text-xs text-foreground">
      {(facts ?? defaultFacts(plan)).map((fact) => (
        <PlanFact key={fact.label} label={fact.label} value={fact.value} />
      ))}
    </dl>
  );
}

/**
 * Tarjeta de un plan del catálogo (008 CA-2, RF-19) y del catálogo de administración (011 CA-8; PD-83): **un solo
 * componente** (`ui-guidelines.md` §4) con las dos variantes. Nombre, precio y límites salen del contrato, nunca del
 * frontend; lo que cambia entre variantes son los huecos opcionales (distintivo, límites, metadatos y nota al pie).
 */
export function PlanCard({
  plan,
  className,
  action,
  badge,
  facts,
  meta,
  note,
}: PlanCardProps): ReactNode {
  return (
    <Card className={cn('flex flex-col gap-4 p-5', className)}>
      <PlanHeading plan={plan} badge={badge} />
      <p className="min-h-8 text-xs text-muted-foreground">{plan.description}</p>
      <p className="flex items-baseline gap-1">
        <span className="text-2xl font-bold tabular-nums text-foreground">
          {formatGtq(plan.priceCents)}
        </span>
        <span className="text-xs text-muted-foreground">al mes</span>
      </p>
      <PlanFacts plan={plan} facts={facts} />
      {meta === undefined ? null : <div className="text-xs text-muted-foreground">{meta}</div>}
      {note === undefined ? null : note}
      {action === undefined ? null : <div className="mt-auto pt-2">{action}</div>}
    </Card>
  );
}

function PlanFact({
  label,
  value,
}: {
  readonly label: string;
  readonly value: ReactNode;
}): ReactNode {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium tabular-nums">{value}</dd>
    </div>
  );
}
