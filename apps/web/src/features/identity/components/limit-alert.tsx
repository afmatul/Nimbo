import { Clock } from 'lucide-react';
import type { JSX } from 'react';

import { Alert } from '../../../components/ui/alert';

/** Aviso de límite de envíos (estado limite-reenvio), en tono de advertencia como el mockup. */
export function LimitAlert({ message }: { readonly message: string }): JSX.Element {
  return (
    <Alert variant="warning" className="flex items-start gap-2 text-left">
      <Clock aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{message}</span>
    </Alert>
  );
}
