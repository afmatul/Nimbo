'use client';

import { X } from 'lucide-react';
import * as React from 'react';

import { Button } from '../../../components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../../../components/ui/dialog';
import { cn } from '../../../lib/utils';
import { useAccessList } from '../hooks/use-access-list';
import type { ShareNodeRef, SharingApi } from '../sharing-api';

import { AccessList } from './access-list';
import { PublicLinkSection, type CancelOpenPart } from './public-link-section';
import { ShareForm } from './share-form';
import { useReturnFocus } from './use-return-focus';

/** Lo que se comparte: el nodo y su nombre visible. */
export interface ShareTarget extends ShareNodeRef {
  readonly name: string;
}

export interface ShareDialogProps {
  readonly api: SharingApi;
  /** `null` = cerrado. */
  readonly target: ShareTarget | null;
  readonly onClose: () => void;
}

interface ShareDialogBodyProps {
  readonly api: SharingApi;
  readonly target: ShareTarget;
}

/**
 * Escape, la X y el clic fuera (013c CA-11, plan §1, M-2): con una acción del enlace en curso no cierran; sin ella,
 * Escape cancela primero lo abierto en la sección y, si no había nada (también con la URL a la vista, D-7), cierra.
 */
function useCloseGuard() {
  const [busy, setBusy] = React.useState(false);
  const cancelRef = React.useRef<CancelOpenPart | null>(null);
  const onEscapeKeyDown = (event: KeyboardEvent): void => {
    if (busy) {
      event.preventDefault();
      return;
    }
    const cancelled = cancelRef.current?.() ?? false;
    if (cancelled) event.preventDefault();
  };
  const onInteractOutside = (event: Event): void => {
    if (busy) event.preventDefault();
  };
  return { busy, setBusy, cancelRef, onEscapeKeyDown, onInteractOutside };
}

function DialogHeading({ name }: { readonly name: string }): React.JSX.Element {
  return (
    <DialogHeader className="pr-10">
      <DialogTitle className="break-words">{`Compartir «${name}»`}</DialogTitle>
      <DialogDescription>
        Comparte con una persona por correo o crea un enlace público.
      </DialogDescription>
    </DialogHeader>
  );
}

function CloseButton({ disabled }: { readonly disabled: boolean }): React.JSX.Element {
  return (
    <DialogClose asChild>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Cerrar"
        className="absolute right-3 top-3"
        disabled={disabled}
      >
        <X className="h-5 w-5" aria-hidden="true" />
      </Button>
    </DialogClose>
  );
}

type ShareMode = 'email' | 'link';

const MODES: readonly { readonly value: ShareMode; readonly label: string }[] = [
  { value: 'email', label: 'Por correo' },
  { value: 'link', label: 'Por enlace' },
];

/** Interruptor entre compartir con una persona (correo) o con un enlace público; deshabilitado con una acción del enlace en curso. */
function ModeSwitch({
  mode,
  onChange,
  disabled,
}: {
  readonly mode: ShareMode;
  readonly onChange: (next: ShareMode) => void;
  readonly disabled: boolean;
}): React.JSX.Element {
  return (
    <div
      role="group"
      aria-label="Forma de compartir"
      className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1"
    >
      {MODES.map(({ value, label }) => (
        <button
          key={value}
          type="button"
          aria-pressed={mode === value}
          disabled={disabled}
          onClick={() => onChange(value)}
          className={cn(
            'min-h-11 rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60',
            mode === value
              ? 'bg-card font-semibold text-primary shadow-sm'
              : 'text-secondary-foreground hover:text-foreground',
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/** El foco inicial va al correo (el modo por defecto), no al interruptor. */
function focusEmailField(event: Event): void {
  event.preventDefault();
  document.getElementById('compartir-correo')?.focus();
}

function ShareDialogBody({ api, target }: ShareDialogBodyProps): React.JSX.Element {
  const access = useAccessList(api, target);
  const returnFocus = useReturnFocus();
  const guard = useCloseGuard();
  const [mode, setMode] = React.useState<ShareMode>('email');
  const isFile = target.nodeType === 'file';
  return (
    <DialogContent
      // Columna `minmax(0,1fr)`: un nombre sin espacios no ensancha la cuadrícula a 360 px (013c CA-15, T-08; PD-209).
      className="max-h-dvh grid-cols-[minmax(0,1fr)] overflow-y-auto rounded-xl"
      {...returnFocus}
      onOpenAutoFocus={(event) => {
        returnFocus.onOpenAutoFocus(event);
        focusEmailField(event);
      }}
      onEscapeKeyDown={guard.onEscapeKeyDown}
      onInteractOutside={guard.onInteractOutside}
    >
      <DialogHeading name={target.name} />
      {isFile ? <ModeSwitch mode={mode} onChange={setMode} disabled={guard.busy} /> : null}
      <div hidden={mode !== 'email'} className="grid gap-4">
        <ShareForm node={target} share={access.share} />
        <AccessList access={access} nodeName={target.name} />
      </div>
      {isFile ? (
        <div hidden={mode !== 'link'}>
          <PublicLinkSection
            api={api}
            fileId={target.nodeId}
            onBusyChange={guard.setBusy}
            cancelRef={guard.cancelRef}
          />
        </div>
      ) : null}
      <CloseButton disabled={guard.busy} />
    </DialogContent>
  );
}

/**
 * Diálogo «Compartir» (spec 012b CA-1 a CA-5; 013c CA-2, CA-11; mockup `sharing/compartir`): formulario, «Personas
 * con acceso» y, solo para archivos, «Enlace público». Se monta al abrir y se desmonta al cerrar: el correo escrito y
 * la URL generada se descartan (013c RN-1). El `key` por nodo hace lo mismo si cambia el destino con el diálogo
 * montado (013c SEC-2).
 * Radix pone el foco en el correo (el primer campo) y lo atrapa; al cerrar vuelve a quien lo abrió (el ⋮ de la fila o
 * «Compartir» de la ficha), que no es un `DialogTrigger`.
 */
export function ShareDialog({ api, target, onClose }: ShareDialogProps): React.JSX.Element {
  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      {target === null ? null : <ShareDialogBody key={target.nodeId} api={api} target={target} />}
    </Dialog>
  );
}
