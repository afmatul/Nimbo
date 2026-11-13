import type { ReactNode } from 'react';

/** La configuración (`API_PUBLIC_URL`) se lee en cada petición, no en el build (CA-29). */
export const dynamic = 'force-dynamic';

/**
 * Iniciar sesión a pantalla completa (mockup p. 07): sin la cabecera pública; el panel de marca y la barra superior
 * («¿No tienes cuenta?») los pone la página.
 */
export default function AccessLayout({ children }: { readonly children: ReactNode }): ReactNode {
  return (
    <main className="flex min-h-screen flex-col bg-background text-foreground">{children}</main>
  );
}
