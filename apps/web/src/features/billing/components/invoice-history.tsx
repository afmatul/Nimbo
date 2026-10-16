'use client';

import {
  formatGtq,
  type BillingHistoryPayment,
  type BillingHistoryResponse,
} from '@nimbo/contracts';
import { AlertCircle, Download, Receipt } from 'lucide-react';
import * as React from 'react';

import { StateView } from '../../../components/nimbo/state-view';
import { Alert } from '../../../components/ui/alert';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Card } from '../../../components/ui/card';
import { toApiClientError } from '../../../lib/api-error';
import { messageForCode } from '../../../lib/error-catalog';
import { dayLabel } from '../../../lib/format-date';
import type { AuthFetch } from '../../identity/session/auth-fetch';
import { useAuthFetch } from '../../identity/session/use-auth-fetch';
import { fetchBillingHistory, requestInvoiceDownload } from '../billing-history-api';
import { useBillingHistory, type BillingHistoryState } from '../hooks/use-billing-history';

const EMPTY_MESSAGE = 'Aún no tienes facturas ni pagos registrados.';
const STATUS_LABEL: Readonly<Record<BillingHistoryPayment['status'], string>> = {
  aprobada: 'Aprobado',
  rechazada: 'Rechazado',
};

/** Descarga de una factura: pide el enlace firmado y lo abre; si falla, devuelve el mensaje del catálogo. */
export type DownloadInvoice = (invoiceId: string) => Promise<string | null>;

export interface InvoiceHistoryViewProps {
  readonly state: BillingHistoryState;
  readonly onRetry: () => void;
  readonly onDownload: DownloadInvoice;
}

/** «Tu plan»: nombre y, si es de pago, hasta cuándo está activo (CA-7). Sin fila de suscripción no se muestra. */
function CurrentPlanCard({
  subscription,
}: Pick<BillingHistoryResponse, 'subscription'>): React.JSX.Element | null {
  if (subscription === null) return null;
  return (
    <Card role="region" aria-labelledby="plan-actual-titulo" className="p-5">
      <h2 id="plan-actual-titulo" className="text-base font-semibold">
        Tu plan
      </h2>
      <p className="mt-2 text-xl font-bold text-foreground">{subscription.planName}</p>
      <p className="mt-1 text-sm text-secondary-foreground">
        {subscription.expiresAt === null
          ? 'Sin vencimiento.'
          : `Activo hasta el ${dayLabel(subscription.expiresAt)}.`}
      </p>
    </Card>
  );
}

function DownloadButton({
  payment,
  onDownload,
  onError,
}: {
  readonly payment: BillingHistoryPayment;
  readonly onDownload: DownloadInvoice;
  readonly onError: (message: string | null) => void;
}): React.JSX.Element | null {
  const [busy, setBusy] = React.useState(false);
  const invoice = payment.invoice;
  if (invoice === null) return null;
  if (!invoice.downloadable) {
    return <span className="text-sm text-secondary-foreground">PDF en preparación</span>;
  }
  const download = async (): Promise<void> => {
    setBusy(true);
    onError(await onDownload(invoice.id));
    setBusy(false);
  };
  return (
    <Button variant="outline" size="sm" disabled={busy} onClick={() => void download()}>
      <Download className="h-4 w-4" aria-hidden="true" />
      Descargar <span className="sr-only">factura {invoice.number}</span>
    </Button>
  );
}

function PaymentRow({
  payment,
  onDownload,
  onError,
}: {
  readonly payment: BillingHistoryPayment;
  readonly onDownload: DownloadInvoice;
  readonly onError: (message: string | null) => void;
}): React.JSX.Element {
  return (
    <tr className="border-t border-border align-middle">
      <td className="py-3 pr-4 tabular-nums">{dayLabel(payment.createdAt)}</td>
      <td className="py-3 pr-4">{payment.planName}</td>
      <td className="py-3 pr-4 tabular-nums">{payment.reference}</td>
      <td className="py-3 pr-4 tabular-nums">{payment.invoice?.number ?? '—'}</td>
      <td className="py-3 pr-4 text-right tabular-nums">{formatGtq(payment.amountCents)}</td>
      <td className="py-3 pr-4">
        <Badge variant={payment.status === 'aprobada' ? 'success' : 'warning'}>
          {STATUS_LABEL[payment.status]}
        </Badge>
      </td>
      <td className="py-3 text-right">
        <DownloadButton payment={payment} onDownload={onDownload} onError={onError} />
      </td>
    </tr>
  );
}

