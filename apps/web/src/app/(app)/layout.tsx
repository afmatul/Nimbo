import type { ReactNode } from 'react';

import { getEnv } from '../../env';
import { SessionGate } from '../../features/identity/session/session-gate';
import { SessionProvider } from '../../features/identity/session/session-provider';

/** Nada de este grupo se prerenderiza: todo depende de la sesión. */
export const dynamic = 'force-dynamic';

/** Grupo exterior con sesión (plan 002 §6.9): `(cliente)` e `(interno)` van anidados dentro. */
export default function AppGroupLayout({ children }: { readonly children: ReactNode }): ReactNode {
  const env = getEnv();
  return (
    <SessionProvider apiPublicUrl={env.API_PUBLIC_URL}>
      <SessionGate>{children}</SessionGate>
    </SessionProvider>
  );
}
