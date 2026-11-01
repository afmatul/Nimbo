'use client';

import { Loader2 } from 'lucide-react';
import type * as React from 'react';

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
import { buttonVariants } from '../../../components/ui/button';
import { usePendingConfirm, type PendingConfirm } from '../../storage/hooks/use-pending-confirm';
import { shareMessageOf, type ShareMessage } from '../share-messages';

import type { DirectAccess } from './access-row';
import { ShareErrorAlert } from './share-error-alert';

export interface RevokeAccessDialogProps {
  /** `null` = cerrado. */
  readonly target: DirectAccess | null;
  readonly nodeName: string;
  /** Llama a la API; si rechaza, el diálogo sigue abierto con el motivo. */
  readonly onConfirm: () => Promise<void>;
  readonly onClose: () => void;
  /** «Actualizar lista» ante un acceso que ya no existe (CA-11 de la 012). */
  readonly onRefresh: () => void;
}

function ConfirmRevokeButton({
  pending,
}: {
  readonly pending: PendingConfirm<ShareMessage>;
}): React.JSX.Element {
  return (
    <AlertDialogAction
      className={buttonVariants({ variant: 'destructive' })}
      disabled={pending.pending}
      onClick={(event) => {
        event.preventDefault();
        void pending.confirm();
      }}
    >
      {pending.slow ? (
        <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
      ) : null}
      {pending.slow ? 'Quitando…' : 'Quitar acceso'}
    </AlertDialogAction>
  );
}

/**
 * Confirmación de «Quitar acceso» (spec 012b CA-5): consecuencia explícita, foco inicial en «Cancelar», «Quitando…»
 * pasados 2 s y el error por `code` dentro del diálogo.
 */
export function RevokeAccessDialog(props: RevokeAccessDialogProps): React.JSX.Element | null {
  const { target, nodeName } = props;
  const pending = usePendingConfirm<ShareMessage>(props.onConfirm, props.onClose, shareMessageOf);
  if (target === null) return null;
  const name = target.grantee.displayName;
  const refresh = (): void => {
    pending.close();
    props.onRefresh();
  };
  return (
    <AlertDialog open onOpenChange={(open) => !open && !pending.pending && pending.close()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="break-words">{`¿Quitar el acceso de ${name}?`}</AlertDialogTitle>
          <AlertDialogDescription className="break-words">
            {`${name} dejará de ver «${nodeName}». Puedes volver a compartírselo cuando quieras.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {pending.failure ? (
          <ShareErrorAlert message={pending.failure} handlers={{ refresh }} />
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending.pending}>Cancelar</AlertDialogCancel>
          <ConfirmRevokeButton pending={pending} />
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
