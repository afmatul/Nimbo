'use client';

import type { Plan, SubscriptionView } from '@nimbo/contracts';
import { AlertCircle, AlertTriangle } from 'lucide-react';
import type * as React from 'react';

import { Alert } from '../../../components/ui/alert';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../../components/ui/alert-dialog';
import { Button } from '../../../components/ui/button';

import { changeCopy, downgradeWarning, splitMessage } from './plan-change-copy';
import type { Card } from './subscription-copy';

export interface PlanChangeDialogProps {
  readonly subscription: SubscriptionView;
  /** El plan elegido; `null` cierra el diálogo. */
  readonly target: Plan | null;
  readonly card: Card | null;
  readonly usedBytes: number | null;
  readonly pending: boolean;
  /** Mensaje del catálogo si programar falló (CA-17): el diálogo solo ofrece «Cerrar». */
  readonly error: string | null;
  readonly onConfirm: (plan: Plan) => void;
  readonly onClose: () => void;
}

function Summary({ rows }: { readonly rows: ReturnType<typeof changeCopy>['rows'] }) {
  return (
    <dl className="space-y-1 rounded-md bg-muted px-3 py-2 text-sm">
      {rows.map((row) => (
        <div key={row.label} className="flex justify-between gap-4">
          <dt className="text-secondary-foreground">{row.label}</dt>
          <dd className="text-right text-foreground">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Warning({
  warning,
}: {
  readonly warning: NonNullable<ReturnType<typeof downgradeWarning>>;
}) {
  return (
    <Alert variant="warning" className="flex gap-3">
      <AlertTriangle aria-hidden="true" className="size-5 shrink-0" />
      <div className="min-w-0">
        <p className="font-semibold">{warning.title}</p>
        <ul className="mt-1 list-disc space-y-1 pl-5 text-foreground">
          {warning.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
    </Alert>
  );
}

function Failure({ message }: { readonly message: string }) {
  const { title, body } = splitMessage(message);
  return (
    <Alert variant="error" className="flex gap-3">
      <AlertCircle aria-hidden="true" className="size-5 shrink-0" />
      <div className="min-w-0">
        <p className="font-semibold text-foreground">{title}</p>
        {body === '' ? null : <p className="text-foreground">{body}</p>}
      </div>
    </Alert>
  );
}

/**
 * Confirmación del cambio de plan (spec 010 CA-16, CA-17, CA-21, CA-27; mockups `planes--confirmar-*` y
 * `planes--cambio-error`): resumen, aviso de lo que baja y el botón de programar; si falla, el error y «Cerrar».
 */
export function PlanChangeDialog(props: PlanChangeDialogProps): React.JSX.Element | null {
  const { subscription, target, card, usedBytes, pending, error, onConfirm, onClose } = props;
  if (target === null) return null;
  const copy = changeCopy(subscription, target, card);
  const warning = downgradeWarning(subscription.plan, target, usedBytes);
  return (
    <AlertDialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{copy.title}</AlertDialogTitle>
          <AlertDialogDescription>{copy.description}</AlertDialogDescription>
        </AlertDialogHeader>
        {error === null ? (
          <>
            <Summary rows={copy.rows} />
            {warning === null ? null : <Warning warning={warning} />}
          </>
        ) : (
          <Failure message={error} />
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>
            {error === null ? 'Cancelar' : 'Cerrar'}
          </AlertDialogCancel>
          {error === null ? (
            <Button onClick={() => onConfirm(target)} disabled={pending}>
              {copy.confirmLabel}
            </Button>
          ) : null}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
