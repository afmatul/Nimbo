'use client';

import type { PlanAdminView } from '@nimbo/contracts';
import * as React from 'react';

import { toApiClientError, type ApiClientError } from '../../../lib/api-error';
import type { BackofficeApi } from '../api';

import { isForbidden } from './use-latest-request';

export type PlanDeactivationApi = Pick<BackofficeApi, 'deactivatePlan'>;

interface DeactivationFlow {
  /** Plan que se está confirmando (diálogo abierto). */
  readonly asking: PlanAdminView | null;
  readonly pending: boolean;
  /** Plan desactivado: su aviso de éxito. */
  readonly done: PlanAdminView | null;
  /** Rechazo del intento (p. ej. `BILLING_PLAN_NOT_DEACTIVATABLE`): nada cambió. */
  readonly failure: ApiClientError | null;
  /** `403` (CA-14): quien actúa ya no puede; la pantalla común «sin permiso». */
  readonly forbidden: boolean;
}

export interface PlanDeactivation extends DeactivationFlow {
  readonly ask: (plan: PlanAdminView) => void;
  readonly cancel: () => void;
  readonly confirm: () => void;
}

export interface PlanDeactivationOptions {
  readonly api: PlanDeactivationApi;
  /** El plan desactivado: el catálogo lo vuelve a pintar. */
  readonly onDeactivated: (plan: PlanAdminView) => void;
}

const IDLE: DeactivationFlow = {
  asking: null,
  pending: false,
  done: null,
  failure: null,
  forbidden: false,
};

function rejectedFlow(caught: unknown): DeactivationFlow {
  if (isForbidden(caught)) return { ...IDLE, forbidden: true };
  return { ...IDLE, failure: toApiClientError(caught) };
}

/**
 * Desactivar un plan (011 CA-10): se confirma con sus consecuencias; un plan desactivado no se reactiva (RN-4) y
 * quien lo tiene lo conserva. Al terminar, el diálogo se cierra y queda el aviso de éxito o el motivo del rechazo.
 */
export function usePlanDeactivation({
  api,
  onDeactivated,
}: PlanDeactivationOptions): PlanDeactivation {
  const [flow, setFlow] = React.useState<DeactivationFlow>(IDLE);
  const confirm = (): void => {
    const plan = flow.asking;
    if (plan === null || flow.pending) return;
    setFlow({ ...flow, pending: true });
    api.deactivatePlan(plan.id).then(
      (deactivated) => {
        onDeactivated(deactivated);
        setFlow({ ...IDLE, done: deactivated });
      },
      (caught: unknown) => setFlow(rejectedFlow(caught)),
    );
  };
  return {
    ...flow,
    ask: (plan) => setFlow({ ...IDLE, asking: plan }),
    cancel: () => setFlow((current) => ({ ...current, asking: null })),
    confirm,
  };
}
