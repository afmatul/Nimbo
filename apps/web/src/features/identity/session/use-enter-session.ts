'use client';

import type { SessionResponse } from '@nimbo/contracts';
import { useRouter } from 'next/navigation';
import { useCallback } from 'react';

import { homePathFor } from '../../access/home-path';
import { pendingPlanPathOf } from '../pending-plan';

import { rememberSession } from './session-memory';

/**
 * Entra con una sesión recién abierta (inicio de sesión o verificación del correo): la deja en memoria para el
 * `SessionProvider` (CA-28) y lleva al inicio del rol sin dejar la pantalla pública en el historial (CA-1). Si al
 * registrarse eligió un plan de pago que aún no paga, lleva a contratarlo.
 */
export function useEnterSession(): (session: SessionResponse) => void {
  const router = useRouter();
  return useCallback(
    (session: SessionResponse) => {
      rememberSession(session);
      router.replace(pendingPlanPathOf(session.user) ?? homePathFor(session.user.role));
    },
    [router],
  );
}
