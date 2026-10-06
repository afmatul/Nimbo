import type { ReactNode } from 'react';

import { HeaderAccountProvider } from '../../components/nimbo/header-account';
import { getEnv } from '../../env';
import { SessionAccountMenu } from '../../features/identity/components/session-account-menu';
import { SessionGate } from '../../features/identity/session/session-gate';
import { SessionProvider } from '../../features/identity/session/session-provider';

/** Nada de este grupo se prerenderiza: todo depende de la sesión. */
export const dynamic = 'force-dynamic';

/**
 * Grupo exterior con sesión (plan 002 §6.9): `(cliente)` e `(interno)` van anidados dentro. Pone el menú de la cuenta
 * en la cabecera de cada `AppLayout` del grupo (CA-14).
 */
export default function AppGroupLayout({ children }: { readonly children: ReactNode }): ReactNode {
  const env = getEnv();
  return (
    <SessionProvider apiPublicUrl={env.API_PUBLIC_URL}>
      <SessionGate>
        <HeaderAccountProvider account={<SessionAccountMenu />}>{children}</HeaderAccountProvider>
      </SessionGate>
    </SessionProvider>
  );
}
