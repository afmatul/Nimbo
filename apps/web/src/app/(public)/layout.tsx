import type { ReactNode } from 'react';

import { PublicHeader } from '../../components/nimbo/public-header';

/** Páginas públicas: misma cabecera, sin sesión. */
export default function PublicLayout({ children }: { readonly children: ReactNode }): ReactNode {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <PublicHeader />
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}
