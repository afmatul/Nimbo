'use client';

import { CircleCheck } from 'lucide-react';
import * as React from 'react';
import { Toaster as Sonner, toast, type ToasterProps } from 'sonner';

/** Un aviso dura al menos 8 s (spec 006 §6, ADR-0024). */
export const NOTICE_DURATION_MS = 8_000;

const PAUSED = Number.POSITIVE_INFINITY;

/**
 * Pausa o reanuda los avisos visibles. `sonner` solo pausa con el puntero; con foco se cambia su duración (ADR-0024:
 * «si la pausa por foco no la da la librería, se resuelve en el wrapper»). Al reanudar vuelve a contar los 8 s.
 */
function setVisibleDurations(duration: number): void {
  for (const shown of toast.getToasts()) {
    if ('title' in shown) toast(shown.title, { id: shown.id, duration });
  }
}

export interface NoticeOptions {
  /** Acción del aviso; un enlace (`<Link>`) si navega, para no perder las cargas de la pestaña. */
  readonly action?: React.ReactNode;
}

/** Confirma una acción con éxito (p. ej. «Movimos «{nombre}» a la papelera.»). */
export function showNotice(message: string, { action }: NoticeOptions = {}): void {
  toast(message, {
    icon: <CircleCheck className="h-4 w-4 text-success-foreground" aria-hidden="true" />,
    action,
  });
}

/** Colores solo por tokens (ADR-0024): sin `richColors` ni los de la librería. */
const TOKEN_STYLE = {
  '--normal-bg': 'var(--card)',
  '--normal-text': 'var(--foreground)',
  '--normal-border': 'var(--border)',
  '--border-radius': 'var(--radius-md)',
} as React.CSSProperties;

/**
 * Región de avisos no bloqueantes (`role="status"`, `aria-live="polite"`), abajo a la derecha y a todo el ancho en
 * móvil. Solo confirma acciones con éxito; los errores siguen como `Alert` (ADR-0024).
 */
export function Toaster(props: ToasterProps): React.JSX.Element {
  const regionRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    regionRef.current?.querySelector('section[aria-live]')?.setAttribute('role', 'status');
  }, []);

  const handleBlur = (event: React.FocusEvent<HTMLDivElement>): void => {
    if (event.currentTarget.contains(event.relatedTarget)) return;
    setVisibleDurations(NOTICE_DURATION_MS);
  };

  return (
    <div ref={regionRef} onFocus={() => setVisibleDurations(PAUSED)} onBlur={handleBlur}>
      <Sonner
        theme="light"
        position="bottom-right"
        duration={NOTICE_DURATION_MS}
        closeButton
        customAriaLabel="Avisos"
        style={TOKEN_STYLE}
        toastOptions={{
          closeButtonAriaLabel: 'Cerrar aviso',
          classNames: {
            toast: 'font-sans text-sm shadow-modal',
            description: 'text-secondary-foreground',
            closeButton: 'bg-card! text-secondary-foreground! border-border!',
          },
        }}
        {...props}
      />
    </div>
  );
}
