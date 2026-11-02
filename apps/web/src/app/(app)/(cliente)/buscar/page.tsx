import { Suspense, type ReactNode } from 'react';

import { getEnv } from '../../../../env';
import { SessionSearchView } from '../../../../features/search/components/search-view';

/**
 * Búsqueda por nombre, tipo y fecha (018). Vive en `(cliente)`: los roles internos no llegan (CA-14). `Suspense`: la vista
 * lee la dirección con `useSearchParams`, que Next pide envolver para no renderizar la página entera en el cliente.
 */
export default function BuscarPage(): ReactNode {
  return (
    <Suspense fallback={null}>
      <SessionSearchView apiPublicUrl={getEnv().API_PUBLIC_URL} />
    </Suspense>
  );
}
