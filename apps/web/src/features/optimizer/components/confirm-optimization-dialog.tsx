'use client';

import { formatBytes, type FileVersionSummary, type OptimizationStatus } from '@nimbo/contracts';
import { TriangleAlert } from 'lucide-react';
import * as React from 'react';

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
import { dayLabel } from '../../../lib/format-date';
import { versionToPrune } from '../../storage/version-history';
import { savingsLabel } from '../optimizer-messages';

export interface ConfirmOptimizationDialogProps {
  readonly status: OptimizationStatus;
  /** Número de la versión actual, para el resumen («4.8 MB · versión 3»). */
  readonly currentNumber: number | null;
  readonly versions: readonly FileVersionSummary[];
  readonly retainedVersions: number;
  readonly pending: boolean;
  readonly readOnly: boolean;
  readonly onConfirm: () => void;
  readonly onClose: () => void;
  readonly onReturnFocus: () => void;
}

/** Solo una previsión para confirmar; la fecha definitiva siempre procede de history.keptUntil (014b). */
function conservationDescription(status: OptimizationStatus, openedAt: number): string {
  const days = status.keepOriginalDays;
  const until =
    days === null
      ? ''
      : ` hasta el ${dayLabel(new Date(openedAt + days * 86_400_000).toISOString())}`;
  return `Se creará una versión optimizada. El original se conserva${until} y no ocupa tu espacio.`;
}

function PruneWarning({
  versions,
  retainedVersions,
}: Pick<
  ConfirmOptimizationDialogProps,
  'versions' | 'retainedVersions'
>): React.JSX.Element | null {
  const number = versionToPrune(versions, retainedVersions);
  if (number === null) return null;
  return (
    <Alert variant="warning" className="flex gap-2.5">
      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <p>
        <strong className="block font-semibold">{`Se eliminará la versión ${String(number)}.`}</strong>{' '}
        <span className="text-foreground">{`Tu plan conserva ${String(retainedVersions)} versiones. Al continuar se eliminará la versión ${String(number)}, la más antigua.`}</span>
      </p>
    </Alert>
  );
}

const withVersion = (bytes: string, number: number | null): string =>
  number === null ? bytes : `${bytes} · versión ${String(number)}`;

function DialogSummary({
  status,
  currentNumber,
}: Pick<ConfirmOptimizationDialogProps, 'status' | 'currentNumber'>): React.JSX.Element {
  return (
    <dl className="space-y-2 rounded-md bg-muted p-3 text-sm">
      <div>
        <dt className="text-secondary-foreground">Tamaño actual</dt>
        <dd className="tabular-nums">
          {withVersion(formatBytes(status.originalBytes), currentNumber)}
        </dd>
      </div>
      <div>
        <dt className="text-secondary-foreground">Tamaño estimado</dt>
        <dd className="tabular-nums">{`${formatBytes(status.estimatedBytes ?? 0)} · ahorras ${savingsLabel(status)}`}</dd>
      </div>
    </dl>
  );
}

function ConfirmationBody(
  props: ConfirmOptimizationDialogProps & { readonly openedAt: number },
): React.JSX.Element {
  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>¿Optimizar esta imagen?</AlertDialogTitle>
        <AlertDialogDescription>
          {conservationDescription(props.status, props.openedAt)}
        </AlertDialogDescription>
      </AlertDialogHeader>
      <DialogSummary status={props.status} currentNumber={props.currentNumber} />
      <PruneWarning versions={props.versions} retainedVersions={props.retainedVersions} />
    </>
  );
}

function ConfirmationFooter({
  pending,
  readOnly,
  onConfirm,
  confirmRef,
}: Pick<ConfirmOptimizationDialogProps, 'pending' | 'readOnly' | 'onConfirm'> & {
  readonly confirmRef: React.RefObject<HTMLButtonElement | null>;
}): React.JSX.Element {
  return (
    <AlertDialogFooter>
      <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
      <Button ref={confirmRef} loading={pending} disabled={pending || readOnly} onClick={onConfirm}>
        {pending ? 'Enviando…' : 'Optimizar'}
      </Button>
    </AlertDialogFooter>
  );
}

/** Con poda el foco empieza en «Cancelar»; sin poda, en «Optimizar» (mismo patrón que restaurar, 014). */
function ConfirmationSurface(props: ConfirmOptimizationDialogProps): React.JSX.Element {
  const [openedAt] = React.useState(Date.now);
  const confirmRef = React.useRef<HTMLButtonElement>(null);
  const prunes = versionToPrune(props.versions, props.retainedVersions) !== null;
  return (
    <AlertDialogContent
      className="max-h-dvh overflow-y-auto rounded-xl"
      aria-busy={props.pending || undefined}
      onOpenAutoFocus={(event) => {
        if (prunes) return;
        event.preventDefault();
        confirmRef.current?.focus();
      }}
      onEscapeKeyDown={(event) => {
        if (props.pending) event.preventDefault();
      }}
      onCloseAutoFocus={(event) => {
        event.preventDefault();
        props.onReturnFocus();
      }}
    >
      <ConfirmationBody {...props} openedAt={openedAt} />
      <ConfirmationFooter
        pending={props.pending}
        readOnly={props.readOnly}
        onConfirm={props.onConfirm}
        confirmRef={confirmRef}
      />
    </AlertDialogContent>
  );
}

export function ConfirmOptimizationDialog(
  props: ConfirmOptimizationDialogProps,
): React.JSX.Element {
  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open && !props.pending) props.onClose();
      }}
    >
      <ConfirmationSurface {...props} />
    </AlertDialog>
  );
}
