'use client';

import type { BillingHistoryResponse, Plan } from '@nimbo/contracts';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import { StateView } from '../../../components/nimbo/state-view';
import { toApiClientError } from '../../../lib/api-error';
import { messageForCode } from '../../../lib/error-catalog';
import type { AuthFetch } from '../../identity/session/auth-fetch';
import { useAuthFetch } from '../../identity/session/use-auth-fetch';
import { useSpace, type SpaceSummaryState } from '../../storage/components/space-provider';
import { fetchBillingHistory } from '../billing-history-api';
import { useBillingHistory } from '../hooks/use-billing-history';
import { fetchPlanCatalogWithSession } from '../plan-catalog-api';
import { PLAN_AND_BILLING_PATH } from '../routes';
import { schedulePlanChange } from '../subscription-api';

import { BillingPageLayout } from './billing-page-layout';
import { PlanChangeList } from './plan-change-list';

/** Lo que la página necesita: la suscripción (con su tarjeta) y los planes activos. */
interface PlanChangeData extends BillingHistoryResponse {
  readonly plans: readonly Plan[];
}

const TRAIL = [
  { label: 'Plan y facturación', href: PLAN_AND_BILLING_PATH },
  { label: 'Cambiar de plan' },
];

export interface PlanChangePageProps {
  readonly apiPublicUrl: string;
  readonly authFetch: AuthFetch;
  readonly space: SpaceSummaryState;
  /** Al programar, vuelve a «Plan y facturación», que ya muestra el cambio. */
  readonly onScheduled: () => void;
}

function useScheduling({
  apiPublicUrl,
  authFetch,
  onScheduled,
}: Omit<PlanChangePageProps, 'space'>) {
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const onSchedule = React.useCallback(
    (plan: Plan) => {
      setPending(true);
      schedulePlanChange(apiPublicUrl, authFetch, plan.slug)
        .then(onScheduled, (caught: unknown) =>
          setError(messageForCode(toApiClientError(caught).code)),
        )
        .finally(() => setPending(false));
    },
    [apiPublicUrl, authFetch, onScheduled],
  );
  return { pending, error, onSchedule, onDismissError: () => setError(null) };
}

/** El historial y el catálogo a la vez: la pantalla necesita los dos para marcar el plan actual. */
function usePlanChangeData({ apiPublicUrl, authFetch }: PlanChangePageProps) {
  const load = React.useCallback(async (): Promise<PlanChangeData> => {
    const [history, catalog] = await Promise.all([
      fetchBillingHistory(apiPublicUrl, authFetch),
      fetchPlanCatalogWithSession(apiPublicUrl, authFetch),
    ]);
    return { ...history, plans: catalog.plans };
  }, [apiPublicUrl, authFetch]);
  return useBillingHistory(load);
}

/** «Cambiar de plan» con su carga (historial y catálogo a la vez) y el envío (spec 010 CA-16 a CA-18, CA-27). */
export function PlanChangePage(props: PlanChangePageProps): React.JSX.Element {
  const { space } = props;
  const { state, retry } = usePlanChangeData(props);
  const scheduling = useScheduling(props);
  return (
    <BillingPageLayout trail={TRAIL} space={space}>
      {state.status === 'ready' ? null : <h1 className="sr-only">Cambiar de plan</h1>}
      {state.status === 'loading' ? (
        <StateView type="loading" headingLevel="h2" title="Cargando los planes…" />
      ) : state.status === 'error' ? (
        <StateView
          type="error"
          headingLevel="h2"
          title="No pudimos cargar los planes."
          description="Tu plan no cambió. Inténtalo de nuevo en unos segundos."
          action={{ label: 'Reintentar', onClick: retry, variant: 'outline' }}
        />
      ) : (
        <PlanChangeList
          history={state.history}
          plans={state.history.plans}
          usedBytes={space.status === 'ready' ? space.summary.usedBytes : null}
          {...scheduling}
        />
      )}
    </BillingPageLayout>
  );
}

/** Con la sesión, la tarjeta de espacio del grupo `(cliente)` y la navegación de Next. */
export function SessionPlanChangePage({
  apiPublicUrl,
}: {
  readonly apiPublicUrl: string;
}): React.JSX.Element {
  const router = useRouter();
  const authFetch = useAuthFetch();
  const space = useSpace();
  const onScheduled = React.useCallback(() => router.push(PLAN_AND_BILLING_PATH), [router]);
  return (
    <PlanChangePage
      apiPublicUrl={apiPublicUrl}
      authFetch={authFetch}
      space={space.state}
      onScheduled={onScheduled}
    />
  );
}
