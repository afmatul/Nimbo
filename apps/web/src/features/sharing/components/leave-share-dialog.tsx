'use client';

import type { ReceivedShare } from '@nimbo/contracts';
import type * as React from 'react';

import { Alert } from '../../../components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../../components/ui/alert-dialog';
import { Button } from '../../../components/ui/button';
import { usePendingConfirm, type PendingConfirm } from '../../storage/hooks/use-pending-confirm';
import { shareMessageOf } from '../share-messages';

import { useReturnFocus } from './use-return-focus';

export interface LeaveShareDialogProps {
  /** `null` = cerrado. */
  readonly target: ReceivedShare | null;
  /** Sale; si rechaza, el diálogo sigue abierto con el motivo. */
  readonly onConfirm: () => Promise<void>;
  readonly onClose: () => void;
}

/** Sin conexión, el texto del mockup `error-salir-sin-conexion`; lo demás (p. ej. `429`), el del catálogo. */
function leaveFailureOf(name: string, error: unknown): string {
  const message = shareMessageOf(error);
  if (message.fix !== 'retry') return message.title;
  return `No pudimos salir de «${name}». Revisa tu conexión e inténtalo de nuevo; seguirás viéndolo hasta entonces.`;
}

function LeaveButton({ pending }: { readonly pending: PendingConfirm<string> }): React.JSX.Element {
  return (
    <AlertDialogAction asChild>
      <Button
        loading={pending.pending}
        onClick={(event) => {
          event.preventDefault();
          void pending.confirm();
        }}
      >
        {pending.pending ? 'Saliendo…' : pending.failure ? 'Reintentar' : 'Salir'}
      </Button>
    </AlertDialogAction>
  );
}

/**
 * Confirmación de «Salir» (spec 012b CA-10, CA-11; mockups `confirmar-salir`, `saliendo`, `error-salir-sin-conexion`):
 * no es destructiva (no borra nada del propietario), foco inicial en «Cancelar», y mientras sale lo anuncia y no se
 * cierra.
 */
export function LeaveShareDialog({
  target,
  onConfirm,
  onClose,
}: LeaveShareDialogProps): React.JSX.Element | null {
  const name = target?.name ?? '';
  const pending = usePendingConfirm(onConfirm, onClose, (error) => leaveFailureOf(name, error));
  const returnFocus = useReturnFocus();
  if (target === null) return null;
  return (
    <AlertDialog open onOpenChange={(open) => !open && !pending.pending && pending.close()}>
      <AlertDialogContent {...returnFocus}>
        <AlertDialogHeader>
          <AlertDialogTitle className="break-words">{`¿Salir de «${name}»?`}</AlertDialogTitle>
          <AlertDialogDescription>
            Dejarás de verlo. Quien lo compartió puede volver a compartírtelo.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {pending.pending ? (
          <p role="status" className="break-words text-sm text-secondary-foreground">
            {`Saliendo de «${name}»…`}
          </p>
        ) : null}
        {pending.failure ? <Alert variant="error">{pending.failure}</Alert> : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending.pending}>Cancelar</AlertDialogCancel>
          <LeaveButton pending={pending} />
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
