'use client';

import type { BackofficeMetricsResponse } from '@nimbo/contracts';
import * as React from 'react';

import { isForbidden, useLatestRequest, type RequestOutcome } from './use-latest-request';

/** `GET /backoffice/metrics`; debe ser estable entre renders. */
export type LoadMetrics = () => Promise<BackofficeMetricsResponse>;

/** `forbidden`: 403 (CA-14), la pantalla común «sin permiso». */
export type MetricsState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly metrics: BackofficeMetricsResponse }
  | { readonly status: 'forbidden' }
  | { readonly status: 'error' };

export interface Metrics {
  readonly state: MetricsState;
  readonly retry: () => void;
}

function toMetricsState(outcome: RequestOutcome<BackofficeMetricsResponse>): MetricsState {
  if (outcome.ok) return { status: 'ready', metrics: outcome.value };
  return isForbidden(outcome.error) ? { status: 'forbidden' } : { status: 'error' };
}

/**
 * Métricas agregadas (011 CA-12, CA-17): se piden al abrir la pantalla; sin caché ni «Actualizar» (decisión 8). La
 * petición no lleva parámetros: cada «Reintentar» es un intento nuevo, y por eso el hook recibe un número.
 */
export function useMetrics(load: LoadMetrics): Metrics {
  const [attempt, setAttempt] = React.useState(0);
  const [state, setState] = React.useState<MetricsState>({ status: 'loading' });
  useLatestRequest({ load, request: attempt, toState: toMetricsState, setState });
  return {
    state,
    retry: () => {
      setAttempt((previous) => previous + 1);
      setState({ status: 'loading' });
    },
  };
}
