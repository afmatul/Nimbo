import type { ReactNode } from 'react';

import { getEnv } from '../../../env';
import { RequireRole } from '../../../features/access/components/require-role';
import { CLIENT_ROLES } from '../../../features/access/home-path';
import { ClientProviders } from '../client-providers';

/**
 * Rutas del Cliente (003 §6.9); anidadas en `(app)`, que ya exige sesión. Los proveedores viven aquí para que navegar
 * dentro de la pestaña conserve las cargas, el panel y la sesión del agente; recargar la página los pierde (RN-7, plan
 * 005 §6 Frontend, 020b CA-17). Van dentro de la guarda de rol: un rol interno no llega a montarlos (CA-18).
 */
export default function ClienteGroupLayout({
  children,
}: {
  readonly children: ReactNode;
}): ReactNode {
  return (
    <RequireRole allowed={CLIENT_ROLES}>
      <ClientProviders apiPublicUrl={getEnv().API_PUBLIC_URL}>{children}</ClientProviders>
    </RequireRole>
  );
}
