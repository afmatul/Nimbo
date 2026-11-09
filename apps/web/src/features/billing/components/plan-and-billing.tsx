'use client';

import type { BillingHistoryResponse, SubscriptionView } from '@nimbo/contracts';
import * as React from 'react';

import { StateView } from '../../../components/nimbo/state-view';
import { Alert } from '../../../components/ui/alert';
import { toApiClientError } from '../../../lib/api-error';
import { messageForCode } from '../../../lib/error-catalog';
import { openInBrowser } from '../../../lib/use-preparing-download';
import type { AuthFetch } from '../../identity/session/auth-fetch';
import { useAuthFetch } from '../../identity/session/use-auth-fetch';
import { useSpace, type SpaceSummaryState } from '../../storage/components/space-provider';
import { fetchBillingHistory, requestInvoiceDownload } from '../billing-history-api';
import { useBillingHistory, type BillingHistoryState } from '../hooks/use-billing-history';
import {
  useSubscriptionSettings,
  type SubscriptionSettings,
} from '../hooks/use-subscription-settings';

import { BillingDetailsCard, PaymentMethodCard } from './billing-account-cards';
import { BillingPageLayout } from './billing-page-layout';
import { CurrentPlanCard } from './current-plan-card';
import { InvoiceHistory, type DownloadInvoice } from './invoice-history';
import { NextChargeCard } from './next-charge-card';
import { SubscriptionStatusNotice } from './subscription-status-notice';
import { UsageCard } from './usage-card';

export interface PlanAndBillingViewProps {
  readonly state: BillingHistoryState;
  readonly onRetry: () => void;
  readonly onDownload: DownloadInvoice;
  /** Resumen de espacio del grupo `(cliente)` para «Consumo del plan» y la barra lateral. */
  readonly space: SpaceSummaryState;
  /** 010: renovación automática y cancelar el cambio programado. */
  readonly settings: SubscriptionSettings;
}

interface ReadyProps {
  readonly history: BillingHistoryResponse;
  readonly space: SpaceSummaryState;
  readonly settings: SubscriptionSettings;
}

/**
 * En solo lectura con la renovación automática encendida, la pasada intentó cobrar con la tarjeta del último pago
 * aprobado y se rechazó (CA-2, RN-10): «Próximo cobro» lo dice con esa tarjeta (mockup `vencida`). Con la renovación
 * apagada no hubo cobro automático (CA-7), aunque después se rechace un pago manual (CA-9).
 */
const rejectedCardOf = (subscription: SubscriptionView, history: BillingHistoryResponse) =>
  subscription.status === 'readOnly' && subscription.autoRenew ? history.paymentMethod : null;

const usedBytesOf = (space: SpaceSummaryState): number | null =>
  space.status === 'ready' ? space.summary.usedBytes : null;

function SubscriptionCards({
  subscription,
  history,
  space,
  settings,
}: ReadyProps & { readonly subscription: SubscriptionView }): React.JSX.Element {
  return (
    <>
      <CurrentPlanCard subscription={subscription} />
      {subscription.expiresAt === null ? null : (
        <NextChargeCard
          subscription={subscription}
          card={history.paymentMethod}
          rejectedCard={rejectedCardOf(subscription, history)}
          toggle={settings.toggle}
        />
      )}
      <UsageCard plan={subscription.plan} space={space} />
    </>
  );
}

/** Columna izquierda del mockup: plan, próximo cobro y consumo (con suscripción), método de pago y datos de facturación. */
function AccountColumn(props: ReadyProps): React.JSX.Element {
  const { history } = props;
  const { subscription, paymentMethod } = history;
  return (
    <div className="flex min-w-0 flex-col gap-4">
      {subscription === null ? null : <SubscriptionCards {...props} subscription={subscription} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <PaymentMethodCard method={paymentMethod} />
        <BillingDetailsCard details={history.billingDetails} />
      </div>
    </div>
  );
}

/** El aviso de estado a todo el ancho, arriba del contenido (spec 010 §6), y el error de cancelar el cambio. */
function StatusArea({ history, space, settings }: ReadyProps): React.JSX.Element | null {
  const { subscription } = history;
  if (subscription === null) return null;
  return (
    <>
      <SubscriptionStatusNotice
        subscription={subscription}
        usedBytes={usedBytesOf(space)}
        cancelling={settings.cancel.cancelling}
        onCancel={settings.cancel.onCancel}
      />
      {settings.cancel.error === null ? null : (
        <Alert variant="error">{settings.cancel.error}</Alert>
      )}
    </>
  );
}

function ReadyBody({
  onDownload,
  ...props
}: ReadyProps & { readonly onDownload: DownloadInvoice }): React.JSX.Element {
  const { history } = props;
  return (
    <>
      <StatusArea {...props} />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:items-start">
        <AccountColumn {...props} />
        <InvoiceHistory
          payments={history.payments}
          receiptEmail={history.billingDetails?.receiptEmail ?? null}
          onDownload={onDownload}
        />
      </div>
    </>
  );
}

function Body({
  state,
  space,
  settings,
  onRetry,
  onDownload,
}: PlanAndBillingViewProps): React.JSX.Element {
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
  return (
    <ReadyBody history={state.history} space={space} settings={settings} onDownload={onDownload} />
  );
}

/**
 * «Plan y facturación» (spec 009 CA-7, CA-8; 010 §6, CA-25; mockups de `billing/suscripcion/`): estado de la suscripción,
 * plan, próximo cobro con la renovación automática, consumo, pagos y facturas.
 */
export function PlanAndBillingView(props: PlanAndBillingViewProps): React.JSX.Element {
  return (
    <BillingPageLayout trail={[{ label: 'Plan y facturación' }]} space={props.space}>
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
    </BillingPageLayout>
  );
}

export interface PlanAndBillingProps {
  readonly apiPublicUrl: string;
  readonly authFetch: AuthFetch;
  readonly openUrl?: (url: string) => void;
  readonly space: SpaceSummaryState;
}

/** Pide el enlace firmado de una factura y lo abre; un fallo devuelve el mensaje del catálogo por código (009 CA-8). */
function useInvoiceDownload({
  apiPublicUrl,
  authFetch,
  openUrl,
}: Omit<PlanAndBillingProps, 'space' | 'openUrl'> & {
  readonly openUrl: (url: string) => void;
}): DownloadInvoice {
  return React.useCallback<DownloadInvoice>(
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
  const { state, retry, replaceSubscription } = useBillingHistory(load);
  const settings = useSubscriptionSettings({
    apiPublicUrl,
    authFetch,
    onUpdated: replaceSubscription,
  });
  const onDownload = useInvoiceDownload({ apiPublicUrl, authFetch, openUrl });
  return (
    <PlanAndBillingView
      state={state}
      onRetry={retry}
      onDownload={onDownload}
      space={space}
      settings={settings}
    />
  );
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
