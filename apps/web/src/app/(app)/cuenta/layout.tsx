import type { ReactNode } from 'react';

import { getEnv } from '../../../env';
import { ClientProvidersForClientRole } from '../client-providers';

/**
 * Páginas de la cuenta para los cuatro roles (Seguridad): el cliente las ve con la misma barra lateral que el resto de
 * sus pantallas (Agente Nimbo y tarjeta de espacio); los roles internos, con el marco de su área.
 */
export default function CuentaLayout({ children }: { readonly children: ReactNode }): ReactNode {
  return (
    <ClientProvidersForClientRole apiPublicUrl={getEnv().API_PUBLIC_URL}>
      {children}
    </ClientProvidersForClientRole>
  );
}
