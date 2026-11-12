'use client';

import { CheckCircle2 } from 'lucide-react';
import type * as React from 'react';

import { Alert } from '../../../components/ui/alert';

/** Aviso de éxito con ícono (generar, reemplazar, revocar; mockup `enlace-generado`, `enlace-revocado`). */
export function SuccessNotice({ children }: { readonly children: string }): React.JSX.Element {
  return (
    <Alert variant="success" className="flex items-start gap-3">
      <CheckCircle2
        aria-hidden="true"
        className="mt-0.5 h-5 w-5 shrink-0 text-success-foreground"
      />
      <p className="min-w-0 flex-1">{children}</p>
    </Alert>
  );
}
