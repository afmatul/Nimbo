import type { ReactNode } from 'react';

import { getEnv } from '../../../env';
import { AccountSetupView } from '../../../features/identity/account-setup/components/account-setup-view';

/**
 * Crear tu contraseña (011 CA-5, CA-7): destino del enlace del alta interna y de `admin:bootstrap`. El fragmento lo lee
 * `AccountSetupView` (Client Component); la página sigue en el servidor para pasar `API_PUBLIC_URL` sin `NEXT_PUBLIC_*`.
 */
export default function CrearContrasenaPage(): ReactNode {
  const env = getEnv();
  return <AccountSetupView apiPublicUrl={env.API_PUBLIC_URL} />;
}
