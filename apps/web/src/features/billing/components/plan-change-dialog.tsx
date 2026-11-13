'use client';

import type { Plan, SubscriptionView } from '@nimbo/contracts';
import { AlertCircle, AlertTriangle, CheckCircle2 } from 'lucide-react';
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
  /** Mensaje de éxito (incluye programarlo para la próxima fecha de cobro): el diálogo solo ofrece seguir. */
  readonly success: string | null;
  readonly onConfirm: (plan: Plan) => void;
  readonly onClose: () => void;
  /** Tras el éxito: vuelve a «Plan y facturación». */
  readonly onDone: () => void;
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

/** «Cancelar» y programar; si falló, solo «Cerrar» (mockup `planes--cambio-error`). */
function Actions({
  failed,
  pending,
  confirmLabel,
  onConfirm,
}: {
  readonly failed: boolean;
  readonly pending: boolean;
  readonly confirmLabel: string;
  readonly onConfirm: () => void;
}): React.JSX.Element {
  return (
    <AlertDialogFooter>
      <AlertDialogCancel disabled={pending}>{failed ? 'Cerrar' : 'Cancelar'}</AlertDialogCancel>
      {failed ? null : (
        <Button onClick={onConfirm} disabled={pending}>
          {confirmLabel}
        </Button>
      )}
    </AlertDialogFooter>
  );
}

/** El cambio quedó hecho o programado: un éxito, nunca un error (pedido de Adrián, 2026-11-13). */
function ScheduledDialog({
  message,
  onDone,
}: {
  readonly message: string;
  readonly onDone: () => void;
}): React.JSX.Element {
  return (
    <AlertDialog open onOpenChange={(open) => !open && onDone()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cambio programado</AlertDialogTitle>
          <AlertDialogDescription className="sr-only">{message}</AlertDialogDescription>
        </AlertDialogHeader>
        <Alert variant="success" className="flex gap-3">
          <CheckCircle2 aria-hidden="true" className="size-5 shrink-0 text-success-foreground" />
          <p className="min-w-0">{message}</p>
        </Alert>
        <AlertDialogFooter>
          <Button onClick={onDone}>Ir a Plan y facturación</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * Confirmación del cambio de plan (spec 010 CA-16, CA-17, CA-21, CA-27; mockups `planes--confirmar-*` y
 * `planes--cambio-error`): resumen, aviso de lo que baja y el botón de programar; si falla, el error y «Cerrar».
 */
export function PlanChangeDialog(props: PlanChangeDialogProps): React.JSX.Element | null {
  const { subscription, target, card, usedBytes, pending, error, onConfirm, onClose } = props;
  if (props.success !== null) return <ScheduledDialog message={props.success} onDone={props.onDone} />;
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
        <Actions
          failed={error !== null}
          pending={pending}
          confirmLabel={copy.confirmLabel}
          onConfirm={() => onConfirm(target)}
        />
      </AlertDialogContent>
    </AlertDialog>
  );
}
