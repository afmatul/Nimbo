'use client';

import type { SubscriptionView } from '@nimbo/contracts';
import * as React from 'react';

import { toApiClientError } from '../../../lib/api-error';
import { messageForCode } from '../../../lib/error-catalog';
import type { AuthFetch } from '../../identity/session/auth-fetch';
import { cancelPlanChange, setAutoRenew } from '../subscription-api';

/** Lo que se intentó con la renovación automática: encenderla o apagarla. */
export type ToggleIntent = 'enable' | 'disable';

export interface SubscriptionSettings {
  readonly toggle: {
    readonly pending: boolean;
    readonly failedTo: ToggleIntent | null;
    readonly onChange: (enabled: boolean) => void;
    readonly onRetry: () => void;
  };
  readonly cancel: {
    readonly cancelling: boolean;
    /** Mensaje del catálogo por código si cancelar falló (p. ej. `BILLING_NO_PENDING_PLAN_CHANGE`). */
    readonly error: string | null;
    readonly onCancel: () => void;
  };
}

interface Deps {
  readonly apiPublicUrl: string;
  readonly authFetch: AuthFetch;
  readonly onUpdated: (subscription: SubscriptionView) => void;
}

function useAutoRenewToggle({
  apiPublicUrl,
  authFetch,
  onUpdated,
}: Deps): SubscriptionSettings['toggle'] {
  const [pending, setPending] = React.useState(false);
  const [failedTo, setFailedTo] = React.useState<ToggleIntent | null>(null);
  const onChange = React.useCallback(
    (enabled: boolean) => {
      setPending(true);
      setFailedTo(null);
      setAutoRenew(apiPublicUrl, authFetch, enabled)
        .then(onUpdated, () => setFailedTo(enabled ? 'enable' : 'disable'))
        .finally(() => setPending(false));
    },
    [apiPublicUrl, authFetch, onUpdated],
  );
  const onRetry = React.useCallback(() => {
    if (failedTo !== null) onChange(failedTo === 'enable');
  }, [failedTo, onChange]);
  return { pending, failedTo, onChange, onRetry };
}

function useCancelPlanChange({
  apiPublicUrl,
  authFetch,
  onUpdated,
}: Deps): SubscriptionSettings['cancel'] {
  const [cancelling, setCancelling] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const onCancel = React.useCallback(() => {
    setCancelling(true);
    setError(null);
    cancelPlanChange(apiPublicUrl, authFetch)
      .then(onUpdated, (caught: unknown) => setError(messageForCode(toApiClientError(caught).code)))
      .finally(() => setCancelling(false));
  }, [apiPublicUrl, authFetch, onUpdated]);
  return { cancelling, error, onCancel };
}

/**
 * Los ajustes de «Plan y facturación» (spec 010 CA-6, CA-19): la renovación automática (con «Reintentar» si falla, mockup
 * `error-renovacion`) y cancelar el cambio programado. La respuesta del API reemplaza la vista de la página.
 */
export function useSubscriptionSettings(deps: Deps): SubscriptionSettings {
  return { toggle: useAutoRenewToggle(deps), cancel: useCancelPlanChange(deps) };
}
