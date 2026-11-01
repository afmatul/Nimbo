'use client';

import { formatBytes, type OptimizationStatus } from '@nimbo/contracts';
import { AlertCircle, CircleCheck, Info, Loader2, Sparkles } from 'lucide-react';
import * as React from 'react';

import { Alert } from '../../../components/ui/alert';
import { Button } from '../../../components/ui/button';
import { Card } from '../../../components/ui/card';
import { showNotice } from '../../../components/ui/sonner';
import { useReadOnlyAccount } from '../../storage/components/space-provider';
import type { VersionsListing } from '../../storage/hooks/use-file-versions';
import { useFileOptimization, type FileOptimizationView } from '../hooks/use-file-optimization';
import type { OptimizerApi } from '../optimizer-api';
import {
  OPTIMIZATION_MESSAGES as COPY,
  optimizationResultMessage,
  savingsLabel,
} from '../optimizer-messages';

import { ConfirmOptimizationDialog } from './confirm-optimization-dialog';

type ReadyHistory = Extract<VersionsListing, { status: 'ready' }>;

export interface OptimizationCardProps {
  readonly api: OptimizerApi;
  readonly fileId: string;
  readonly history: ReadyHistory;
  readonly onCompleted: () => void;
}

function EstimateSummary({ status }: { readonly status: OptimizationStatus }): React.JSX.Element {
  return (
    <div className="space-y-3">
      <dl className="grid gap-3 sm:grid-cols-2">
        <div>
          <dt className="text-secondary-foreground">Tamaño actual</dt>
          <dd className="tabular-nums">{formatBytes(status.originalBytes)}</dd>
        </div>
        <div>
          <dt className="text-secondary-foreground">Tamaño estimado</dt>
          <dd className="tabular-nums">{formatBytes(status.estimatedBytes ?? 0)}</dd>
        </div>
      </dl>
      <p className="font-semibold tabular-nums text-success-foreground">{`Ahorrarías ${savingsLabel(status)}`}</p>
    </div>
  );
}

function StateMessage({
  children,
  busy = false,
  success = false,
}: {
  readonly children: React.ReactNode;
  readonly busy?: boolean;
  readonly success?: boolean;
}): React.JSX.Element {
  const Icon = busy ? Loader2 : success ? CircleCheck : Info;
  return (
    <p className="flex items-start gap-2">
      <Icon
        className={`mt-0.5 h-4 w-4 shrink-0 text-primary ${busy ? 'animate-spin motion-reduce:animate-none' : ''}`}
        aria-hidden="true"
      />
      <span>{children}</span>
    </p>
  );
}

/** Progreso indeterminado (mockup: `progressbar` sin `aria-valuenow`, con nombre; sin porcentaje inventado). */
function IndeterminateProgress({ label }: { readonly label: string }): React.JSX.Element {
  return (
    <div
      role="progressbar"
      aria-label={label}
      className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
    >
      <div className="h-full w-1/3 animate-pulse rounded-full bg-primary motion-reduce:animate-none" />
    </div>
  );
}

/** Qué operación está en curso: pedida y sin respuesta todavía, o esperando al `worker`. */
function busyKind(view: FileOptimizationView): 'estimate' | 'run' | null {
  const state = view.optimization?.state;
  if (view.pending === 'estimate' || state === 'estimando') return 'estimate';
  if (view.pending === 'run' || state === 'optimizando') return 'run';
  return null;
}

function StatusBody({ view }: { readonly view: FileOptimizationView }): React.JSX.Element {
  const status = view.optimization;
  if (busyKind(view) === 'estimate')
    return (
      <>
        <StateMessage busy>
          <strong>{COPY.estimating}</strong> Puedes seguir usando la ficha mientras tanto.
        </StateMessage>
        <IndeterminateProgress label={COPY.estimating} />
      </>
    );
  if (busyKind(view) === 'run')
    return (
      <>
        <StateMessage busy>
          <strong>{COPY.optimizing}</strong> Puedes seguir usando Nimbo mientras tanto.
        </StateMessage>
        <IndeterminateProgress label={COPY.optimizing} />
      </>
    );
  if (view.unavailable || status?.state === 'no_disponible')
    return <StateMessage>{COPY.unavailable}</StateMessage>;
  if (status === null) return <p>{COPY.idle}</p>;
  if (status.state === 'estimada' || status.state === 'no_conviene')
    return (
      <>
        <EstimateSummary status={status} />
        {status.state === 'no_conviene' ? <StateMessage>{COPY.notWorthIt}</StateMessage> : null}
      </>
    );
  return <FinalMessage status={status} />;
}

