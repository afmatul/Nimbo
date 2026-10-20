import type { PlanAdminView } from '@nimbo/contracts';
import { CircleCheck, CirclePause, Clock, Lock, Users } from 'lucide-react';
import type { ReactNode } from 'react';

import { PlanCard, type PlanFactValue } from '../../../components/nimbo/plan-card';
import { StatusBadge } from '../../../components/nimbo/status-badge';
import { formatCount, formatPlanBytes } from '../../../lib/format-plan';
import { dayText } from '../backoffice-dates';
import { quantity } from '../quantity';

export interface PlanAdminCardProps {
  readonly plan: PlanAdminView;
  /** Acción al pie (011 CA-10: «Desactivar el plan Pro»); Personal no la tiene (RN-4). */
  readonly action?: ReactNode;
}

/** Los seis límites del catálogo de administración, con sus etiquetas (mockup `backoffice/catalogo`, decisión 1). */
function factsOf(plan: PlanAdminView): readonly PlanFactValue[] {
  return [
    { label: 'Almacenamiento', value: formatPlanBytes(plan.quotaBytes) },
    { label: 'Máximo por archivo', value: formatPlanBytes(plan.maxFileBytes) },
    { label: 'Editores simultáneos', value: editorsValue(plan.maxEditors) },
    { label: 'Consultas al agente', value: `${formatCount(plan.agentQueriesPerMonth)} al mes` },
    { label: 'Versiones retenidas', value: formatCount(plan.retainedVersions) },
    { label: 'Días en papelera', value: `${formatCount(plan.trashRetentionDays)} días` },
  ];
}

/** «Ninguno» y su explicación cuando el plan no deja editar (CA-11: los editores admiten 0). */
function editorsValue(maxEditors: number): ReactNode {
  if (maxEditors > 0) return formatCount(maxEditors);
  return (
    <>
      Ninguno
      <span className="block text-xs font-normal text-muted-foreground">Edición solo lectura</span>
    </>
  );
}

/** Cuentas con el plan y, si está desactivado, la fecha (mockup `backoffice/catalogo`, decisiones 3 y 7). */
function PlanMeta({
  plan,
  inactive,
}: {
  readonly plan: PlanAdminView;
  readonly inactive: boolean;
}): ReactNode {
  const clients = quantity(plan.clientCount);
  return (
    <ul className="mt-2 grid gap-1 border-t border-border pt-2">
      <li className="flex items-center gap-2">
        <Users className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span>
          {clients.text}{' '}
          {inactive
            ? clients.form('cuenta lo conserva', 'cuentas lo conservan')
            : clients.form('cuenta con este plan', 'cuentas con este plan')}
        </span>
      </li>
      {plan.deactivatedAt !== null ? (
        <li className="flex items-center gap-2">
          <Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span>Desactivado el {dayText(plan.deactivatedAt)}</span>
        </li>
      ) : null}
    </ul>
  );
}

/** El recuadro del plan por omisión: no es un botón deshabilitado, es un texto que explica (mockup, decisión 6). */
function DefaultPlanNote(): ReactNode {
  return (
    <p className="mt-auto flex items-start gap-2 rounded-lg border border-border bg-muted p-3 text-xs text-foreground">
      <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>
        <strong className="block font-semibold">Plan por defecto</strong>
        Es el plan gratuito: no se puede desactivar.
      </span>
    </p>
  );
}

/**
 * Variante de administración del `PlanCard` (011 CA-8, RN-4; PD-83): el mismo componente con los seis límites, el
 * estado (icono y texto), el conteo de cuentas y la nota del plan por omisión. La tarjeta inactiva pierde la sombra.
 */
export function PlanAdminCard({ plan, action }: PlanAdminCardProps): ReactNode {
  const inactive = plan.deactivatedAt !== null;
  return (
    <PlanCard
      plan={plan}
      className={inactive ? 'bg-background shadow-none' : undefined}
      badge={
        <StatusBadge
          tone={inactive ? 'neutral' : 'success'}
          icon={inactive ? CirclePause : CircleCheck}
          label={inactive ? 'Inactivo' : 'Activo'}
        />
      }
      facts={factsOf(plan)}
      meta={<PlanMeta plan={plan} inactive={inactive} />}
      note={plan.isDefault ? <DefaultPlanNote /> : undefined}
      action={action}
    />
  );
}
