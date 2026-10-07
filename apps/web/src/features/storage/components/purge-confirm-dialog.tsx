'use client';

import { formatBytes, type TrashItem } from '@nimbo/contracts';
import { Loader2 } from 'lucide-react';
import * as React from 'react';

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
import { buttonVariants } from '../../../components/ui/button';
import { isStorageNotFound } from '../storage-request-error';

/** Un elemento de la papelera (síncrono) o la papelera completa (diferido, `202`). */
export type PurgeTarget =
  | { readonly scope: 'item'; readonly item: TrashItem }
  | { readonly scope: 'all'; readonly itemCount: number; readonly totalBytes: number };

/** Pasado este tiempo sin respuesta, el botón muestra «Eliminando…» (RNF-14, patrón de `descarga-preparando`). */
export const PURGING_DELAY_MS = 2_000;

export interface PurgeConfirmDialogProps {
  /** `null` = cerrado. */
  readonly target: PurgeTarget | null;
  /** Llama a la API; si rechaza, el diálogo sigue abierto con el motivo. */
  readonly onConfirm: () => Promise<void>;
  readonly onClose: () => void;
}

interface DialogTexts {
  readonly title: string;
  readonly description: string;
  readonly confirm: string;
}

function textsFor(target: PurgeTarget): DialogTexts {
  const irreversible = 'Esta acción no se puede deshacer.';
  if (target.scope === 'all') {
    const { itemCount, totalBytes } = target;
    const what =
      itemCount === 1
        ? 'Se eliminará definitivamente 1 elemento.'
        : `Se eliminarán definitivamente los ${String(itemCount)} elementos.`;
    return {
      title: '¿Vaciar la papelera?',
      description: `${what} ${irreversible} Liberarás ${formatBytes(totalBytes)} de espacio.`,
      confirm: 'Vaciar papelera',
    };
  }
  const { item } = target;
  const freed = `Liberarás ${formatBytes(item.sizeBytes)} de espacio.`;
  return item.type === 'folder'
    ? {
        title: `¿Eliminar definitivamente la carpeta «${item.name}»?`,
        description: `Se eliminará también todo su contenido. ${irreversible} ${freed}`,
        confirm: 'Eliminar definitivamente',
      }
    : {
        title: `¿Eliminar definitivamente «${item.name}»?`,
        description: `${irreversible} ${freed}`,
        confirm: 'Eliminar definitivamente',
      };
}

function failureMessage(target: PurgeTarget, error: unknown): string {
  if (target.scope === 'all') {
    return 'No pudimos vaciar la papelera. Revisa tu conexión e inténtalo de nuevo.';
  }
  const { name } = target.item;
  if (isStorageNotFound(error)) {
    return `No encontramos «${name}» en la papelera. Puede que ya se haya eliminado definitivamente.`;
  }
  return `No pudimos eliminar «${name}». Revisa tu conexión e inténtalo de nuevo.`;
}

/** Estado de la confirmación en curso: enviando, «Eliminando…» pasados 2 s, y el motivo si falló. */
function usePendingConfirm(
  target: PurgeTarget | null,
  onConfirm: () => Promise<void>,
  onClose: () => void,
): {
  pending: boolean;
  slow: boolean;
  failure: string | null;
  confirm: () => Promise<void>;
  close: () => void;
} {
  const [pending, setPending] = React.useState(false);
  const [slow, setSlow] = React.useState(false);
  const [failure, setFailure] = React.useState<string | null>(null);
  const slowTimer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  React.useEffect(() => () => clearTimeout(slowTimer.current), []);

  /** Al cerrar se olvida el motivo de la falla: la próxima confirmación empieza limpia. */
  const close = (): void => {
    setFailure(null);
    onClose();
  };

  const confirm = async (): Promise<void> => {
    if (target === null || pending) return;
    setPending(true);
    setFailure(null);
    slowTimer.current = setTimeout(() => setSlow(true), PURGING_DELAY_MS);
    try {
      await onConfirm();
      close();
    } catch (error) {
      setFailure(failureMessage(target, error));
    } finally {
      clearTimeout(slowTimer.current);
      setPending(false);
      setSlow(false);
    }
  };

  return { pending, slow, failure, confirm, close };
}

/**
 * Confirmación de «Eliminar definitivamente» o «Vaciar papelera» (CA-18): dice la consecuencia y el espacio que se
 * libera; el foco empieza en «Cancelar» (Radix). Sin confirmar no ocurre nada.
 */
export function PurgeConfirmDialog({
  target,
  onConfirm,
  onClose,
}: PurgeConfirmDialogProps): React.JSX.Element | null {
  const { pending, slow, failure, confirm, close } = usePendingConfirm(target, onConfirm, onClose);
  if (target === null) return null;
  const texts = textsFor(target);

  const handleConfirm = (event: React.MouseEvent<HTMLButtonElement>): void => {
    event.preventDefault();
    void confirm();
  };

  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) close();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="break-words">{texts.title}</AlertDialogTitle>
          <AlertDialogDescription>{texts.description}</AlertDialogDescription>
        </AlertDialogHeader>
        {failure ? <Alert variant="error">{failure}</Alert> : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            className={buttonVariants({ variant: 'destructive' })}
            disabled={pending}
            onClick={handleConfirm}
          >
            {slow ? (
              <Loader2
                className="h-4 w-4 animate-spin motion-reduce:animate-none"
                aria-hidden="true"
              />
            ) : null}
            {slow ? 'Eliminando…' : texts.confirm}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
