import * as React from 'react';

import { cn } from '../../lib/utils';

export interface SwitchProps extends Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  'onChange' | 'role'
> {
  readonly checked: boolean;
  readonly onCheckedChange: (checked: boolean) => void;
}

/** El riel: tamaño, foco visible y deshabilitado; el color depende del estado. */
const TRACK_CLASS = cn(
  'inline-flex h-6 w-11 shrink-0 items-center rounded-full border-2 transition-colors',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
  'disabled:cursor-not-allowed disabled:opacity-60',
);
const TRACK_ON = 'border-primary bg-primary';
const TRACK_OFF = 'border-border bg-muted';
/** La perilla, que se desliza a la derecha cuando está activado. */
const THUMB_CLASS = 'block size-4 rounded-full bg-card shadow transition-transform';
const THUMB_ON = 'translate-x-5';
const THUMB_OFF = 'translate-x-0.5';

/**
 * Interruptor con `role="switch"` y `aria-checked` (WAI-ARIA), sin dependencia nueva: un botón con solo tokens. El
 * estado también va en texto junto al interruptor (quien lo usa pone la etiqueta y «Activada»/«Desactivada»).
 */
export function Switch({
  checked,
  onCheckedChange,
  className,
  disabled,
  ...props
}: SwitchProps): React.JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(TRACK_CLASS, checked ? TRACK_ON : TRACK_OFF, className)}
      {...props}
    >
      <span aria-hidden="true" className={cn(THUMB_CLASS, checked ? THUMB_ON : THUMB_OFF)} />
    </button>
  );
}
