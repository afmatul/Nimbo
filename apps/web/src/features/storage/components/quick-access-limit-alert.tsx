import { STORAGE_ERROR_CODES } from '@nimbo/contracts';
import { CircleAlert, X } from 'lucide-react';
import * as React from 'react';

import { Alert } from '../../../components/ui/alert';
import { Button } from '../../../components/ui/button';
import { messageForCode } from '../../../lib/error-catalog';

export interface QuickAccessLimitAlertProps {
  /** `details.maxPinned` del `422 STORAGE_QUICK_ACCESS_LIMIT`. */
  readonly maxPinned: number;
  readonly onDismiss: () => void;
}

/**
 * Aviso del tope de fijados (006 CA-28, mockup `tope-de-fijados`): `Alert` de advertencia arriba de la lista, con
 * `role="status"` (no es una falla) y «Cerrar aviso». No es un toast (ADR-0024).
 */
export function QuickAccessLimitAlert({
  maxPinned,
  onDismiss,
}: QuickAccessLimitAlertProps): React.JSX.Element {
  const message = messageForCode(STORAGE_ERROR_CODES.STORAGE_QUICK_ACCESS_LIMIT, {
    details: { maxPinned },
  });
  return (
    <Alert variant="warning" className="flex items-center gap-3 py-2 pl-4 pr-2">
      <CircleAlert className="h-5 w-5 shrink-0" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-sm font-semibold">{message}</p>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="shrink-0 text-warning-foreground"
        aria-label="Cerrar aviso"
        onClick={onDismiss}
      >
        <X className="h-5 w-5" aria-hidden="true" />
      </Button>
    </Alert>
  );
}
