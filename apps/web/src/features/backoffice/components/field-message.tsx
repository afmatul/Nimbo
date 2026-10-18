import { AlertCircle } from 'lucide-react';
import type { JSX } from 'react';

/** Error bajo un campo, con ícono y texto (Art. XIII.4); el campo lo enlaza con `aria-describedby={id}`. */
export function FieldMessage({
  id,
  message,
}: {
  readonly id: string;
  readonly message: string;
}): JSX.Element {
  return (
    <p id={id} className="mt-1.5 flex items-start gap-1.5 text-sm font-medium text-destructive">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      {message}
    </p>
  );
}
