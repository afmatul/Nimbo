import type { AnchorHTMLAttributes, JSX } from 'react';

import { cn } from '../../lib/utils';

/** Enlace dentro de un texto: se distingue por subrayado, no solo por color (WCAG 1.4.1). */
export function TextLink({
  className,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement>): JSX.Element {
  return (
    <a
      className={cn(
        'rounded-sm font-medium text-primary underline underline-offset-4 hover:text-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        className,
      )}
      {...props}
    />
  );
}
