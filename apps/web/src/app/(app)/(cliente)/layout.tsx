import type { ReactNode } from 'react';

import { getEnv } from '../../../env';
import { RequireRole } from '../../../features/access/components/require-role';
import { CLIENT_ROLES } from '../../../features/access/home-path';
import { SessionUploadsProvider } from '../../../features/storage/components/uploads-provider';

/**
 * Rutas del Cliente (003 §6.9); anidadas en `(app)`, que ya exige sesión. El proveedor de cargas vive aquí para que
 * navegar dentro de la pestaña conserve las cargas y el panel; recargar la página las pierde (RN-7, plan 005 §6
 * Frontend). Va dentro de la guarda de rol: un rol interno no llega a montarlo.
 */
export default function ClienteGroupLayout({
  children,
}: {
  readonly children: ReactNode;
}): ReactNode {
  return (
    <RequireRole allowed={CLIENT_ROLES}>
      <SessionUploadsProvider apiPublicUrl={getEnv().API_PUBLIC_URL}>
        {children}
      </SessionUploadsProvider>
    </RequireRole>
  );
}
