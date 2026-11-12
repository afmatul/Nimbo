'use client';

import type { CreatedPublicLink } from '@nimbo/contracts';
import { Check, Copy } from 'lucide-react';
import * as React from 'react';

import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { expiresAtLabel } from '../../../lib/format-date';
import type { ShareMessage } from '../share-messages';

import { ShareErrorAlert } from './share-error-alert';

export interface GeneratedLinkFieldProps {
  /** URL y resumen recién generados (`usePublicLink().generated`): solo en memoria (RN-1). */
  readonly generated: CreatedPublicLink;
  /** Copia al portapapeles; por omisión, el del navegador. Se inyecta para probar el fallo (CA-6). */
  readonly copy?: (text: string) => Promise<void>;
}

const COPIED_LABEL = 'Enlace copiado';
const COPY_FAILED: ShareMessage = {
  title: 'No pudimos copiar el enlace. Selecciónalo y cópialo a mano.',
  fix: 'none',
};

/** Sin contexto seguro `navigator.clipboard` no existe: el fallo llega como rechazo (R-2). */
async function copyWithBrowser(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}

type CopyState = 'idle' | 'copied' | 'failed';

/** «Enlace copiado» dura hasta la siguiente interacción, sin temporizador (D-9). */
function useResetOnNextInteraction(active: boolean, reset: () => void): void {
  React.useEffect(() => {
    if (!active) return undefined;
    const events = ['pointerdown', 'keydown'] as const;
    for (const type of events)
      document.addEventListener(type, reset, { capture: true, once: true });
    return () => {
      for (const type of events) document.removeEventListener(type, reset, { capture: true });
    };
  }, [active, reset]);
}

/** Copiar la URL; si falla, el texto del campo queda seleccionado para copiarlo a mano (CA-6, R-7). */
function useCopyLink(
  url: string,
  copy: (text: string) => Promise<void>,
  inputRef: React.RefObject<HTMLInputElement | null>,
) {
  const [state, setState] = React.useState<CopyState>('idle');
  const reset = React.useCallback(() => setState('idle'), []);
  useResetOnNextInteraction(state === 'copied', reset);
  const onCopy = async (): Promise<void> => {
    setState('idle');
    try {
      await copy(url);
      setState('copied');
    } catch {
      setState('failed');
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  };
  return { state, onCopy };
}

/** «Vence el … · Con contraseña»: describe el campo de la URL (CA-3). */
function LinkMeta({
  id,
  generated,
}: {
  readonly id: string;
  readonly generated: CreatedPublicLink;
}) {
  return (
    <p
      id={id}
      className="flex flex-col text-sm tabular-nums text-secondary-foreground sm:flex-row sm:gap-1.5"
    >
      <span>{`Vence el ${expiresAtLabel(generated.link.expiresAt)}`}</span>
      <span aria-hidden="true" className="hidden sm:inline">
        ·
      </span>
      <span>{generated.link.hasPassword ? 'Con contraseña' : 'Sin contraseña'}</span>
    </p>
  );
}

/** «Copiar enlace» toma el foco al aparecer, porque el botón de generar ya no está (CA-15). */
function CopyButton({ copied, onCopy }: { readonly copied: boolean; readonly onCopy: () => void }) {
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  React.useEffect(() => buttonRef.current?.focus(), []);
  const Icon = copied ? Check : Copy;
  return (
    <Button ref={buttonRef} type="button" className="w-full shrink-0 sm:w-auto" onClick={onCopy}>
      <Icon aria-hidden="true" className="h-4 w-4" />
      {copied ? COPIED_LABEL : 'Copiar enlace'}
    </Button>
  );
}

interface UrlInputProps {
  readonly inputRef: React.RefObject<HTMLInputElement | null>;
  readonly id: string;
  readonly url: string;
}

/** Una línea y solo lectura: a 360 px la URL se recorta dentro del campo, sin desplazar la página (CA-15, R-6). */
function UrlInput({ inputRef, id, url }: UrlInputProps): React.JSX.Element {
  return (
    <Input
      ref={inputRef}
      id={id}
      type="text"
      readOnly
      value={url}
      aria-describedby={`${id}-meta`}
      className="min-w-0 flex-1 text-ellipsis bg-muted"
    />
  );
}

/**
 * La URL generada en un campo de una línea y solo lectura (spec 013c CA-3, CA-6): «Copiar enlace», «Enlace copiado»
 * anunciado una vez y, si el navegador no deja copiar, el aviso de error con el texto seleccionado.
 */
export function GeneratedLinkField({
  generated,
  copy = copyWithBrowser,
}: GeneratedLinkFieldProps): React.JSX.Element {
  const id = React.useId();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const { state, onCopy } = useCopyLink(generated.url, copy, inputRef);
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor={id}>Enlace generado</Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <UrlInput inputRef={inputRef} id={id} url={generated.url} />
          <CopyButton copied={state === 'copied'} onCopy={() => void onCopy()} />
        </div>
        <LinkMeta id={`${id}-meta`} generated={generated} />
      </div>
      {state === 'failed' ? <ShareErrorAlert message={COPY_FAILED} /> : null}
      <p role="status" className="sr-only">
        {state === 'copied' ? COPIED_LABEL : ''}
      </p>
    </div>
  );
}
