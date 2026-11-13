import type { ReactNode } from 'react';

import { getEnv } from '../env';
import { HomeRedirect } from '../features/identity/session/home-redirect';
import { SessionProvider } from '../features/identity/session/session-provider';

/** La URL pública de la API se lee en cada petición, no en el build (CA-29). */
export const dynamic = 'force-dynamic';

/** `/` no tiene contenido propio: lleva al inicio del rol con sesión o a iniciar sesión sin ella. */
export default function RootPage(): ReactNode {
  return (
    <SessionProvider apiPublicUrl={getEnv().API_PUBLIC_URL}>
      <HomeRedirect />
    </SessionProvider>
  );
}
