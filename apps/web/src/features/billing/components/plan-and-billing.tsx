'use client';

import type { BillingHistoryResponse } from '@nimbo/contracts';
import * as React from 'react';

import { AppLayout, DEFAULT_NAV_ITEMS } from '../../../components/nimbo/app-layout';
import { StateView } from '../../../components/nimbo/state-view';
import { toApiClientError } from '../../../lib/api-error';
import { messageForCode } from '../../../lib/error-catalog';
import type { AuthFetch } from '../../identity/session/auth-fetch';
import { useAuthFetch } from '../../identity/session/use-auth-fetch';
import { SidebarQuota } from '../../storage/components/sidebar-quota';
import { useSpace, type SpaceSummaryState } from '../../storage/components/space-provider';
import { fetchBillingHistory, requestInvoiceDownload } from '../billing-history-api';
import { useBillingHistory, type BillingHistoryState } from '../hooks/use-billing-history';

import { BillingDetailsCard, PaymentMethodCard } from './billing-account-cards';
import { CurrentPlanCard } from './current-plan-card';
import { InvoiceHistory, type DownloadInvoice } from './invoice-history';
import { UsageCard } from './usage-card';

/** Página de la cuenta, como «Seguridad» y «Mi actividad»: ningún destino de la barra lateral queda marcado. */
const NAV_ITEMS = DEFAULT_NAV_ITEMS.map((item) => ({ ...item, active: false }));

export interface PlanAndBillingViewProps {
  readonly state: BillingHistoryState;
  readonly onRetry: () => void;
  readonly onDownload: DownloadInvoice;
  /** Resumen de espacio del grupo `(cliente)` para «Consumo del plan» y la barra lateral. */
  readonly space: SpaceSummaryState;
}

/** «Cuenta / Plan y facturación» en la barra superior (mockup); solo en escritorio, como las migas de Mis archivos. */
function Breadcrumbs(): React.JSX.Element {
  return (
    <nav aria-label="Ruta" className="min-w-0">
      <ol className="flex items-center gap-2 text-sm">
        <li className="text-secondary-foreground">Cuenta</li>
        <li aria-hidden="true" className="text-muted-foreground">
          /
        </li>
        <li aria-current="page" className="font-semibold text-foreground">
          Plan y facturación
        </li>
      </ol>
    </nav>
  );
}

/** Plan, consumo, método y datos (izquierda) y pagos con facturas (derecha), como el mockup. */
/** Columna izquierda del mockup: plan y consumo (con suscripción), método de pago y datos de facturación. */
function AccountColumn({
  history,
  space,
}: {
  readonly history: BillingHistoryResponse;
  readonly space: SpaceSummaryState;
}): React.JSX.Element {
  const { subscription, paymentMethod } = history;
  return (
    <div className="flex min-w-0 flex-col gap-4">
      {subscription === null ? null : (
        <>
          <CurrentPlanCard subscription={subscription} paymentMethod={paymentMethod} />
          <UsageCard plan={subscription.plan} space={space} />
        </>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <PaymentMethodCard method={paymentMethod} />
        <BillingDetailsCard details={history.billingDetails} />
      </div>
    </div>
  );
}

function ReadyBody({
  history,
  space,
  onDownload,
}: {
  readonly history: BillingHistoryResponse;
  readonly space: SpaceSummaryState;
  readonly onDownload: DownloadInvoice;
}): React.JSX.Element {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:items-start">
      <AccountColumn history={history} space={space} />
      <InvoiceHistory
        payments={history.payments}
        receiptEmail={history.billingDetails?.receiptEmail ?? null}
        onDownload={onDownload}
      />
    </div>
  );
}

function Body({ state, space, onRetry, onDownload }: PlanAndBillingViewProps): React.JSX.Element {
  if (state.status === 'loading') {
    return <StateView type="loading" headingLevel="h2" title="Cargando tu plan y tus facturas…" />;
  }
  if (state.status === 'error') {
    return (
      <StateView
        type="error"
        headingLevel="h2"
        title="No pudimos cargar tu plan y tus facturas."
        description="Tus pagos y facturas siguen guardados. Inténtalo de nuevo en unos segundos."
        action={{ label: 'Reintentar', onClick: onRetry, variant: 'outline' }}
      />
    );
  }
  return <ReadyBody history={state.history} space={space} onDownload={onDownload} />;
}

/** «Plan y facturación» (spec 009 CA-7, CA-8; mockup `billing/suscripcion/`): plan vigente y pagos con su factura. */
export function PlanAndBillingView(props: PlanAndBillingViewProps): React.JSX.Element {
  return (
    <AppLayout
      navItems={NAV_ITEMS}
      topBar={<Breadcrumbs />}
      quotaCard={<SidebarQuota state={props.space} />}
    >
      <section
        className="mx-auto flex w-full max-w-6xl flex-col gap-4"
        aria-labelledby="plan-facturacion-titulo"
      >
        {/* Como el mockup, el título visible es el de las migas; el `h1` queda para lectores de pantalla. */}
        <h1 id="plan-facturacion-titulo" className="sr-only">
          Plan y facturación
        </h1>
        <Body {...props} />
      </section>
    </AppLayout>
  );
}

/** Abre la URL firmada en la pestaña: el navegador descarga el PDF (`attachment`). */
const openInBrowser = (url: string): void => window.location.assign(url);

export interface PlanAndBillingProps {
  readonly apiPublicUrl: string;
  readonly authFetch: AuthFetch;
  readonly openUrl?: (url: string) => void;
  readonly space: SpaceSummaryState;
}

/** La pantalla con su carga y su descarga; un fallo de descarga da el mensaje del catálogo por código. */
export function PlanAndBilling({
  apiPublicUrl,
  authFetch,
  openUrl = openInBrowser,
  space,
}: PlanAndBillingProps): React.JSX.Element {
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
  return <PlanAndBillingView state={state} onRetry={retry} onDownload={onDownload} space={space} />;
}

/** Con la sesión en memoria y la tarjeta de espacio de la barra lateral (`SpaceProvider` del grupo `(cliente)`). */
export function SessionPlanAndBilling({
  apiPublicUrl,
}: {
  readonly apiPublicUrl: string;
}): React.JSX.Element {
  const authFetch = useAuthFetch();
  const space = useSpace();
  return <PlanAndBilling apiPublicUrl={apiPublicUrl} authFetch={authFetch} space={space.state} />;
}
