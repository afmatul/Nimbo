import { AlertCircle } from 'lucide-react';
import type { JSX } from 'react';

import { cn } from '../../lib/utils';

export interface FieldMessageProps {
  /** El campo lo enlaza con `aria-describedby={id}`. */
  readonly id: string;
  readonly children: string;
  /** Se anuncia al aparecer (`role="alert"`): para errores que llegan sin que el foco cambie. */
  readonly alert?: boolean;
  /** Solo para el espacio respecto del campo cuando el contenedor no lo da. */
  readonly className?: string;
}

/** Error bajo un campo, con ícono y texto (Art. XIII.4; `ui-guidelines.md`): no depende solo del color. */
export function FieldMessage({
  id,
  children,
  alert = false,
  className,
}: FieldMessageProps): JSX.Element {
  return (
    <p
      id={id}
      role={alert ? 'alert' : undefined}
      className={cn('flex items-start gap-1.5 text-sm font-medium text-destructive', className)}
    >
      <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}
