'use client';

import { formatGtq, type PlanAdminView } from '@nimbo/contracts';
import { Ban } from 'lucide-react';
import type * as React from 'react';

import { ConfirmDestructiveDialog } from '../../../components/nimbo/confirm-destructive-dialog';
import { formatPlanBytes } from '../../../lib/format-plan';
import type { PlanDeactivation } from '../hooks/use-plan-deactivation';
import { quantity } from '../quantity';

interface DialogProps {
  readonly deactivation: PlanDeactivation;
}

/** «Q110.00 al mes · 350 GB · 52 cuentas lo tienen» (mockup `confirmar-desactivar`). */
function planLine(plan: PlanAdminView): string {
  const clients = quantity(plan.clientCount);
  return `${formatGtq(plan.priceCents)} al mes · ${formatPlanBytes(plan.quotaBytes)} · ${clients.text} ${clients.form(
    'cuenta lo tiene',
    'cuentas lo tienen',
  )}`;
}

/** Las consecuencias de desactivar (mockup `confirmar-desactivar`; RN-4: no se reactiva). */
function consequences(plan: PlanAdminView): string {
  const clients = quantity(plan.clientCount);
  return [
    'Deja de ofrecerse: no aparecerá al registrarse ni al cambiar de plan.',
    `Las ${clients.text} ${clients.form('cuenta que lo tiene lo conserva', 'cuentas que lo tienen lo conservan')} con el mismo precio y los mismos límites.`,
    'No se puede volver a activar. Si lo necesitas otra vez, crea un plan nuevo con sus valores.',
    'La acción queda registrada en la auditoría.',
  ].join(' ');
}

/**
 * Confirmar la desactivación de un plan (011 CA-10, RN-4): se ven el precio, el espacio y las cuentas que lo tienen
 * antes de confirmar, y qué pasa con ellas.
 */
export function PlanDeactivateDialog({ deactivation }: DialogProps): React.JSX.Element {
  const plan = deactivation.asking;
  return (
    <ConfirmDestructiveDialog
      open={plan !== null}
      onOpenChange={(open) => {
        if (!open && !deactivation.pending) deactivation.cancel();
      }}
      title={plan === null ? '' : `¿Desactivar el plan ${plan.name}?`}
      description={plan === null ? '' : `${planLine(plan)}. ${consequences(plan)}`}
      confirmLabel="Desactivar plan"
      pendingLabel="Desactivando…"
      pending={deactivation.pending}
      onConfirm={deactivation.confirm}
    />
  );
}

/** El aviso de éxito tras desactivar (mockup `desactivado`). */
export function PlanDeactivatedNotice({
  plan,
}: {
  readonly plan: PlanAdminView;
}): React.JSX.Element {
  const clients = quantity(plan.clientCount);
  return (
    <p className="mt-4 flex items-start gap-2.5 rounded-lg border border-success/40 bg-success/10 px-4 py-3 text-sm text-foreground">
      <Ban className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span>
        <strong className="block font-semibold">
          {`Desactivamos el plan ${plan.name}. Ya no se ofrece a contrataciones nuevas.`}
        </strong>
        {`Las ${clients.text} ${clients.form('cuenta que lo tiene lo conserva', 'cuentas que lo tienen lo conservan')} con el mismo precio y los mismos límites.`}
      </span>
    </p>
  );
}
