import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { getEnv } from '../../../env';
import { PublicLinkVisit } from '../../../features/sharing';

/** Título genérico: nunca el nombre del archivo ni el token (013b CA-8); sin indexar (S-5). */
export const metadata: Metadata = {
  title: 'Archivo compartido · Nimbo',
  robots: { index: false },
};

/**
 * El token va en el fragmento (`/enlace#<token>`) y lo lee `PublicLinkVisit` en el navegador: nunca llega a `web`.
 * La página sigue en el servidor para pasar `API_PUBLIC_URL` sin `NEXT_PUBLIC_*` (CA-9).
 */
export default function EnlacePage(): ReactNode {
  return <PublicLinkVisit apiPublicUrl={getEnv().API_PUBLIC_URL} />;
}
