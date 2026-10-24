import type { SubscriptionView } from '@nimbo/contracts';
import { AlertTriangle, CalendarClock } from 'lucide-react';
import Link from 'next/link';
import type * as React from 'react';

import { ReadOnlyBanner } from '../../../components/nimbo/read-only-banner';
import { Alert } from '../../../components/ui/alert';
import { Button, buttonVariants } from '../../../components/ui/button';
import { RENEW_PATH } from '../routes';

import { PendingChangeNotice, type PendingChangeNoticeProps } from './pending-change-notice';
import { cardLabel, EXPIRED_BANNER, expiryLabel, isDowngradeToPersonal } from './subscription-copy';

export type SubscriptionStatusNoticeProps = PendingChangeNoticeProps;

/** «No se renovará» (§6): con un cambio programado a un plan de pago, primero hay que cancelarlo (N-4, CA-28). */
function NotRenewingNotice(props: SubscriptionStatusNoticeProps): React.JSX.Element {
  const { subscription, cancelling, onCancel } = props;
  const pending = subscription.pendingPlan;
  const text =
    pending === null
      ? `Tu plan vence el ${expiryLabel(subscription)} y no se renovará. Renueva ahora para no quedar en solo lectura.`
      : `Tu plan vence el ${expiryLabel(subscription)} y no se renovará. Para renovar ahora, primero cancela el cambio a ${pending.name}.`;
  return (
    <Alert variant="warning" className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <AlertTriangle aria-hidden="true" className="size-5 shrink-0" />
      <p className="min-w-0 flex-1 font-semibold">{text}</p>
      {pending === null ? (
        <Link href={RENEW_PATH} className={buttonVariants({ className: 'w-full sm:w-auto' })}>
          Renovar ahora
        </Link>
      ) : (
        <Button
          variant="outline"
          onClick={onCancel}
          disabled={cancelling}
          className="w-full sm:w-auto"
        >
          Cancelar cambio
        </Button>
      )}
    </Alert>
  );
}

/** «Tu plan <plan> vence el <fecha>. Se renovará con <marca> ···· <últimos 4>.» (§6, CA-5). */
function ExpiringNotice({ subscription }: { readonly subscription: SubscriptionView }) {
  const card = subscription.nextCharge?.card ?? null;
  const renewal = card === null ? '' : ` Se renovará con ${cardLabel(card)}.`;
  return (
    <Alert variant="info" className="flex items-center gap-3">
      <CalendarClock aria-hidden="true" className="size-5 shrink-0" />
      <p className="font-semibold">{`Tu plan ${subscription.plan.name} vence el ${expiryLabel(subscription)}.${renewal}`}</p>
    </Alert>
  );
}

/**
 * El aviso de estado arriba del contenido (spec 010 §6, mockups de `billing/suscripcion/`): vencida con el
 * `ReadOnlyBanner`, cambio programado, no se renovará o por vencer. Vigente sin nada que avisar, ninguno.
 */
export function SubscriptionStatusNotice(
  props: SubscriptionStatusNoticeProps,
): React.JSX.Element | null {
  const { subscription } = props;
  if (subscription.status === 'readOnly') {
    return <ReadOnlyBanner {...EXPIRED_BANNER} renewHref={RENEW_PATH} />;
  }
  if (!subscription.autoRenew && !isDowngradeToPersonal(subscription)) {
    return <NotRenewingNotice {...props} />;
  }
  if (subscription.pendingPlan !== null) return <PendingChangeNotice {...props} />;
  return subscription.status === 'expiring' ? <ExpiringNotice subscription={subscription} /> : null;
}
