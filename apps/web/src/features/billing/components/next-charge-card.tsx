'use client';

import { formatGtq, type SubscriptionView } from '@nimbo/contracts';
import { AlertCircle, RotateCcw } from 'lucide-react';
import Link from 'next/link';
import type * as React from 'react';

import { Alert } from '../../../components/ui/alert';
import { Button, buttonVariants } from '../../../components/ui/button';
import { Card } from '../../../components/ui/card';
import { longDayLabel } from '../../../lib/format-date';
import { RENEW_PATH } from '../routes';

import { AutoRenewSwitch } from './auto-renew-switch';
import { CardBrand } from './billing-account-cards';
import { expiryLabel, isDowngradeToPersonal, type Card as SavedCard } from './subscription-copy';

/** Si el último cobro automático se rechazó, con qué tarjeta (mockup `vencida`). */
export interface NextChargeCardProps {
  readonly subscription: SubscriptionView;
  readonly card: SavedCard | null;
  readonly rejectedCard: SavedCard | null;
  readonly toggle: {
    readonly pending: boolean;
    readonly failedTo: 'enable' | 'disable' | null;
    readonly onChange: (enabled: boolean) => void;
    readonly onRetry: () => void;
  };
}

function Fact({ label, children }: { readonly label: string; readonly children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 flex items-center gap-2 text-sm text-foreground">{children}</dd>
    </div>
  );
}

/** CA-25: fecha, monto con el plan del siguiente ciclo (RN-4) y la tarjeta que se cobrará (solo marca y últimos 4). */
function ChargeFacts({ charge }: { readonly charge: NonNullable<SubscriptionView['nextCharge']> }) {
  return (
    <dl className="grid gap-4 border-t border-border pt-4 sm:grid-cols-3">
      <Fact label="Fecha">{longDayLabel(charge.date)}</Fact>
      <Fact label="Monto">{`${formatGtq(charge.amountCents)} · plan ${charge.planName}`}</Fact>
      <Fact label="Tarjeta">
        {charge.card === null ? (
          '—'
        ) : (
          <>
            <CardBrand brand={charge.card.brand} />
            <span className="tabular-nums">···· {charge.card.last4}</span>
          </>
        )}
      </Fact>
    </dl>
  );
}

/** Lo que dice la tarjeta cuando no hay cobro que mostrar (mockups `vencida`, `renovacion-desactivada`, `cambio-a-personal`). */
const noChargeText = ({ subscription, rejectedCard }: NextChargeCardProps): string => {
  const until = expiryLabel(subscription);
  if (subscription.status === 'readOnly') {
    const rejected =
      rejectedCard === null
        ? ''
        : ` y el cobro automático con ${rejectedCard.brand.toUpperCase()} ···· ${rejectedCard.last4} fue rechazado`;
    return `Sin cobro programado. Tu suscripción venció el ${until}${rejected}.`;
  }
  if (isDowngradeToPersonal(subscription))
    return `Sin cobro: el ${until} pasas a Personal, que es gratis.`;
  return `No habrá cobro automático. Tu plan vence el ${until}.`;
};

/** El pie: «Renovar ahora» solo si se ofrece y la renovación automática está encendida; si no, por qué (CA-26, CA-28). */
function RenewalFooter({ subscription }: { readonly subscription: SubscriptionView }) {
  const { renewal, status } = subscription;
  if (renewal === null) return null;
  if (status === 'readOnly') {
    return 'Al renovar, el periodo nuevo de 30 días empieza el día del pago y tu cuenta deja de estar en solo lectura.';
  }
  if (renewal.unavailableReason === 'PLAN_CHANGE_PENDING') {
    return 'Con un cambio de plan programado no puedes renovar por adelantado. Si quieres renovar ahora, primero cancela el cambio.';
  }
  if (renewal.unavailableReason === 'ALREADY_RENEWED') {
    return `Ya pagaste el siguiente periodo: empieza el ${longDayLabel(renewal.periodStartsAt)}.`;
  }
  if (!subscription.autoRenew) return null;
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <Link
        href={RENEW_PATH}
        className={buttonVariants({ variant: 'outline', className: 'w-full sm:w-auto' })}
      >
        Renovar ahora
      </Link>
      <span>
        Pagas el siguiente periodo por adelantado: empieza cuando termine el actual y no pierdes
        días.
      </span>
    </div>
  );
}

function ToggleError({ toggle }: { readonly toggle: NextChargeCardProps['toggle'] }) {
  if (toggle.failedTo === null) return null;
  const action = toggle.failedTo === 'disable' ? 'desactivar' : 'activar';
  const kept = toggle.failedTo === 'disable' ? 'activada' : 'desactivada';
  return (
    <Alert variant="error" className="flex flex-col gap-3 sm:flex-row sm:items-start">
      <AlertCircle aria-hidden="true" className="size-5 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{`No pudimos ${action} la renovación automática.`}</p>
        <p className="text-foreground">{`Tu renovación sigue ${kept} y tu plan no cambió. Inténtalo de nuevo en unos segundos.`}</p>
      </div>
      <Button variant="outline" onClick={toggle.onRetry} className="w-full sm:w-auto">
        <RotateCcw aria-hidden="true" className="size-4" />
        Reintentar
      </Button>
    </Alert>
  );
}

/**
 * «Próximo cobro» (spec 010 CA-25, CA-6, CA-26, CA-28; mockups de `billing/suscripcion/`): qué se cobrará, el interruptor
 * de renovación automática y la renovación manual. Con la bajada a Personal no hay interruptor (no aplica).
 */
export function NextChargeCard(props: NextChargeCardProps): React.JSX.Element {
  const { subscription, card, toggle } = props;
  const downgrade = isDowngradeToPersonal(subscription);
  return (
    <Card role="region" aria-labelledby="proximo-cobro-titulo" className="flex flex-col gap-4 p-6">
      <h2 id="proximo-cobro-titulo" className="text-base font-semibold text-foreground">
        Próximo cobro
      </h2>
      <ToggleError toggle={toggle} />
      {subscription.nextCharge === null ? (
        <p className="text-sm text-foreground">{noChargeText(props)}</p>
      ) : (
        <ChargeFacts charge={subscription.nextCharge} />
      )}
      {downgrade ? null : (
        <div className="border-t border-border pt-4">
          <AutoRenewSwitch
            subscription={subscription}
            card={card}
            pending={toggle.pending}
            onChange={toggle.onChange}
          />
        </div>
      )}
      <div className="border-t border-border pt-4 text-sm text-secondary-foreground">
        {downgrade ? (
          'La renovación automática no aplica mientras esté programado el cambio a Personal. Con un cambio de plan programado no puedes renovar por adelantado.'
        ) : (
          <RenewalFooter subscription={subscription} />
        )}
      </div>
    </Card>
  );
}