const COLUMNS = ['Fecha', 'Plan', 'Referencia', 'Factura', 'Monto', 'Estado', 'PDF'] as const;

function PaymentsTable({
  payments,
  onDownload,
}: {
  readonly payments: readonly BillingHistoryPayment[];
  readonly onDownload: DownloadInvoice;
}): React.JSX.Element {
  const [error, setError] = React.useState<string | null>(null);
  return (
    <Card role="region" aria-labelledby="historial-titulo" className="p-5">
      <h2 id="historial-titulo" className="text-base font-semibold">
        Pagos y facturas
      </h2>
      {error === null ? null : (
        <Alert variant="critical" className="mt-3 flex items-start gap-2">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>{error}</p>
        </Alert>
      )}
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {COLUMNS.map((column) => (
                <th
                  key={column}
                  scope="col"
                  className={column === 'Monto' ? 'pb-2 pr-4 text-right' : 'pb-2 pr-4'}
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {payments.map((payment) => (
              <PaymentRow
                key={payment.id}
                payment={payment}
                onDownload={onDownload}
                onError={setError}
              />
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function HistoryBody({ state, onRetry, onDownload }: InvoiceHistoryViewProps): React.JSX.Element {
  if (state.status === 'loading') {
    return <StateView type="loading" headingLevel="h2" title="Cargando tu historial…" />;
  }
  if (state.status === 'error') {
    return (
      <StateView
        type="error"
        headingLevel="h2"
        title="No pudimos cargar tu historial."
        description="Tus pagos y facturas siguen guardados. Inténtalo de nuevo en unos segundos."
        action={{ label: 'Reintentar', onClick: onRetry, variant: 'outline' }}
      />
    );
  }
  const { subscription, payments } = state.history;
  return (
    <>
      <CurrentPlanCard subscription={subscription} />
      {payments.length === 0 ? (
        <StateView type="empty" headingLevel="h2" icon={Receipt} title={EMPTY_MESSAGE} />
      ) : (
        <PaymentsTable payments={payments} onDownload={onDownload} />
      )}
    </>
  );
}

/** Mi suscripción (spec 009 CA-7, CA-8; mockup `billing/suscripcion/`): plan actual e historial con descarga. */
export function InvoiceHistoryView(props: InvoiceHistoryViewProps): React.JSX.Element {
  return (
    <section
      className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-6"
      aria-labelledby="suscripcion-titulo"
    >
      <header>
        <h1
          id="suscripcion-titulo"
          className="text-xl font-semibold tracking-tight text-foreground"
        >
          Mi suscripción
        </h1>
        <p className="mt-1 text-sm text-secondary-foreground">
          Tu plan actual y tus pagos y facturas.
        </p>
      </header>
      <HistoryBody {...props} />
    </section>
  );
}

/** Abre la URL firmada en la pestaña: el navegador descarga el PDF (`attachment`). */
const openInBrowser = (url: string): void => window.location.assign(url);

export interface InvoiceHistoryProps {
  readonly apiPublicUrl: string;
  readonly authFetch: AuthFetch;
  readonly openUrl?: (url: string) => void;
}

/** La pantalla con su carga y su descarga; un fallo de descarga da el mensaje del catálogo por código (Art. VI.3). */
export function InvoiceHistory({
  apiPublicUrl,
  authFetch,
  openUrl = openInBrowser,
}: InvoiceHistoryProps): React.JSX.Element {
  const load = React.useCallback(
    () => fetchBillingHistory(apiPublicUrl, authFetch),
    [apiPublicUrl, authFetch],
  );
  const { state, retry } = useBillingHistory(load);
  const onDownload = React.useCallback<DownloadInvoice>(
    async (invoiceId) => {
      try {
        openUrl((await requestInvoiceDownload(apiPublicUrl, authFetch, invoiceId)).downloadUrl);
        return null;
      } catch (caught) {
        return messageForCode(toApiClientError(caught).code);
      }
    },
    [apiPublicUrl, authFetch, openUrl],
  );
  return <InvoiceHistoryView state={state} onRetry={retry} onDownload={onDownload} />;
}

/** La misma pantalla con la sesión en memoria (`SessionProvider`), para la página. */
export function SessionInvoiceHistory({
  apiPublicUrl,
}: {
  readonly apiPublicUrl: string;
}): React.JSX.Element {
  const authFetch = useAuthFetch();
  return <InvoiceHistory apiPublicUrl={apiPublicUrl} authFetch={authFetch} />;
}
