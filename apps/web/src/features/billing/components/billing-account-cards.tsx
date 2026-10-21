import type { BillingHistoryResponse } from '@nimbo/contracts';
import type * as React from 'react';

import { Card } from '../../../components/ui/card';

const CONSUMER_NIT = 'CF';

function AccountCard({
  id,
  title,
  children,
}: {
  readonly id: string;
  readonly title: string;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  return (
    <Card role="region" aria-labelledby={id} className="flex flex-col gap-3 p-5">
      <h2 id={id} className="text-base font-semibold text-foreground">
        {title}
      </h2>
      {children}
    </Card>
  );
}

/**
 * «Método de pago» (mockup): la tarjeta del último pago aprobado, solo marca y últimos 4 (RN-9). La 009 no guarda
 * la tarjeta ni su vencimiento: «Cambiar» y «caduca» no aplican.
 */
export function PaymentMethodCard({
  method,
}: {
  readonly method: BillingHistoryResponse['paymentMethod'];
}): React.JSX.Element {
  return (
    <AccountCard id="metodo-pago-titulo" title="Método de pago">
      {method === null ? (
        <p className="text-sm text-secondary-foreground">Aún no has pagado con tarjeta.</p>
      ) : (
        <div className="flex items-center gap-3">
          <span className="rounded-md border border-border bg-muted px-2 py-1 text-xs font-semibold uppercase text-foreground">
            {method.brand}
          </span>
          <span className="text-sm tabular-nums text-foreground">
            ···· ···· ···· {method.last4}
          </span>
        </div>
      )}
    </AccountCard>
  );
}

/** «Datos de facturación» (mockup): NIT y correo de la última factura; se fijan en cada pago (RN-9). */
export function BillingDetailsCard({
  details,
}: {
  readonly details: BillingHistoryResponse['billingDetails'];
}): React.JSX.Element {
  return (
    <AccountCard id="datos-facturacion-titulo" title="Datos de facturación">
      {details === null ? (
        <p className="text-sm text-secondary-foreground">Se guardan con tu primer pago.</p>
      ) : (
        <div className="space-y-0.5 text-sm">
          <p className="text-foreground">
            {details.nit === CONSUMER_NIT ? 'Consumidor final (CF)' : `NIT ${details.nit}`}
          </p>
          <p className="text-secondary-foreground">{details.receiptEmail}</p>
        </div>
      )}
    </AccountCard>
  );
}
