import { Cloud } from 'lucide-react';
import type { JSX } from 'react';

/** Cabecera de las páginas sin sesión. No muestra cuenta ni correo (D-9). */
export function PublicHeader(): JSX.Element {
  return (
    <header className="sticky top-0 z-40 flex h-16 w-full items-center justify-between border-b border-border bg-card px-4 md:px-6 shadow-sm">
      <a
        href="/"
        className="flex min-h-11 items-center gap-2 rounded-md px-1 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-button">
          <Cloud className="h-5 w-5" aria-hidden="true" />
        </span>
        <span className="text-xl font-bold tracking-tight">Nimbo</span>
      </a>
      <a
        href="/iniciar-sesion"
        className="inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        Iniciar sesión
      </a>
    </header>
  );
}
