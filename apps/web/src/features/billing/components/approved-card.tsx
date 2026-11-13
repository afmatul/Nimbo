import { formatGtq, type PaymentReceipt } from '@nimbo/contracts';
import { CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

import { BrandMark } from '../../../components/nimbo/brand-mark';
import { buttonVariants } from '../../../components/ui/button';
import { Card } from '../../../components/ui/card';

/** Una fila del comprobante: referencia, vencimiento o periodo nuevo. */
export interface ApprovedFact {
  readonly label: string;
  readonly value: string;
}

export interface ApprovedCardProps {
  readonly message: string;
  /** El recibo de la API y los datos propios de cada flujo (referencia, vencimiento o periodo). */
  readonly receipt: { readonly payment: PaymentReceipt; readonly facts: readonly ApprovedFact[] };
  readonly link: { readonly href: string; readonly label: string };
}

/** Desglose de RN-2 en quetzales, de los centavos de la API. */
const amountsOf = ({ plan, amounts }: PaymentReceipt): readonly ApprovedFact[] => [
  { label: 'Plan', value: plan.name },
  { label: 'Subtotal', value: formatGtq(amounts.subtotalCents) },
  { label: 'IVA', value: formatGtq(amounts.vatCents) },
];

function FactRows({ facts }: { readonly facts: readonly ApprovedFact[] }): React.JSX.Element {
  return (
    <>
      {facts.map((fact) => (
        <div key={fact.label} className="flex justify-between gap-4 py-1.5">
          <dt className="text-secondary-foreground">{fact.label}</dt>
          <dd className="text-right font-medium tabular-nums text-foreground">{fact.value}</dd>
        </div>
      ))}
    </>
  );
}

/** Encabezado del comprobante con la identidad de Nimbo: isotipo, nombre y el sello «Pago aprobado». */
function ReceiptHeader(): React.JSX.Element {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 bg-agent-bg px-6 py-4 text-agent-text">
      <span role="img" aria-label="Nimbo" className="flex items-center gap-2">
        <BrandMark className="h-6 w-auto" />
        <span aria-hidden="true" className="text-sm font-bold tracking-widest">
          NIMBO
        </span>
      </span>
      <p className="text-xs font-semibold uppercase tracking-wider">Comprobante de pago</p>
    </div>
  );
}

/**
 * Aprobado (009 CA-3, CA-6; 010 CA-8) como comprobante con la identidad de Nimbo: encabezado con el logo, el mensaje
 * con a dónde se envió, los datos del flujo, el desglose (subtotal, IVA y total, `tabular-nums`) y a dónde seguir.
 */
export function ApprovedCard({ message, receipt, link }: ApprovedCardProps): React.JSX.Element {
  const { payment, facts } = receipt;
  return (
    <Card
      role="region"
      aria-label="Comprobante de pago Nimbo"
      className="overflow-hidden p-0"
      data-state="aprobado"
    >
      <ReceiptHeader />
      <div className="flex flex-col gap-4 p-6">
        <div className="flex items-center gap-3">
          <CheckCircle2 aria-hidden="true" className="h-8 w-8 shrink-0 text-success-foreground" />
          <h1 className="text-xl font-bold text-foreground">Pago aprobado</h1>
        </div>
        <p className="text-sm text-foreground">{message}</p>
        <dl className="divide-y divide-border rounded-md border border-border bg-background px-4 text-sm">
          <FactRows facts={[...facts, ...amountsOf(payment)]} />
          <div className="flex justify-between gap-4 py-2.5 text-base">
            <dt className="font-semibold text-foreground">Total pagado</dt>
            <dd className="font-bold tabular-nums text-primary">
              {formatGtq(payment.amounts.totalCents)}
            </dd>
          </div>
        </dl>
        <Link href={link.href} className={buttonVariants({ className: 'w-full sm:w-fit' })}>
          {link.label}
        </Link>
      </div>
    </Card>
  );
}
