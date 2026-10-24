import type { LucideIcon } from 'lucide-react';
import type { JSX } from 'react';

import { cn } from '../../lib/utils';

/** Tonos con texto AA sobre su fondo al 5–10 % (ui-guidelines §2): el color acompaña, el texto informa. */
const TONE_CLASSES = {
  success: 'border-success/40 bg-success/10 text-success-foreground',
  destructive: 'border-destructive-soft/50 bg-destructive/5 text-destructive',
  /** Un estado que no es éxito ni falla (p. ej. «En papelera»): nunca en rojo. */
  neutral: 'border-border bg-card text-secondary-foreground',
} as const;

export type StatusTone = keyof typeof TONE_CLASSES;

export interface StatusBadgeProps {
  readonly tone: StatusTone;
  readonly icon: LucideIcon;
  readonly label: string;
}

/**
 * Estado con ícono y etiqueta, nunca solo color (ui-guidelines §4, Art. XIII.4): cuentas (011), y después sesiones,
 * suscripciones o trabajos. Es un `span` para ir dentro de un párrafo o una celda.
 */
export function StatusBadge({ tone, icon: Icon, label }: StatusBadgeProps): JSX.Element {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-sm border px-2 py-0.5 text-xs font-semibold',
        TONE_CLASSES[tone],
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {label}
    </span>
  );
}
