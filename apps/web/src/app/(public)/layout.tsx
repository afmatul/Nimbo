import type { ReactNode } from 'react';

import { PublicHeader } from '../../components/nimbo/public-header';

/**
 * Casi todas las páginas públicas leen `getEnv()` (p. ej. `API_PUBLIC_URL`) en el servidor: se evalúan en cada petición
 * para no hornear la configuración en el build ni exigirla al construir la imagen (CA-29).
 */
export const dynamic = 'force-dynamic';

/** Páginas públicas: misma cabecera, sin sesión. */
export default function PublicLayout({ children }: { readonly children: ReactNode }): ReactNode {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <PublicHeader />
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}
