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
    if (busy || cancelRef.current?.()) event.preventDefault();
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
        Escribe el correo de una persona con cuenta en Nimbo y elige qué puede hacer.
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

function ShareDialogBody({ api, target }: ShareDialogBodyProps): React.JSX.Element {
  const access = useAccessList(api, target);
  const returnFocus = useReturnFocus();
  const guard = useCloseGuard();
  return (
    <DialogContent
      className="max-h-dvh overflow-y-auto rounded-xl"
      {...returnFocus}
      onEscapeKeyDown={guard.onEscapeKeyDown}
      onInteractOutside={guard.onInteractOutside}
    >
      <DialogHeading name={target.name} />
      <ShareForm node={target} share={access.share} />
      <AccessList access={access} nodeName={target.name} />
      {target.nodeType === 'file' ? (
        <PublicLinkSection
          api={api}
          fileId={target.nodeId}
          onBusyChange={guard.setBusy}
          cancelRef={guard.cancelRef}
        />
      ) : null}
      <CloseButton disabled={guard.busy} />
    </DialogContent>
  );
}

/**
 * Diálogo «Compartir» (spec 012b CA-1 a CA-5; 013c CA-2, CA-11; mockup `sharing/compartir`): formulario, «Personas
 * con acceso» y, solo para archivos, «Enlace público». Se monta al abrir y se desmonta al cerrar: el correo escrito y
 * la URL generada se descartan (013c RN-1).
 * Radix pone el foco en el correo (el primer campo) y lo atrapa; al cerrar vuelve a quien lo abrió (el ⋮ de la fila o
 * «Compartir» de la ficha), que no es un `DialogTrigger`.
 */
export function ShareDialog({ api, target, onClose }: ShareDialogProps): React.JSX.Element {
  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      {target === null ? null : <ShareDialogBody api={api} target={target} />}
    </Dialog>
  );
}
