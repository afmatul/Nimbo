import type { ReactNode } from 'react';

import { getEnv } from '../../../../env';
import { SessionReceivedSharesView } from '../../../../features/sharing';

/**
 * «Compartidos conmigo» (012b CA-8 a CA-11): lo que otros clientes compartieron conmigo con acceso directo. Vive en
 * `(cliente)`: los roles internos no llegan (003 D-5).
 */
export default function CompartidosPage(): ReactNode {
  return <SessionReceivedSharesView apiPublicUrl={getEnv().API_PUBLIC_URL} />;
}
