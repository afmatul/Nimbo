import type { ReactNode } from 'react';

import { getEnv } from '../../../env';
import { SessionUploadsProvider } from '../../../features/storage/components/uploads-provider';

/**
 * Páginas del cliente. El proveedor de cargas vive aquí para que navegar dentro de la pestaña conserve las cargas y el
 * panel; recargar la página las pierde (RN-7, plan 005 §6 Frontend).
 */
export default function ClienteLayout({ children }: { readonly children: ReactNode }): ReactNode {
  return (
    <SessionUploadsProvider apiPublicUrl={getEnv().API_PUBLIC_URL}>
      {children}
    </SessionUploadsProvider>
  );
}
