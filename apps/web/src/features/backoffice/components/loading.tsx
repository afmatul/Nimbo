import { Loader2 } from 'lucide-react';
import type { JSX } from 'react';

import { cn } from '../../../lib/utils';

/** Una línea del esqueleto: el ancho lo decide quien la usa (mockups `cargando`). */
export function SkeletonLine({ className }: { readonly className?: string }): JSX.Element {
  return (
    <span
      className={cn(
        'block h-3 animate-pulse rounded-full bg-muted motion-reduce:animate-none',
        className,
      )}
    />
  );
}

/**
 * El estado que se anuncia mientras llegan los datos (mockups `cargando`): el texto va en un `role="status"` y el
 * movimiento se detiene con movimiento reducido.
 */
export function LoadingStatus({ text }: { readonly text: string }): JSX.Element {
  return (
    <p role="status" className="mt-3 flex items-center gap-2 text-sm text-secondary-foreground">
      <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
      {text}
    </p>
  );
}
