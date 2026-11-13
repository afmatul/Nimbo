import Link from 'next/link';
import type * as React from 'react';

import { BrandMark } from './brand-mark';

export interface BrandLogoProps {
  /** Adónde lleva el logo: el inicio del rol con sesión, o `/` sin ella. */
  readonly href?: string;
  /** Solo el isotipo, con el nombre para lectores de pantalla (barras de trabajo como el editor). */
  readonly compact?: boolean;
  /** Nombre accesible del isotipo compacto; por omisión, «Nimbo, ir al inicio». */
  readonly label?: string;
}

/**
 * Logo de Nimbo (el isotipo oficial de `docs/design/logos/` y el nombre): el mismo en todas las cabeceras del sistema, con o sin sesión.
 * Es un enlace al inicio con área táctil de 44 px.
 */
export function BrandLogo({
  href = '/',
  compact = false,
  label = 'Nimbo, ir al inicio',
}: BrandLogoProps): React.JSX.Element {
  return (
    <Link
      href={href}
      aria-label={compact ? label : undefined}
      className="flex min-h-11 shrink-0 items-center gap-2 rounded-md px-1 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <BrandMark className="h-8 w-auto" />
      {compact ? null : <span className="text-xl font-bold tracking-tight">Nimbo</span>}
    </Link>
  );
}
