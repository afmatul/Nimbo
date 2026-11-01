'use client';

import { X } from 'lucide-react';
import type * as React from 'react';

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

function ShareDialogBody({
  api,
  target,
}: {
  readonly api: SharingApi;
  readonly target: ShareTarget;
}): React.JSX.Element {
  const access = useAccessList(api, target);
  const returnFocus = useReturnFocus();
  return (
    <DialogContent className="max-h-dvh overflow-y-auto rounded-xl" {...returnFocus}>
      <DialogHeader className="pr-10">
        <DialogTitle className="break-words">{`Compartir «${target.name}»`}</DialogTitle>
        <DialogDescription>
          Escribe el correo de una persona con cuenta en Nimbo y elige qué puede hacer.
        </DialogDescription>
      </DialogHeader>
      <ShareForm node={target} share={access.share} />
      <AccessList access={access} nodeName={target.name} />
      <DialogClose asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Cerrar"
          className="absolute right-3 top-3"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </Button>
      </DialogClose>
    </DialogContent>
  );
}

/**
 * Diálogo «Compartir» (spec 012b CA-1 a CA-5; mockup `sharing/compartir`, sin la sección «Enlace público» hasta la 013,
 * S-2): formulario y «Personas con acceso». Se monta al abrir y se desmonta al cerrar: el correo escrito se descarta.
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
