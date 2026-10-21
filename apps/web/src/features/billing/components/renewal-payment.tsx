'use client';

import {
  BILLING_ERROR_CODES,
  type BillingHistoryResponse,
  type SubscriptionView,
} from '@nimbo/contracts';
import { ArrowLeft, CircleAlert } from 'lucide-react';
import * as React from 'react';

import { StateView } from '../../../components/nimbo/state-view';
import { TextLink } from '../../../components/nimbo/text-link';
import { messageForCode } from '../../../lib/error-catalog';
import { longDayLabel } from '../../../lib/format-date';
import type { AuthFetch } from '../../identity/session/auth-fetch';
import { useAuthFetch } from '../../identity/session/use-auth-fetch';
import { fetchBillingHistory } from '../billing-history-api';
import { useBillingHistory } from '../hooks/use-billing-history';
import { usePaymentForm } from '../hooks/use-payment-form';
import { toRenewRequest } from '../payment-form-values';
import { PLAN_AND_BILLING_PATH } from '../routes';
import { renew } from '../subscription-api';

import { ApprovedCard, PaymentScreen } from './payment-form';
import type { PeriodNote } from './payment-summary';

type Renewal = NonNullable<SubscriptionView['renewal']>;

const UNAVAILABLE_CODES: Readonly<Record<NonNullable<Renewal['unavailableReason']>, string>> = {
  ALREADY_RENEWED: BILLING_ERROR_CODES.BILLING_ALREADY_RENEWED,
  PLAN_CHANGE_PENDING: BILLING_ERROR_CODES.BILLING_PLAN_CHANGE_PENDING,
};

const periodRange = (renewal: Renewal): string =>
  `del ${longDayLabel(renewal.periodStartsAt)} al ${longDayLabel(renewal.periodEndsAt)}`;

/** CA-8: empieza al terminar el periodo actual; CA-10: en solo lectura, hoy. */
const periodOf = (subscription: SubscriptionView, renewal: Renewal): PeriodNote => ({
  range: periodRange(renewal),
  note:
    subscription.status === 'readOnly'
      ? 'Empieza hoy, al aprobarse el pago, y tu cuenta deja de estar en solo lectura.'
      : 'Empieza cuando termina tu periodo actual: no pierdes días pagados.',
});

export interface RenewalFormProps {
  readonly subscription: SubscriptionView;
  readonly renewal: Renewal;
  readonly apiPublicUrl: string;
  readonly authFetch: AuthFetch;
}

/** El pago de la renovación con su periodo nuevo y su aprobado (spec 010 CA-8 a CA-10; mockups `pago--renovacion*`). */
export function RenewalForm({
  subscription,
  renewal,
  apiPublicUrl,
  authFetch,
}: RenewalFormProps): React.JSX.Element {
  const state = usePaymentForm({
    prepare: (values) => toRenewRequest(renewal.expectedExpiresAt, values),
    pay: (request) => renew(apiPublicUrl, authFetch, request),
  });
  return (
    <PaymentScreen
      plan={renewal.plan}
      title="Renovar tu plan"
      state={state}
      period={periodOf(subscription, renewal)}
      approved={(payment) => (
        <ApprovedCard
          message={`Renovaste tu plan ${payment.plan.name} hasta el ${longDayLabel(payment.expiresAt)}. Te enviamos el comprobante a ${payment.receiptEmail}.`}
          facts={[
            { label: 'Referencia', value: payment.reference },
            { label: 'Periodo nuevo', value: periodRange(renewal) },
          ]}
          link={{ href: PLAN_AND_BILLING_PATH, label: 'Ir a Plan y facturación' }}
        />
      )}
    />
  );
}

/** Personal (CA-11) o una renovación que hoy no se ofrece (CA-26, CA-28): el mensaje del catálogo y la vuelta. */
function NotRenewable({ code }: { readonly code: string }): React.JSX.Element {
  return (
    <>
      <h1 className="sr-only">Renovar tu plan</h1>
      <StateView type="empty" headingLevel="h2" icon={CircleAlert} title={messageForCode(code)} />
    </>
  );
}

function RenewalBody({
  history,
  apiPublicUrl,
  authFetch,
}: {
  readonly history: BillingHistoryResponse;
  readonly apiPublicUrl: string;
  readonly authFetch: AuthFetch;
}): React.JSX.Element {
  const subscription = history.subscription;
  const renewal = subscription?.renewal ?? null;
  if (subscription === null || renewal === null) {
    return <NotRenewable code={BILLING_ERROR_CODES.BILLING_NO_PAID_SUBSCRIPTION} />;
  }
  if (!renewal.available && renewal.unavailableReason !== null) {
    return <NotRenewable code={UNAVAILABLE_CODES[renewal.unavailableReason]} />;
  }
  return (
    <RenewalForm
      subscription={subscription}
      renewal={renewal}
      apiPublicUrl={apiPublicUrl}
      authFetch={authFetch}
    />
  );
}

export interface RenewalPageProps {
  readonly apiPublicUrl: string;
  readonly authFetch: AuthFetch;
}

/** `/suscripcion/renovar` (spec 010 CA-8 a CA-11, CA-26, CA-28): lee la suscripción para el periodo y el monto. */
export function RenewalPage({ apiPublicUrl, authFetch }: RenewalPageProps): React.JSX.Element {
  const load = React.useCallback(
    () => fetchBillingHistory(apiPublicUrl, authFetch),
    [apiPublicUrl, authFetch],
  );
  const { state, retry } = useBillingHistory(load);
  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-6">
      <TextLink href={PLAN_AND_BILLING_PATH} className="inline-flex items-center gap-1 text-sm">
        <ArrowLeft aria-hidden="true" className="h-4 w-4" />
        Volver a Plan y facturación
      </TextLink>
      {state.status === 'loading' ? (
        <StateView type="loading" headingLevel="h2" title="Cargando tu plan…" />
      ) : state.status === 'error' ? (
        <StateView
          type="error"
          headingLevel="h2"
          title="No pudimos cargar tu plan."
          description="No se hizo ningún cargo. Inténtalo de nuevo en unos segundos."
          action={{ label: 'Reintentar', onClick: retry, variant: 'outline' }}
        />
      ) : (
        <RenewalBody history={state.history} apiPublicUrl={apiPublicUrl} authFetch={authFetch} />
      )}
    </section>
  );
}

/** Con la sesión en memoria (`SessionProvider`), para la página. */
export function SessionRenewalPage({
  apiPublicUrl,
}: {
  readonly apiPublicUrl: string;
}): React.JSX.Element {
  return <RenewalPage apiPublicUrl={apiPublicUrl} authFetch={useAuthFetch()} />;
}
