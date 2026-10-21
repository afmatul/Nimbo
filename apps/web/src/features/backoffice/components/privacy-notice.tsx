import { Lock } from 'lucide-react';
import type { JSX } from 'react';

/** Aviso fijo bajo el título (mockups `backoffice/soporte` y `backoffice/admin`, P-5): ícono y texto, no una alerta. */
export function PrivacyNotice({ text }: { readonly text: string }): JSX.Element {
  return (
    <div className="mt-5 flex items-start gap-2.5 rounded-lg border border-brand/40 bg-brand/10 px-4 py-3 text-sm text-foreground">
      <Lock className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
      <p>{text}</p>
    </div>
  );
}
