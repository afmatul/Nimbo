'use client';

import { formatGtq, type BillingHistoryPayment } from '@nimbo/contracts';
import { AlertCircle, Download, Receipt } from 'lucide-react';
import * as React from 'react';

import { StateView } from '../../../components/nimbo/state-view';
import { Alert } from '../../../components/ui/alert';
import { Button } from '../../../components/ui/button';
import { Card } from '../../../components/ui/card';
import { longDayLabel } from '../../../lib/format-date';

/** Pide el enlace firmado y lo abre; si falla, devuelve el mensaje del catálogo (Art. VI.3). */
export type DownloadInvoice = (invoiceId: string) => Promise<string | null>;

const EMPTY_MESSAGE = 'Aún no tienes facturas ni pagos registrados.';

interface PaymentRowProps {
  readonly payment: BillingHistoryPayment;
  readonly onDownload: DownloadInvoice;
  readonly onError: (message: string | null) => void;
}

/** Una descarga a la vez: el botón queda deshabilitado mientras se pide el enlace. */
function useInvoiceDownload({ onDownload, onError }: Omit<PaymentRowProps, 'payment'>) {
  const [busy, setBusy] = React.useState(false);
  const download = async (invoiceId: string): Promise<void> => {
    setBusy(true);
    onError(await onDownload(invoiceId));
    setBusy(false);
  };
  return { busy, download };
}

function DownloadAction({ payment, ...actions }: PaymentRowProps): React.JSX.Element | null {
  const { busy, download } = useInvoiceDownload(actions);
  const invoice = payment.invoice;
  if (invoice === null) return null;
  if (!invoice.downloadable) {
    return <span className="text-xs text-secondary-foreground">PDF en preparación</span>;
  }
  return (
    <Button
      variant="ghost"
      size="icon"
      disabled={busy}
      aria-label={`Descargar factura ${invoice.number}`}
      onClick={() => void download(invoice.id)}
    >
      <Download className="h-4 w-4" aria-hidden="true" />
    </Button>
  );
}

/** «NB-2026-0042 · Pagada» o «Pago rechazado» (CA-7: estado en texto, no solo color). */
const statusLine = (payment: BillingHistoryPayment): string =>
  payment.invoice === null ? 'Pago rechazado' : `${payment.invoice.number} · Pagada`;

function PaymentItem(props: PaymentRowProps): React.JSX.Element {
  const { payment } = props;
  return (
    <li className="flex items-center justify-between gap-3 border-t border-border py-3 first:border-t-0">
      <div className="min-w-0">
        <p className="text-sm text-foreground">{longDayLabel(payment.createdAt)}</p>
        <p className="text-xs text-secondary-foreground">{statusLine(payment)}</p>
        <p className="text-xs text-muted-foreground">
          {payment.planName} · {payment.reference}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="text-sm tabular-nums text-foreground">
          {formatGtq(payment.amountCents)}
        </span>
        <DownloadAction {...props} />
      </div>
    </li>
  );
}

function DownloadError({ message }: { readonly message: string | null }): React.JSX.Element | null {
  if (message === null) return null;
  return (
    <Alert variant="critical" className="flex items-start gap-2">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <p>{message}</p>
    </Alert>
  );
}

function PaymentList({
  payments,
  ...actions
}: { readonly payments: readonly BillingHistoryPayment[] } & Omit<
  PaymentRowProps,
  'payment'
>): React.JSX.Element {
  if (payments.length === 0) {
    return <StateView type="empty" headingLevel="h3" icon={Receipt} title={EMPTY_MESSAGE} />;
  }
  return (
    <ul>
      {payments.map((payment) => (
        <PaymentItem key={payment.id} payment={payment} {...actions} />
      ))}
    </ul>
  );
}

/**
 * Columna «Pagos y facturas» (spec 009 CA-7, CA-8; mockup `billing/suscripcion/`): fecha, factura y estado, plan,
 * referencia, monto y descarga del PDF; los rechazos van sin factura. Sin pagos, el estado vacío de §6.
 */
export function InvoiceHistory({
  payments,
  receiptEmail,
  onDownload,
}: {
  readonly payments: readonly BillingHistoryPayment[];
  readonly receiptEmail: string | null;
  readonly onDownload: DownloadInvoice;
}): React.JSX.Element {
  const [error, setError] = React.useState<string | null>(null);
  return (
    <Card role="region" aria-labelledby="facturas-titulo" className="flex flex-col gap-3 p-5">
      <h2 id="facturas-titulo" className="text-base font-semibold text-foreground">
        Pagos y facturas
      </h2>
      <DownloadError message={error} />
      <PaymentList payments={payments} onDownload={onDownload} onError={setError} />
      {receiptEmail === null ? null : (
        <p className="border-t border-border pt-3 text-xs text-secondary-foreground">
          Las facturas se envían a {receiptEmail}.
        </p>
      )}
    </Card>
  );
}
