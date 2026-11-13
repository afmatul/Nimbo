import type * as React from 'react';

/** Proporción del logo recortado (`docs/design/logos/nimbo-logo-recortado.svg`): 418 × 304. */
const LOGO_WIDTH = 418;
const LOGO_HEIGHT = 304;

/**
 * Isotipo oficial de Nimbo (la nube con la estrella), servido desde `public/brand/nimbo-logo.svg`: el mismo archivo de
 * `docs/design/logos/`, sin los metadatos de generación. Decorativo: el nombre accesible lo da quien lo usa.
 */
export function BrandMark({ className }: { readonly className?: string }): React.JSX.Element {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- un SVG estático no gana nada con el optimizador de imágenes
    <img
      src="/brand/nimbo-logo.svg"
      alt=""
      width={LOGO_WIDTH}
      height={LOGO_HEIGHT}
      aria-hidden="true"
      className={className}
    />
  );
}
