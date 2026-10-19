import type { SubscriptionView } from '@nimbo/contracts';
import { CalendarClock } from 'lucide-react';
import type * as React from 'react';

import { Alert } from '../../../components/ui/alert';
import { Button } from '../../../components/ui/button';
import { formatPlanBytes } from '../../../lib/format-plan';

import { expiryLabel, isDowngradeToPersonal } from './subscription-copy';

export interface PendingChangeNoticeProps {
  readonly subscription: SubscriptionView;
  /** Bytes usados hoy, para avisar si no caben en Personal (CA-21); `null` mientras carga. */
  readonly usedBytes: number | null;
  readonly cancelling: boolean;
  readonly onCancel: () => void;
}

/** CA-21: bajar a Personal no cobra; si el uso no cabe, se puede seguir viendo todo pero no subir. */
const downgradeDetail = ({ subscription, usedBytes }: PendingChangeNoticeProps): string => {
  const quota = Number(subscription.pendingPlan?.quotaBytes ?? 0);
  if (usedBytes === null || usedBytes <= quota) return 'Ese día no se cobra nada.';
  return `Ese día no se cobra nada. Usas ${formatPlanBytes(String(usedBytes))} y Personal incluye ${formatPlanBytes(String(quota))}: no perderás archivos, pero no podrás subir hasta liberar espacio.`;
};

/** «Tu plan cambiará a <plan> el <fecha>.» con «Cancelar cambio» (spec 010 §6, CA-16, CA-19, CA-21). */
export function PendingChangeNotice(props: PendingChangeNoticeProps): React.JSX.Element | null {
  const { subscription, cancelling, onCancel } = props;
  if (subscription.pendingPlan === null) return null;
  const detail = isDowngradeToPersonal(subscription)
    ? downgradeDetail(props)
    : `Hasta entonces conservas ${subscription.plan.name} y sus límites.`;
  return (
    <Alert variant="info" className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <CalendarClock aria-hidden="true" className="size-5 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{`Tu plan cambiará a ${subscription.pendingPlan.name} el ${expiryLabel(subscription)}.`}</p>
        <p>{detail}</p>
      </div>
      <Button
        variant="outline"
        onClick={onCancel}
        disabled={cancelling}
        className="w-full sm:w-auto"
      >
        Cancelar cambio
      </Button>
    </Alert>
  );
}
