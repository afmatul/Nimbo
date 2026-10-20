'use client';

import type { AccountListItem } from '@nimbo/contracts';
import { RotateCcw } from 'lucide-react';
import type * as React from 'react';

import { ConfirmDestructiveDialog } from '../../../components/nimbo/confirm-destructive-dialog';
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
import type { AccountStatusActions } from '../hooks/use-account-status';

import { isInternal } from './account-values';

const AUDIT_LINE = 'La acción queda en su auditoría; verá tu rol, no tu nombre.';

/** Consecuencias de suspender (decisión 7); comparticiones y enlaces solo en clientes (RN-6). */
function suspendDescription(account: AccountListItem): string {
  const sharing = isInternal(account)
    ? []
    : [
        'Sus comparticiones y enlaces públicos dejarán de funcionar mientras esté suspendida.',
        'Suspender no borra nada: al reactivarla, todo vuelve como estaba. Su papelera sigue su retención.',
      ];
  return [
    `${account.email} no podrá iniciar sesión hasta que la reactives.`,
    'Se cerrarán sus sesiones abiertas en todos sus dispositivos.',
    ...sharing,
    AUDIT_LINE,
  ].join(' ');
}

/** Consecuencias de reactivar (decisión 9): las sesiones cerradas no vuelven (CA-3). */
function reactivateLines(account: AccountListItem): readonly string[] {
  const sharing = isInternal(account)
    ? []
    : ['Sus comparticiones y enlaces públicos vuelven a funcionar como estaban.'];
  return [
    ...sharing,
    'Las sesiones que se cerraron al suspenderla no vuelven: tendrá que iniciar sesión de nuevo.',
    AUDIT_LINE,
  ];
}

interface DialogProps {
  readonly account: AccountListItem;
  readonly status: AccountStatusActions;
}

/** Confirmar sin estilo destructivo; durante el envío, ocupado y con «Reactivando…». */
function ReactivateButton({
  status,
}: {
  readonly status: AccountStatusActions;
}): React.JSX.Element {
  return (
    <AlertDialogAction asChild>
      <Button
        loading={status.pending}
        onClick={(event) => {
          event.preventDefault();
          status.confirm();
        }}
      >
        {status.pending ? null : <RotateCcw className="h-4 w-4" aria-hidden="true" />}
        {status.pending ? 'Reactivando…' : 'Reactivar cuenta'}
      </Button>
    </AlertDialogAction>
  );
}

/** «¿Reactivar…?» con el patrón de `ConfirmDestructiveDialog` (foco en «Cancelar», Escape cancela), sin estilo destructivo. */
function ReactivateDialog({ account, status }: DialogProps): React.JSX.Element {
  const onOpenChange = (open: boolean): void => {
    if (!open && !status.pending) status.cancel();
  };
  return (
    <AlertDialog open={status.asking === 'reactivate'} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="break-words">{`¿Reactivar la cuenta de ${account.fullName}?`}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <ul className="list-disc space-y-1.5 pl-5">
              {reactivateLines(account).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={status.pending}>Cancelar</AlertDialogCancel>
          <ReactivateButton status={status} />
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Confirmaciones de la ficha (011 CA-2, CA-3; mockups `confirmar-suspender` y `confirmar-reactivar`). */
export function AccountStatusDialogs({ account, status }: DialogProps): React.JSX.Element {
  return (
    <>
      <ConfirmDestructiveDialog
        open={status.asking === 'suspend'}
        onOpenChange={(open) => {
          if (!open && !status.pending) status.cancel();
        }}
        title={`¿Suspender la cuenta de ${account.fullName}?`}
        description={suspendDescription(account)}
        confirmLabel="Suspender cuenta"
        pendingLabel="Suspendiendo…"
        pending={status.pending}
        onConfirm={status.confirm}
      />
      <ReactivateDialog account={account} status={status} />
    </>
  );
}
