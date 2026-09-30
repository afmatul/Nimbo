'use client';

import * as React from 'react';

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

export interface CancelUploadDialogProps {
  readonly open: boolean;
  readonly uploadedLabel: string;
  readonly totalLabel: string;
  readonly fileName: string;
  readonly onConfirm: () => void;
  readonly onDismiss: () => void;
}

/**
 * Confirma la cancelación de una carga que ya pasó del 0 % (CA-22). Solo emite la respuesta: mientras está abierto, la
 * carga sigue en pausa en el `UploadManager` (`awaitingCancel`). Escape equivale a «Seguir subiendo».
 */
export function CancelUploadDialog({
  open,
  uploadedLabel,
  totalLabel,
  fileName,
  onConfirm,
  onDismiss,
}: CancelUploadDialogProps): React.JSX.Element {
  return (
    <AlertDialog open={open}>
      <AlertDialogContent onEscapeKeyDown={onDismiss}>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Cancelar esta carga?</AlertDialogTitle>
          <AlertDialogDescription>
            Ya subiste {uploadedLabel} de {totalLabel} de «{fileName}». La pausamos mientras
            decides.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <p className="rounded-md bg-muted px-3 py-2.5 text-sm text-secondary-foreground">
          Si la cancelas, se perderá lo que ya subiste y liberaremos el espacio reservado. Para
          subir el archivo tendrás que empezar de cero.
        </p>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onDismiss}>Seguir subiendo</AlertDialogCancel>
          <AlertDialogAction
            className={buttonVariants({ variant: 'destructive' })}
            onClick={onConfirm}
          >
            Cancelar carga
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
