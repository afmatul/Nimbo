import type { ReactNode } from 'react';

import { getEnv } from '../../../env';
import { ResetPasswordView } from '../../../features/identity/components/reset-password-view';

/**
 * Restablecer contraseña (spec 002 §11, CA-19 a CA-21). El fragmento lo lee `ResetPasswordView` (Client Component);
 * la página sigue en el servidor para pasar `API_PUBLIC_URL` sin `NEXT_PUBLIC_*` (001 CA-29).
 */
export default function RestablecerContrasenaPage(): ReactNode {
  const env = getEnv();
  return <ResetPasswordView apiPublicUrl={env.API_PUBLIC_URL} />;
}
