'use client';

import { useRouter } from 'next/navigation';
import { useEffect, type JSX, type ReactNode } from 'react';

import { StateView } from '../../../components/nimbo/state-view';
import { LOGIN_PATH, SESSION_ENDED_PATH } from '../routes';

import { useSession, type SessionStatus } from './session-provider';

const REDIRECTS: Partial<Record<SessionStatus, string>> = {
  unauthenticated: LOGIN_PATH,
  ended: SESSION_ENDED_PATH,
};

/**
 * Solo muestra a sus hijos con sesión. Mientras la recupera muestra la carga; sin sesión lleva a iniciar sesión, con el
 * aviso de sesión terminada si venció o se revocó (CA-8).
 */
export function SessionGate({ children }: { readonly children: ReactNode }): JSX.Element {
  const { status } = useSession();
  const router = useRouter();
  const redirect = REDIRECTS[status];

  useEffect(() => {
    if (redirect !== undefined) router.replace(redirect);
  }, [redirect, router]);

  if (status === 'authenticated') return <>{children}</>;
  return (
    <div className="mx-auto w-full max-w-md px-4 py-16">
      <StateView type="loading" title="Cargando tu sesión…" />
    </div>
  );
}
