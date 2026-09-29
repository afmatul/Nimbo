import type { ReactNode } from 'react';

import { getEnv } from '../../../../env';
import { RequestLinkForm } from '../../../../features/identity/components/request-link-form';

/** El correo, si llega, lo pone el formulario desde `sessionStorage`. La página no lee la URL. */
export default function PedirEnlacePage(): ReactNode {
  const env = getEnv();
  return <RequestLinkForm apiPublicUrl={env.API_PUBLIC_URL} />;
}
