import type { ReactNode } from 'react';

import { getEnv } from '../../env';
import { SaveFailedListener } from '../../features/editing/components/save-failed-listener';
import { SessionHeaderProvider } from '../../features/identity/components/session-header-provider';
import { SessionGate } from '../../features/identity/session/session-gate';
import { SessionProvider } from '../../features/identity/session/session-provider';
import { RealtimeProvider } from '../../features/realtime/realtime-provider';

/** Nada de este grupo se prerenderiza: todo depende de la sesión. */
export const dynamic = 'force-dynamic';

/**
 * Grupo exterior con sesión (plan 002 §6.9): `(cliente)` e `(interno)` van anidados dentro. Pone el menú de la cuenta
 * y el logo con el inicio del rol en la cabecera de cada `AppLayout` del grupo (CA-14), abre el canal en vivo del cliente (015 CA-4, CA-11) y, arriba
 * del contenido, muestra los avisos de guardado fallido que llegan por él (016 CA-14).
 */
export default function AppGroupLayout({ children }: { readonly children: ReactNode }): ReactNode {
  const env = getEnv();
  return (
    <SessionProvider apiPublicUrl={env.API_PUBLIC_URL}>
      <SessionGate>
        <RealtimeProvider apiPublicUrl={env.API_PUBLIC_URL}>
          <SaveFailedListener />
          <SessionHeaderProvider>{children}</SessionHeaderProvider>
        </RealtimeProvider>
      </SessionGate>
    </SessionProvider>
  );
}
