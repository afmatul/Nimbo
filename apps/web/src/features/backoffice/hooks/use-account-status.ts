'use client';

import type { AccountListItem } from '@nimbo/contracts';
import * as React from 'react';

import { toApiClientError, type ApiClientError } from '../../../lib/api-error';
import type { BackofficeApi } from '../api';

import { isForbidden } from './use-latest-request';

/** Suspender (CA-2) o reactivar (CA-3). */
export type StatusChange = 'suspend' | 'reactivate';

export type AccountStatusApi = Pick<BackofficeApi, 'suspendAccount' | 'reactivateAccount'>;

interface StatusFlow {
  /** Cambio que se está confirmando (diálogo abierto). */
  readonly asking: StatusChange | null;
  readonly pending: boolean;
  /** Último cambio hecho: su aviso de éxito. */
  readonly done: StatusChange | null;
  /** Rechazo del último intento (p. ej. `IDENTITY_LAST_ACTIVE_ADMIN`): nada cambió. */
  readonly failure: ApiClientError | null;
  /** `403` (CA-14): quien actúa ya no puede; la pantalla común «sin permiso», como el resto del área. */
  readonly forbidden: boolean;
}

export interface AccountStatusActions extends StatusFlow {
  readonly ask: (change: StatusChange) => void;
  readonly cancel: () => void;
  readonly confirm: () => void;
}

export interface AccountStatusOptions {
  readonly api: AccountStatusApi;
  readonly account: AccountListItem;
  readonly onChanged: (account: AccountListItem) => void;
}

const IDLE: StatusFlow = {
  asking: null,
  pending: false,
  done: null,
  failure: null,
  forbidden: false,
};

function rejectedFlow(caught: unknown): StatusFlow {
  if (isForbidden(caught)) return { ...IDLE, forbidden: true };
  return { ...IDLE, failure: toApiClientError(caught) };
}

/**
 * Suspender y reactivar desde la ficha (011 CA-2 a CA-4): cada cambio se confirma; al terminar, el diálogo se cierra y
 * queda el aviso de éxito o el motivo del rechazo, sin cambiar nada.
 */
export function useAccountStatus({
  api,
  account,
  onChanged,
}: AccountStatusOptions): AccountStatusActions {
  const [flow, setFlow] = React.useState<StatusFlow>(IDLE);
  const confirm = (): void => {
    const change = flow.asking;
    if (change === null || flow.pending) return;
    setFlow({ ...flow, pending: true });
    const call = change === 'suspend' ? api.suspendAccount : api.reactivateAccount;
    call(account.id).then(
      (updated) => {
        onChanged(updated);
        setFlow({ ...IDLE, done: change });
      },
      (caught: unknown) => setFlow(rejectedFlow(caught)),
    );
  };
  return {
    ...flow,
    ask: (change) => setFlow({ ...IDLE, asking: change }),
    cancel: () => setFlow((current) => ({ ...current, asking: null })),
    confirm,
  };
}
