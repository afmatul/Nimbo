'use client';

import { formatBytes, STORAGE_ERROR_CODES, type FileVersionSummary } from '@nimbo/contracts';
import { AlertCircle, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
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
import { Button, buttonVariants } from '../../../components/ui/button';
import { storageMessage } from '../../../lib/error-catalog';
import { PENDING_LABEL_DELAY_MS, usePendingConfirm } from '../hooks/use-pending-confirm';
import { SPACE_PATH } from '../routes';
import { StorageRequestError } from '../storage-request-error';

import { retryAdvice } from './file-row-menu';

/** Pasado este tiempo sin respuesta, el botón dice «Restaurando…» (CA-20, RNF-14). */
export const RESTORING_DELAY_MS = PENDING_LABEL_DELAY_MS;

/** Versión a restaurar y lo que el diálogo cuenta de ella. */
export interface RestoreTarget {
  readonly version: FileVersionSummary;
  /** «ayer, 17:20 · Tú». */
  readonly byline: string;
  readonly currentNumber: number;
  readonly retainedVersions: number;
  /** Versión que la poda eliminará al restaurar (CA-15); `null` si el plan tiene lugar. */
  readonly prunedNumber: number | null;
}

export interface RestoreVersionDialogProps {
  /** `null` = cerrado. */
  readonly target: RestoreTarget | null;
  /** Restaura; si rechaza, el diálogo sigue abierto con el motivo. */
  readonly onConfirm: () => Promise<void>;
  readonly onClose: () => void;
}

/** Sin espacio (`422`, CA-12) se ofrece liberarlo; lo demás se puede reintentar. */
interface RestoreFailure {
  readonly kind: 'quota' | 'retry';
  readonly description: string;
}

function failureOf(error: unknown): RestoreFailure {
  const quota =
    error instanceof StorageRequestError &&
    error.code === STORAGE_ERROR_CODES.STORAGE_QUOTA_EXCEEDED
      ? storageMessage(error.code, error.details, { purpose: 'restore' })
      : null;
  if (quota === null) return { kind: 'retry', description: retryAdvice(error) };
  return { kind: 'quota', description: `${quota.cause} ${quota.fix}` };
}

function numberOf(target: RestoreTarget): string {
  return String(target.version.number);
}

/** La versión elegida y la actual, que se conserva (mockup `confirmar-restauracion`). */
function RestoreSummary({
  id,
  target,
}: {
  readonly id: string;
  readonly target: RestoreTarget;
}): React.JSX.Element {
  return (
    <dl id={id} className="space-y-1.5 rounded-md bg-muted px-3 py-2.5 text-sm">
      <div className="flex flex-wrap justify-between gap-x-3">
        <dt className="text-secondary-foreground">{`Versión ${numberOf(target)}`}</dt>
        <dd className="tabular-nums text-foreground">{target.byline}</dd>
      </div>
      <div className="flex flex-wrap justify-between gap-x-3">
        <dt className="text-secondary-foreground">Versión actual</dt>
        <dd className="text-foreground">{`Versión ${String(target.currentNumber)} · se conserva en el historial`}</dd>
      </div>
    </dl>
  );
}

/** Aviso de poda (CA-15): `Alert` `warning` que dice qué versión se eliminará. */
function PruneWarning({
  id,
  target,
}: {
  readonly id: string;
  readonly target: RestoreTarget;
}): React.JSX.Element | null {
  if (target.prunedNumber === null) return null;
  const pruned = String(target.prunedNumber);
  return (
    <Alert id={id} variant="warning" className="flex gap-2.5">
      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <p>
        <strong className="block font-semibold">{`Se eliminará la versión ${pruned}.`}</strong>{' '}
        <span className="text-foreground">
          {`Tu plan conserva ${String(target.retainedVersions)} versiones. Al continuar se eliminará la versión ${pruned}, la más antigua.`}
        </span>
      </p>
    </Alert>
  );
}

function FailureAlert({
  target,
  failure,
}: {
  readonly target: RestoreTarget;
  readonly failure: RestoreFailure;
}): React.JSX.Element {
  return (
    <Alert variant="error" className="flex gap-2.5 bg-destructive/5">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <p>
        <strong className="block font-semibold">{`No pudimos restaurar la versión ${numberOf(target)}.`}</strong>{' '}
        <span className="text-foreground">{failure.description}</span>
      </p>
    </Alert>
  );
}

interface FooterProps {
  readonly target: RestoreTarget;
  readonly pending: boolean;
  readonly slow: boolean;
  readonly quotaFailed: boolean;
  readonly onConfirm: () => void;
  readonly confirmRef: React.RefObject<HTMLButtonElement | null>;
  readonly closeRef: React.RefObject<HTMLButtonElement | null>;
}

/** Sin espacio: «Cerrar» y «Liberar espacio» (CA-12). Si no: «Cancelar» y «Restaurar versión N», que no es destructivo. */
function RestoreFooter({
  target,
  pending,
  slow,
  quotaFailed,
  onConfirm,
  confirmRef,
  closeRef,
}: FooterProps): React.JSX.Element {
  if (quotaFailed) {
    return (
      <AlertDialogFooter>
        <AlertDialogCancel ref={closeRef}>Cerrar</AlertDialogCancel>
        <Link href={SPACE_PATH} className={buttonVariants()}>
          Liberar espacio
        </Link>
      </AlertDialogFooter>
    );
  }
  const handleClick = (event: React.MouseEvent<HTMLButtonElement>): void => {
    event.preventDefault();
    onConfirm();
  };
  return (
    <AlertDialogFooter>
      <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
      <AlertDialogAction asChild>
        <Button ref={confirmRef} loading={slow} disabled={pending} onClick={handleClick}>
          {slow ? 'Restaurando…' : `Restaurar versión ${numberOf(target)}`}
        </Button>
      </AlertDialogAction>
    </AlertDialogFooter>
  );
}

/** Ids para `aria-describedby`: el texto, el resumen y, si lo hay, el aviso de poda (mockup `aviso-de-poda`). */
function useDescriptionIds(target: RestoreTarget | null): {
  readonly description: string;
  readonly summary: string;
  readonly prune: string;
  readonly describedBy: string;
} {
  const base = React.useId();
  const ids = { description: `${base}-d`, summary: `${base}-n`, prune: `${base}-p` };
  const parts = [ids.description, ids.summary];
  if (target?.prunedNumber != null) parts.push(ids.prune);
  return { ...ids, describedBy: parts.join(' ') };
}

/**
 * Confirmación de «Restaurar» (CA-9, CA-12, CA-15, CA-20): dice que se crea una versión nueva y el espacio que usará.
 * Sin poda, el foco empieza en «Restaurar versión N»; con poda avisa qué versión se elimina y el foco pasa a «Cancelar».
 * Pasados 2 s dice «Restaurando…» con anuncio y Escape no cierra; sin espacio ofrece «Liberar espacio».
 */
export function RestoreVersionDialog({
  target,
  onConfirm,
  onClose,
}: RestoreVersionDialogProps): React.JSX.Element | null {
  const state = usePendingConfirm(onConfirm, onClose, failureOf);
  const ids = useDescriptionIds(target);
  const confirmRef = React.useRef<HTMLButtonElement>(null);
  const closeRef = React.useRef<HTMLButtonElement>(null);
  const quotaFailed = state.failure?.kind === 'quota';

  React.useEffect(() => {
    if (quotaFailed) closeRef.current?.focus();
  }, [quotaFailed]);

  if (target === null) return null;
  return (
    <AlertDialog open onOpenChange={(open) => !open && !state.pending && state.close()}>
      <AlertDialogContent
        aria-describedby={ids.describedBy}
        aria-busy={state.pending || undefined}
        onOpenAutoFocus={(event) => {
          if (target.prunedNumber !== null) return;
          event.preventDefault();
          confirmRef.current?.focus();
        }}
      >
        <RestoreDialogBody target={target} ids={ids} failure={state.failure} />
        <RestoreFooter
          target={target}
          pending={state.pending}
          slow={state.slow}
          quotaFailed={quotaFailed}
          onConfirm={() => void state.confirm()}
          confirmRef={confirmRef}
          closeRef={closeRef}
        />
        <p role="status" className="sr-only">
          {state.slow ? `Restaurando la versión ${numberOf(target)}…` : ''}
        </p>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function RestoreDialogBody({
  target,
  ids,
  failure,
}: {
  readonly target: RestoreTarget;
  readonly ids: ReturnType<typeof useDescriptionIds>;
  readonly failure: RestoreFailure | null;
}): React.JSX.Element {
  const number = numberOf(target);
  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>{`¿Restaurar la versión ${number}?`}</AlertDialogTitle>
        <AlertDialogDescription id={ids.description} className="text-secondary-foreground">
          {`Se creará una versión nueva con el contenido de la versión ${number}. Usará ${formatBytes(target.version.sizeBytes)} de tu espacio.`}
        </AlertDialogDescription>
      </AlertDialogHeader>
      <RestoreSummary id={ids.summary} target={target} />
      <PruneWarning id={ids.prune} target={target} />
      {failure ? <FailureAlert target={target} failure={failure} /> : null}
    </>
  );
}
