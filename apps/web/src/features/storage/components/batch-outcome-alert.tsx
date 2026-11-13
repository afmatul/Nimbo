import { AlertCircle, AlertTriangle, CheckCircle2, X } from 'lucide-react';
import * as React from 'react';

import { Alert } from '../../../components/ui/alert';
import { Button } from '../../../components/ui/button';
import type { BatchOutcome } from '../batch-outcome';

const ICONS = { success: CheckCircle2, warning: AlertTriangle, error: AlertCircle } as const;

/**
 * Resultado de una acción por lote sobre la lista: éxito, parcial (con cada elemento que falló, su nombre y el motivo)
 * o error. Ícono y texto, nunca solo color.
 */
export function BatchOutcomeAlert({
  outcome,
  onDismiss,
}: {
  readonly outcome: BatchOutcome;
  readonly onDismiss: () => void;
}): React.JSX.Element {
  const titleId = React.useId();
  const Icon = ICONS[outcome.tone];
  return (
    <Alert variant={outcome.tone} aria-labelledby={titleId} className="flex items-start gap-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1 space-y-1">
        <p id={titleId} className="font-semibold">
          {outcome.title}
        </p>
        {outcome.failures.length === 0 ? null : (
          <ul className="list-disc space-y-1 pl-5 text-foreground">
            {outcome.failures.map((failure) => (
              <li key={failure.id} className="break-words">
                <span className="font-medium">{failure.name}</span>: {failure.message}
              </li>
            ))}
          </ul>
        )}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="-my-2 shrink-0"
        aria-label="Cerrar aviso"
        onClick={onDismiss}
      >
        <X className="h-5 w-5" aria-hidden="true" />
      </Button>
    </Alert>
  );
}
