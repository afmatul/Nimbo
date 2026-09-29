import type { ReactNode } from 'react';

import { getEnv } from '../../../env';
import { VerifyEmailView } from '../../../features/identity/components/verify-email-view';

/**
 * El fragmento lo lee `VerifyEmailView` (Client Component). La página sigue en el servidor para pasar
 * `API_PUBLIC_URL` sin `NEXT_PUBLIC_*` (CA-29).
 */
export default function VerificarCorreoPage(): ReactNode {
  const env = getEnv();
  return <VerifyEmailView apiPublicUrl={env.API_PUBLIC_URL} />;
}
