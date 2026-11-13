import { ChevronDown } from 'lucide-react';
import * as React from 'react';

import { cn } from '../../lib/utils';

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  readonly error?: boolean;
  /** Clases del contenedor (ancho y márgenes); el `<select>` ocupa todo su ancho. */
  readonly className?: string;
}

/**
 * Lista desplegable de Cielo Sereno: `<select>` nativo (teclado, lectores de pantalla y selector del móvil sin costo)
 * con la apariencia de `Input` (borde, fondo, foco, estado de error) y un chevron propio en lugar del del navegador.
 * Las opciones heredan `bg-card` y `text-foreground` para que el despliegue siga el tema claro u oscuro.
 */
export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, error = false, disabled, children, ...props }, ref) => (
    <span className={cn('relative inline-flex min-w-0', className)}>
      <select
        ref={ref}
        disabled={disabled}
        aria-invalid={error ? 'true' : undefined}
        className={cn(
          'h-11 w-full min-w-0 cursor-pointer appearance-none rounded-md border border-input bg-card py-2 pl-3 pr-9 text-sm text-foreground shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-45',
          error && 'border-destructive focus-visible:ring-destructive',
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
      />
    </span>
  ),
);
Select.displayName = 'Select';
