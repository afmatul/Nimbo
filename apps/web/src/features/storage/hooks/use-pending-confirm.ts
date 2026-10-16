'use client';

import * as React from 'react';

/** Pasado este tiempo sin respuesta, el botón de confirmar dice que está trabajando (RNF-14). */
export const PENDING_LABEL_DELAY_MS = 2_000;

export interface PendingConfirm<F> {
  /** Envío en curso: los botones se deshabilitan y Escape no cierra. */
  readonly pending: boolean;
  /** El envío pasó de 2 s: «Eliminando…», «Restaurando…». */
  readonly slow: boolean;
  /** Motivo de la última falla; el diálogo sigue abierto para corregir o reintentar. */
  readonly failure: F | null;
  readonly confirm: () => Promise<void>;
  /** Cierra y olvida la falla: la próxima confirmación empieza limpia. */
  readonly close: () => void;
}

/**
 * Confirmación de un diálogo que llama a la API (006 «Eliminar definitivamente», 014 «Restaurar»): una sola petición a
 * la vez, aviso de lentitud pasados 2 s, cierre al terminar y, si falla, el motivo que describe `describeFailure`.
 */
export function usePendingConfirm<F>(
  onConfirm: () => Promise<void>,
  onClose: () => void,
  describeFailure: (error: unknown) => F,
): PendingConfirm<F> {
  const [pending, setPending] = React.useState(false);
  const [slow, setSlow] = React.useState(false);
  const [failure, setFailure] = React.useState<F | null>(null);
  const slowTimer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  React.useEffect(() => () => clearTimeout(slowTimer.current), []);

  const close = (): void => {
    setFailure(null);
    onClose();
  };

  const confirm = async (): Promise<void> => {
    if (pending) return;
    setPending(true);
    setFailure(null);
    slowTimer.current = setTimeout(() => setSlow(true), PENDING_LABEL_DELAY_MS);
    try {
      await onConfirm();
      close();
    } catch (error) {
      setFailure(describeFailure(error));
    } finally {
      clearTimeout(slowTimer.current);
      setPending(false);
      setSlow(false);
    }
  };

  return { pending, slow, failure, confirm, close };
}
