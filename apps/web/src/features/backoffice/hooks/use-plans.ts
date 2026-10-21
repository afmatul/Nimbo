'use client';

import type { PlanAdminListResponse, PlanAdminView } from '@nimbo/contracts';
import * as React from 'react';

import { isForbidden, useLatestRequest, type RequestOutcome } from './use-latest-request';

/** `GET /backoffice/plans`; debe ser estable entre renders. */
export type LoadPlans = () => Promise<PlanAdminListResponse>;

/** `forbidden`: 403 (CA-14), la pantalla común «sin permiso». */
export type PlansState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly plans: readonly PlanAdminView[] }
  | { readonly status: 'forbidden' }
  | { readonly status: 'error' };

export interface Plans {
  readonly state: PlansState;
  readonly retry: () => void;
  /** Cambia un plan de la lista en su sitio, sin volver a pedirla (tras desactivarlo, CA-10). */
  readonly replace: (plan: PlanAdminView) => void;
}

function toPlansState(outcome: RequestOutcome<PlanAdminListResponse>): PlansState {
  if (outcome.ok) return { status: 'ready', plans: outcome.value.items };
  return isForbidden(outcome.error) ? { status: 'forbidden' } : { status: 'error' };
}

/**
 * Catálogo de planes (011 CA-8, CA-17): se pide al abrir la pantalla; sin caché ni «Actualizar» (mockup, decisión 8).
 * La petición no lleva parámetros: cada «Reintentar» es un intento nuevo, y por eso el hook recibe un número.
 */
export function usePlans(load: LoadPlans): Plans {
  const [attempt, setAttempt] = React.useState(0);
  const [state, setState] = React.useState<PlansState>({ status: 'loading' });
  useLatestRequest({ load, request: attempt, toState: toPlansState, setState });
  return {
    state,
    retry: () => {
      setAttempt((previous) => previous + 1);
      setState({ status: 'loading' });
    },
    replace: (plan) =>
      setState((current) =>
        current.status === 'ready'
          ? {
              status: 'ready',
              plans: current.plans.map((item) => (item.id === plan.id ? plan : item)),
            }
          : current,
      ),
  };
}
