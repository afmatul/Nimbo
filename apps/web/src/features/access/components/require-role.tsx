'use client';

import type { RoleName } from '@nimbo/contracts';
import { useRouter } from 'next/navigation';
import { useEffect, type JSX, type ReactNode } from 'react';

import { useSession } from '../../identity/session/session-provider';
import { homePathFor } from '../home-path';

export interface RequireRoleProps {
  readonly allowed: readonly RoleName[];
  readonly children: ReactNode;
}

/**
 * Muestra a sus hijos solo si el rol de la sesión está en `allowed`; con otro rol lleva a su inicio (003 §6.9). Sin
 * sesión no decide: de eso se encarga `SessionGate` (002). Es experiencia, no barrera: la barrera es la API (CA-5).
 *
 * Corre en el navegador: lo que un layout de servidor le pase como `children` ya viajó en la respuesta aunque aquí se
 * devuelva `null`. Por eso las páginas bajo `(cliente)` e `(interno)` no piden datos del usuario desde el servidor;
 * los piden a la API desde el cliente, que autoriza con el token (003 PR-F, SEC-1).
 */
export function RequireRole({ allowed, children }: RequireRoleProps): JSX.Element | null {
  const { user } = useSession();
  const router = useRouter();
  const redirect = user !== null && !allowed.includes(user.role) ? homePathFor(user.role) : null;

  useEffect(() => {
    if (redirect !== null) router.replace(redirect);
  }, [redirect, router]);

  if (user === null || redirect !== null) return null;
  return <>{children}</>;
}
