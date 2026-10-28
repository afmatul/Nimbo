import type { LucideIcon } from 'lucide-react';
import type { JSX } from 'react';

import { cn } from '../../../lib/utils';

export interface InfoNoteProps {
  readonly icon: LucideIcon;
  readonly title: string;
  readonly text: string;
  readonly className?: string;
}

/**
 * Recuadro informativo con ícono, título y texto (mockups `backoffice/admin`, `.info-box`): la propia cuenta, una cuenta
 * sin suscripción y la solo lectura al extender la vigencia.
 */
export function InfoNote({ icon: Icon, title, text, className }: InfoNoteProps): JSX.Element {
  return (
    <div
      className={cn(
        'flex items-start gap-2.5 rounded-md border border-border bg-muted px-3.5 py-3 text-sm text-secondary-foreground',
        className,
      )}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <p>
        <strong className="block font-semibold text-foreground">{title}</strong>
        {text}
      </p>
    </div>
  );
}
