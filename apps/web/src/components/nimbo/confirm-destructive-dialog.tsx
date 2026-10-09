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
} from '../ui/alert-dialog';
import { Button, buttonVariants } from '../ui/button';

/** `AlertDialogAction` trae la variante primaria y su `Slot` la fusiona con el hijo: aquí se sustituye. */
const DESTRUCTIVE = buttonVariants({ variant: 'destructive' });

export interface ConfirmDestructiveDialogProps {
  readonly open: boolean;
  /** Recibe `false` al cancelar (botón o Escape). Mientras `pending`, no se emite. */
  readonly onOpenChange: (open: boolean) => void;
  readonly title: string;
  /** La consecuencia explícita de confirmar. */
  readonly description: string;
  readonly confirmLabel: string;
  /** No cierra el diálogo: quien lo usa decide cuándo cerrarlo (p. ej. al terminar la petición). */
  readonly onConfirm: () => void;
  /** Envío en curso: ambos botones deshabilitados y el de confirmar con indicador de carga. */
  readonly pending?: boolean;
  /** Texto del botón de confirmar durante el envío; por omisión, `confirmLabel`. */
  readonly pendingLabel?: string;
}

/**
 * Confirmación de una acción destructiva (CA-14, CA-27) sobre el `AlertDialog` de Radix: `role="alertdialog"`, foco
 * inicial en «Cancelar», Escape cancela y el velo es el del `AlertDialog` (PD-27). A 360 px los botones se apilan con
 * el destructivo arriba (`AlertDialogFooter`).
 */
export function ConfirmDestructiveDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
  pending = false,
  pendingLabel,
}: ConfirmDestructiveDialogProps): React.JSX.Element {
  const handleOpenChange = (next: boolean): void => {
    if (!pending) onOpenChange(next);
  };

  const handleConfirm = (event: React.MouseEvent<HTMLButtonElement>): void => {
    event.preventDefault();
    onConfirm();
  };

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="break-words">{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
          <AlertDialogAction asChild className={DESTRUCTIVE}>
            <Button variant="destructive" loading={pending} onClick={handleConfirm}>
              {pending ? (pendingLabel ?? confirmLabel) : confirmLabel}
            </Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
