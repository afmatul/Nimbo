'use client';

import { AlertCircle, Pencil, X } from 'lucide-react';
import * as React from 'react';

import { Alert } from '../../../components/ui/alert';
import { Button } from '../../../components/ui/button';

export const REOPEN_EDITOR_LABEL = 'Abrir el editor de nuevo';

export interface SaveFailedAlertProps {
  readonly title: string;
  readonly description: string;
  /** Abre una sesión nueva sobre la versión vigente; no se reprocesa la entrega (CA-14). */
  readonly onReopen: () => void;
  /** Solo el aviso en vivo se puede cerrar; el banner del editor dura mientras no se reabra. */
  readonly onDismiss?: () => void;
}

/**
 * Guardado fallido (CA-14): `Alert` de error arriba del contenido, nunca un toast (ADR-0024), con «Abrir el editor de
 * nuevo» y, si se puede cerrar, «Cerrar aviso».
 */
export function SaveFailedAlert({
  title,
  description,
  onReopen,
  onDismiss,
}: SaveFailedAlertProps): React.JSX.Element {
  return (
    <Alert
      variant="error"
      className="flex flex-wrap items-start gap-3 border-destructive/40 bg-destructive/5 py-3 pl-4 pr-2"
    >
      <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden="true" />
      <div className="min-w-0 flex-1 basis-48">
        <p className="text-sm font-semibold text-destructive">{title}</p>
        <p className="mt-0.5 text-sm text-foreground">{description}</p>
      </div>
      <div className="flex w-full items-center gap-1 sm:w-auto">
        <Button type="button" size="sm" className="flex-1 sm:flex-none" onClick={onReopen}>
          <Pencil className="h-4 w-4" aria-hidden="true" />
          {REOPEN_EDITOR_LABEL}
        </Button>
        {onDismiss ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Cerrar aviso"
            onClick={onDismiss}
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </Button>
        ) : null}
      </div>
    </Alert>
  );
}
