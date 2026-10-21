'use client';

import { EDITING_EVENTS, editingSaveFailedSchema, type EditingSaveFailed } from '@nimbo/contracts';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import { useRealtime } from '../../realtime/use-realtime';
import { editorPath } from '../routes';

import { SaveFailedAlert } from './save-failed-alert';

/** Sesiones fallidas avisadas por el canal (una por sesión); un aviso fuera del contrato se ignora (RN-9). */
function useSaveFailures(): {
  readonly failures: readonly EditingSaveFailed[];
  readonly dismiss: (sessionId: string) => void;
} {
  const { on } = useRealtime();
  const [failures, setFailures] = React.useState<readonly EditingSaveFailed[]>([]);
  React.useEffect(
    () =>
      on(EDITING_EVENTS.SAVE_FAILED, (payload) => {
        const parsed = editingSaveFailedSchema.safeParse(payload);
        if (!parsed.success) return;
        const failure = parsed.data;
        setFailures((previous) =>
          previous.some((item) => item.sessionId === failure.sessionId)
            ? previous
            : [...previous, failure],
        );
      }),
    [on],
  );
  const dismiss = React.useCallback(
    (sessionId: string) =>
      setFailures((previous) => previous.filter((item) => item.sessionId !== sessionId)),
    [],
  );
  return { failures, dismiss };
}

/**
 * Oyente del shell (CA-14): `editing.save-failed` llega a cada participante por `toUser` en cualquier pantalla y se
 * muestra como aviso persistente arriba del contenido (en su propia región), sin toast (ADR-0024). El aviso no trae el nombre del archivo
 * (RN-9). «Abrir el editor de nuevo» lleva al editor, que muestra el banner antes de abrir la sesión nueva.
 */
export function SaveFailedListener(): React.JSX.Element | null {
  const router = useRouter();
  const { failures, dismiss } = useSaveFailures();
  if (failures.length === 0) return null;
  return (
    <section aria-label="Avisos de guardado" className="space-y-2 p-4">
      {failures.map(({ sessionId, fileId }) => (
        <SaveFailedAlert
          key={sessionId}
          title="No pudimos guardar los cambios de un documento."
          description="Tu versión anterior está intacta. Abre el editor de nuevo para seguir desde esa versión."
          onReopen={() => {
            dismiss(sessionId);
            router.push(editorPath(fileId));
          }}
          onDismiss={() => dismiss(sessionId)}
        />
      ))}
    </section>
  );
}
