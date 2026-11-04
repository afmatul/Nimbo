import { Cloud } from 'lucide-react';
import type * as React from 'react';

export interface BrandLogoProps {
  /** Adónde lleva el logo: el inicio del rol con sesión, o `/` sin ella. */
  readonly href?: string;
  /** Solo el isotipo, con el nombre para lectores de pantalla (barras de trabajo como el editor). */
  readonly compact?: boolean;
  /** Nombre accesible del isotipo compacto; por omisión, «Nimbo, ir al inicio». */
  readonly label?: string;
}

/**
 * Logo de Nimbo (isotipo de `app/icon.svg` y el nombre): el mismo en todas las cabeceras del sistema, con o sin sesión.
 * Es un enlace al inicio con área táctil de 44 px.
 */
export function BrandLogo({
  href = '/',
  compact = false,
  label = 'Nimbo, ir al inicio',
}: BrandLogoProps): React.JSX.Element {
  return (
    <a
      href={href}
      aria-label={compact ? label : undefined}
      className="flex min-h-11 shrink-0 items-center gap-2 rounded-md px-1 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-button">
        <Cloud className="h-5 w-5" aria-hidden="true" />
      </span>
      {compact ? null : <span className="text-xl font-bold tracking-tight">Nimbo</span>}
    </a>
  );
}