function FinalMessage({ status }: { readonly status: OptimizationStatus }): React.JSX.Element {
  return status.state === 'fallida' ? (
    <Alert variant="error" className="flex gap-2">
      <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
      <p>{optimizationResultMessage(status)}</p>
    </Alert>
  ) : (
    <StateMessage success={status.state === 'completada'}>
      {optimizationResultMessage(status)}
    </StateMessage>
  );
}

function ConservationNote({
  status,
}: {
  readonly status: OptimizationStatus | null;
}): React.JSX.Element | null {
  if (status?.state !== 'estimada' || status.keepOriginalDays === null) return null;
  return (
    <StateMessage>{`Se creará una versión optimizada. El original se conserva ${String(status.keepOriginalDays)} días y no ocupa tu espacio.`}</StateMessage>
  );
}

function canEstimate(view: FileOptimizationView): boolean {
  if (view.unavailable || view.loading || view.pending !== null) return false;
  const status = view.optimization;
  return (
    status === null ||
    status.reason === 'version_cambiada' ||
    status.reason === 'servicio_no_disponible'
  );
}

interface CardAction {
  readonly label: string;
  readonly variant: 'default' | 'outline';
  readonly busy: boolean;
  readonly disabled: boolean;
  readonly onClick?: () => void;
}

/**
 * La acción de la tarjeta. Siempre el mismo botón en el mismo lugar: mientras corre dice «Calculando…» u
 * «Optimizando…» con `aria-disabled` y sigue enfocable (patrón de «Reintentando…», 019), así el foco no se pierde.
 */
function actionOf(
  view: FileOptimizationView,
  readOnly: boolean,
  onConfirm: () => void,
): CardAction | null {
  const busy = busyKind(view);
  if (busy !== null) {
    const label = busy === 'estimate' ? 'Calculando…' : 'Optimizando…';
    const variant = busy === 'estimate' ? 'outline' : 'default';
    return { label, variant, busy: true, disabled: false };
  }
  if (view.optimization?.state === 'estimada')
    return {
      label: 'Optimizar',
      variant: 'default',
      busy: false,
      disabled: readOnly,
      onClick: onConfirm,
    };
  if (!canEstimate(view)) return null;
  const estimate = () => void view.estimate();
  return {
    label: 'Calcular ahorro',
    variant: 'outline',
    busy: false,
    disabled: false,
    onClick: estimate,
  };
}

function CardActions({
  view,
  readOnly,
  onConfirm,
  buttonRef,
}: {
  readonly view: FileOptimizationView;
  readonly readOnly: boolean;
  readonly onConfirm: () => void;
  readonly buttonRef: React.RefObject<HTMLButtonElement | null>;
}): React.JSX.Element | null {
  const action = actionOf(view, readOnly, onConfirm);
  if (action === null) return null;
  const Icon = action.busy ? Loader2 : Sparkles;
  return (
    <Button
      ref={buttonRef}
      variant={action.variant}
      className="w-full aria-disabled:cursor-progress sm:w-auto"
      disabled={action.disabled}
      aria-disabled={action.busy || undefined}
      onClick={action.busy ? undefined : action.onClick}
    >
      <Icon
        className={`h-4 w-4 ${action.busy ? 'animate-spin motion-reduce:animate-none' : ''}`}
        aria-hidden="true"
      />
      {action.label}
    </Button>
  );
}

function RequestFeedback({ view }: { readonly view: FileOptimizationView }): React.JSX.Element {
  return (
    <>
      {view.loading ? <StateMessage busy>Cargando…</StateMessage> : null}
      {view.stale ? <Alert variant="warning">{COPY.stale}</Alert> : null}
      {view.error ? (
        <Alert variant="error">
          <p>{view.error}</p>
          <Button variant="outline" className="mt-2" onClick={view.reload}>
            Reintentar
          </Button>
        </Alert>
      ) : null}
    </>
  );
}

function useCardState(props: OptimizationCardProps): {
  readonly view: FileOptimizationView;
  readonly confirming: boolean;
  readonly close: () => void;
  readonly open: () => void;
  readonly confirm: () => Promise<void>;
  readonly readOnly: boolean;
} {
  const { readOnly } = useReadOnlyAccount();
  const { onCompleted } = props;
  const [confirming, setConfirming] = React.useState(false);
  const completed = React.useCallback(
    (status: OptimizationStatus) => {
      onCompleted();
      showNotice(optimizationResultMessage(status));
    },
    [onCompleted],
  );
  const view = useFileOptimization(props.api, props.fileId, completed);
  const confirm = useConfirmAction(view, readOnly, () => setConfirming(false));
  return {
    view,
    confirming,
    readOnly,
    confirm,
    close: () => setConfirming(false),
    open: () => {
      if (!readOnly) setConfirming(true);
    },
  };
}

function useConfirmAction(
  view: FileOptimizationView,
  readOnly: boolean,
  close: () => void,
): () => Promise<void> {
  const mounted = React.useRef(true);
  React.useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  return async () => {
    if (readOnly) return;
    await view.run();
    if (mounted.current) close();
  };
}

type CardState = ReturnType<typeof useCardState>;

/**
 * Al llegar el resultado el botón en curso desaparece: si el foco se perdía con él, pasa al cuerpo de la tarjeta
 * (`tabindex="-1"`), no al `body` (mockup de la ficha, «En curso»).
 */
function useFocusAfterBusy(busy: boolean, bodyRef: React.RefObject<HTMLDivElement | null>): void {
  const wasBusy = React.useRef(busy);
  React.useEffect(() => {
    const finished = wasBusy.current && !busy;
    wasBusy.current = busy;
    const lost = document.activeElement === null || document.activeElement === document.body;
    if (finished && lost) bodyRef.current?.focus();
  }, [busy, bodyRef]);
}

function OptimizationContent({
  state,
  buttonRef,
}: {
  readonly state: CardState;
  readonly buttonRef: React.RefObject<HTMLButtonElement | null>;
}): React.JSX.Element {
  const { view } = state;
  const bodyRef = React.useRef<HTMLDivElement>(null);
  useFocusAfterBusy(busyKind(view) !== null, bodyRef);
  return (
    <div className="space-y-3 px-4 pb-4 text-sm sm:px-5">
      <div ref={bodyRef} tabIndex={-1} role="status" className="space-y-3">
        <StatusBody view={view} />
      </div>
      <ConservationNote status={view.optimization} />
      <RequestFeedback view={view} />
      <CardActions
        view={view}
        readOnly={state.readOnly}
        onConfirm={state.open}
        buttonRef={buttonRef}
      />
    </div>
  );
}

function CardConfirmation({
  state,
  history,
  onReturnFocus,
}: {
  readonly state: CardState;
  readonly history: ReadyHistory;
  readonly onReturnFocus: () => void;
}): React.JSX.Element | null {
  const { view } = state;
  if (!state.confirming || view.optimization?.state !== 'estimada') return null;
  return (
    <ConfirmOptimizationDialog
      status={view.optimization}
      currentNumber={history.items[0]?.number ?? null}
      versions={history.items}
      retainedVersions={history.retainedVersions}
      pending={view.pending === 'run'}
      readOnly={state.readOnly}
      onConfirm={() => void state.confirm()}
      onClose={state.close}
      onReturnFocus={onReturnFocus}
    />
  );
}

export function OptimizationCard(props: OptimizationCardProps): React.JSX.Element | null {
  const state = useCardState(props);
  const { view } = state;
  const titleId = React.useId();
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  const titleRef = React.useRef<HTMLHeadingElement>(null);
  if (view.hidden) return null;
  return (
    <Card role="region" aria-labelledby={titleId}>
      <h2
        id={titleId}
        ref={titleRef}
        tabIndex={-1}
        className="px-4 py-4 text-base font-semibold sm:px-5"
      >
        Optimizar espacio
      </h2>
      <OptimizationContent state={state} buttonRef={buttonRef} />
      <CardConfirmation
        state={state}
        history={props.history}
        onReturnFocus={() => (buttonRef.current ?? titleRef.current)?.focus()}
      />
    </Card>
  );
}
