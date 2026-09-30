'use client';

import { STORAGE_ERROR_CODES } from '@nimbo/contracts';
import { ChevronDown, Pause, X } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

import { FileTypeChip } from '../../../components/nimbo/file-type-chip';
import {
  SPEED_WINDOW_MS,
  UploadProgress,
  type ProgressSample,
} from '../../../components/nimbo/upload-progress';
import { Button, buttonVariants } from '../../../components/ui/button';
import { Card } from '../../../components/ui/card';
import { storageMessage } from '../../../lib/error-catalog';
import { cn } from '../../../lib/utils';
import type { UploadPhase, UploadView } from '../upload/upload-manager';

export interface UploadPanelProps {
  readonly rows: readonly UploadView[];
  readonly onPause: (id: string) => void;
  readonly onResume: (id: string) => void;
  /** «Reintentar» tras un `429` (CA-19). */
  readonly onRetry: (id: string) => void;
  /** «Cancelar» de una fila: el manager decide si cancela directo o pide confirmación (CA-22). */
  readonly onRequestCancel: (id: string) => void;
  /** «Subir de nuevo»: abre el selector de archivos (CA-9). */
  readonly onUploadAgain: () => void;
  readonly onClose: () => void;
  /** Reloj para medir la velocidad; se inyecta en pruebas. */
  readonly now?: () => number;
}

/** Resumen de espacio (007); mientras no exista, Mis archivos. «Ver planes» no se muestra hasta 008 (CA-4). */
const FREE_SPACE_HREF = '/archivos';

const OFFLINE_TITLE = 'Carga en espera';
const OFFLINE_MESSAGE =
  'Se cortó la conexión. Tu carga se reanudará donde quedó. No cierres ni recargues esta pestaña.';

const FINISHED_PHASES = new Set<UploadPhase>(['done', 'rejected', 'cancelled', 'expired']);
const PAUSABLE_PHASES = new Set<UploadPhase>(['starting', 'uploading']);
const RESUMABLE_PHASES = new Set<UploadPhase>(['paused', 'offline']);
const CANCELLABLE_PHASES = new Set<UploadPhase>([
  'queued',
  'starting',
  'conflict',
  'uploading',
  'paused',
  'offline',
  'rate_limited',
]);
const FAILED_PHASES = new Set<UploadPhase>(['rejected', 'expired']);
const ANNOUNCED_PHASES = new Set<UploadPhase>(['paused', 'offline', ...FAILED_PHASES]);
const PROGRESS_PHASES = new Set<UploadPhase>(['uploading', 'paused', 'offline', 'completing']);

const PHASE_LABELS: Readonly<Record<UploadPhase, string>> = {
  queued: 'en cola',
  starting: 'preparando',
  conflict: 'nombre repetido',
  uploading: 'subiendo',
  paused: 'en pausa',
  offline: 'sin conexión',
  completing: 'verificando',
  done: 'subido',
  rejected: 'rechazado',
  cancelled: 'cancelada',
  expired: 'caducada',
  rate_limited: 'en espera',
};

type NoticeTone = 'destructive' | 'warning' | 'muted';
type NoticeAction = 'free_space' | 'retry' | 'upload_again';

interface RowNotice {
  /** Qué pasó (en negrita) y qué hacer. */
  readonly cause: string;
  readonly fix: string;
  readonly tone: NoticeTone;
  readonly action?: NoticeAction;
}

const NOTICE_TONES: Readonly<Record<NoticeTone, string>> = {
  destructive: 'border-destructive-soft bg-destructive-soft/12 text-foreground',
  warning: 'border-warning bg-warning/12 text-warning-foreground',
  muted: 'border-border bg-muted text-secondary-foreground',
};

const ACTION_LABELS: Readonly<Record<NoticeAction, string>> = {
  free_space: 'Liberar espacio',
  retry: 'Reintentar',
  upload_again: 'Subir de nuevo',
};

const UNKNOWN_FAILURE: RowNotice = {
  tone: 'destructive',
  cause: 'No pudimos subir este archivo.',
  fix: 'Revisa tu conexión y vuelve a subirlo.',
  action: 'upload_again',
};

/** Aviso con el texto del catálogo de errores (spec §9); un código sin texto cae en el fallo genérico. */
function catalogNotice(
  code: string,
  row: UploadView,
  tone: NoticeTone,
  action?: NoticeAction,
): RowNotice {
  const message = storageMessage(code, row.errorDetails, row.name);
  if (message === null) return UNKNOWN_FAILURE;
  return action === undefined ? { tone, ...message } : { tone, ...message, action };
}

/** La cuota ofrece «Liberar espacio» y nunca «Ver planes» (CA-4). */
function rejectionNotice(row: UploadView): RowNotice {
  if (row.errorCode === null) return UNKNOWN_FAILURE;
  const action =
    row.errorCode === STORAGE_ERROR_CODES.STORAGE_QUOTA_EXCEEDED ? 'free_space' : undefined;
  return catalogNotice(row.errorCode, row, 'destructive', action);
}

function noticeOf(row: UploadView): RowNotice | null {
  switch (row.phase) {
    case 'rejected':
      return rejectionNotice(row);
    case 'expired':
      return catalogNotice(
        STORAGE_ERROR_CODES.STORAGE_UPLOAD_EXPIRED,
        row,
        'destructive',
        'upload_again',
      );
    case 'rate_limited':
      return catalogNotice(STORAGE_ERROR_CODES.STORAGE_TOO_MANY_REQUESTS, row, 'warning', 'retry');
    case 'cancelled':
      return {
        tone: 'muted',
        cause: 'Cancelaste esta carga.',
        fix: 'Liberamos el espacio que tenía reservado.',
      };
    default:
      return null;
  }
}

function countLabel(count: number): string {
  return `${String(count)} ${count === 1 ? 'archivo' : 'archivos'}`;
}

function titleOf(rows: readonly UploadView[]): string {
  if (rows.some((row) => row.phase === 'offline')) return OFFLINE_TITLE;
  const active = rows.filter((row) => !FINISHED_PHASES.has(row.phase)).length;
  if (active > 0) return `Subiendo ${countLabel(active)}`;
  const failed = rows.filter((row) => FAILED_PHASES.has(row.phase)).length;
  return failed > 0 ? `Cargas terminadas · ${String(failed)} con error` : 'Cargas terminadas';
}

/** Lo que se anuncia de una fila: pausas, cortes y fallos con su causa; nunca el progreso (UI-2). */
function announcementOf(row: UploadView): string | null {
  if (!ANNOUNCED_PHASES.has(row.phase)) return null;
  const cause = FAILED_PHASES.has(row.phase) ? `: ${noticeOf(row)?.cause ?? ''}` : '';
  return `${row.name}: ${PHASE_LABELS[row.phase]}${cause}`;
}

function announcementsOf(rows: readonly UploadView[]): string {
  return rows
    .map(announcementOf)
    .filter((text): text is string => text !== null)
    .join('. ');
}

interface SampleState {
  readonly rows: readonly UploadView[] | null;
  readonly atMs: number;
  readonly byRow: ReadonlyMap<string, readonly ProgressSample[]>;
}

function nextSamples(
  previous: SampleState,
  rows: readonly UploadView[],
  atMs: number,
): SampleState {
  const byRow = new Map<string, readonly ProgressSample[]>();
  for (const row of rows.filter((item) => item.phase === 'uploading')) {
    const kept = (previous.byRow.get(row.id) ?? []).filter(
      (sample) => sample.atMs >= atMs - SPEED_WINDOW_MS,
    );
    const last = kept.at(-1);
    byRow.set(
      row.id,
      last?.loadedBytes === row.loadedBytes
        ? kept
        : [...kept, { atMs, loadedBytes: row.loadedBytes }],
    );
  }
  return { rows, atMs, byRow };
}

/** Muestras de progreso por fila en curso; se descartan al pausar o cortar (la velocidad vuelve a medirse). */
function useProgressSamples(rows: readonly UploadView[], now: () => number): SampleState {
  const [state, setState] = React.useState<SampleState>({ rows: null, atMs: 0, byRow: new Map() });
  if (state.rows !== rows) {
    const next = nextSamples(state, rows, now());
    setState(next);
    return next;
  }
  return state;
}

interface RowProps {
  readonly row: UploadView;
  readonly props: UploadPanelProps;
}

function RowActions({ row, props }: RowProps): React.JSX.Element {
  return (
    <div className="flex shrink-0 items-center gap-1">
      {RESUMABLE_PHASES.has(row.phase) && !row.awaitingCancel ? (
        <Button
          size="sm"
          aria-label={`Reanudar la carga de ${row.name}`}
          onClick={() => props.onResume(row.id)}
        >
          Reanudar
        </Button>
      ) : null}
      {PAUSABLE_PHASES.has(row.phase) ? (
        <Button
          variant="outline"
          size="icon"
          aria-label={`Pausar la carga de ${row.name}`}
          onClick={() => props.onPause(row.id)}
        >
          <Pause className="h-4 w-4" aria-hidden="true" />
        </Button>
      ) : null}
      {CANCELLABLE_PHASES.has(row.phase) ? (
        <Button
          variant="outline"
          size="icon"
          aria-label={`Cancelar la carga de ${row.name}`}
          onClick={() => props.onRequestCancel(row.id)}
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </Button>
      ) : null}
    </div>
  );
}

function NoticeActionControl({
  action,
  row,
  props,
}: RowProps & { readonly action: NoticeAction }): React.JSX.Element {
  if (action === 'free_space') {
    return (
      <Link href={FREE_SPACE_HREF} className={cn(buttonVariants({ size: 'sm' }), 'self-start')}>
        {ACTION_LABELS[action]}
      </Link>
    );
  }
  const onClick = action === 'retry' ? () => props.onRetry(row.id) : props.onUploadAgain;
  return (
    <Button variant="outline" size="sm" className="self-start text-foreground" onClick={onClick}>
      {ACTION_LABELS[action]}
    </Button>
  );
}

function Notice({
  notice,
  row,
  props,
}: RowProps & { readonly notice: RowNotice }): React.JSX.Element {
  return (
    <div
      className={cn('flex flex-col gap-2 rounded-md border p-3 text-sm', NOTICE_TONES[notice.tone])}
    >
      <p>
        <strong className="font-semibold">{notice.cause}</strong> {notice.fix}
      </p>
      {notice.action ? (
        <NoticeActionControl action={notice.action} row={row} props={props} />
      ) : null}
    </div>
  );
}

function UploadRow({
  row,
  samples,
  nowMs,
  props,
}: RowProps & {
  readonly samples: readonly ProgressSample[];
  readonly nowMs: number;
}): React.JSX.Element {
  const notice = noticeOf(row);
  return (
    <li className="flex flex-col gap-2 py-3">
      <div className="flex items-center gap-3">
        <FileTypeChip filename={row.name} className="shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground" title={row.name}>
            {row.name}
          </p>
          <p className="text-xs text-muted-foreground">{PHASE_LABELS[row.phase]}</p>
        </div>
        <RowActions row={row} props={props} />
      </div>
      {row.phase === 'conflict' && row.suggestedName ? (
        <p className="text-xs text-muted-foreground">
          Si conservas ambos, el nuevo se guardará como «{row.suggestedName}».
        </p>
      ) : null}
      {PROGRESS_PHASES.has(row.phase) ? (
        <UploadProgress
          label={`Progreso de ${row.name}`}
          loadedBytes={row.loadedBytes}
          sizeBytes={row.sizeBytes}
          samples={row.phase === 'uploading' ? samples : []}
          nowMs={nowMs}
        />
      ) : null}
      {RESUMABLE_PHASES.has(row.phase) && row.restartsOnResume ? (
        <p className="text-xs text-muted-foreground">Se reiniciará al reanudar.</p>
      ) : null}
      {notice ? <Notice notice={notice} row={row} props={props} /> : null}
    </li>
  );
}

/**
 * Panel de cargas de la pestaña (CA-21): mientras haya cargas activas solo se minimiza; «Cerrar» aparece cuando no
 * queda ninguna y las filas terminadas persisten hasta cerrarlo.
 */
export function UploadPanel(props: UploadPanelProps): React.JSX.Element {
  const { rows, onClose, now = Date.now } = props;
  const samples = useProgressSamples(rows, now);
  const [expanded, setExpanded] = React.useState(true);
  const titleId = React.useId();
  const listId = React.useId();
  const offline = rows.some((row) => row.phase === 'offline');
  const finished = rows.every((row) => FINISHED_PHASES.has(row.phase));

  return (
    <Card role="region" aria-labelledby={titleId} className="flex w-full flex-col sm:w-110">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <h2 id={titleId} className="flex-1 text-sm font-semibold text-foreground">
          {titleOf(rows)}
        </h2>
        <Button
          variant="ghost"
          size="icon"
          aria-label={expanded ? 'Minimizar el panel de cargas' : 'Expandir el panel de cargas'}
          aria-expanded={expanded}
          aria-controls={listId}
          onClick={() => setExpanded((current) => !current)}
        >
          <ChevronDown
            className={cn('h-4 w-4 transition-transform', !expanded && 'rotate-180')}
            aria-hidden="true"
          />
        </Button>
        {finished ? (
          <Button
            variant="ghost"
            size="icon"
            aria-label="Cerrar el panel de cargas"
            onClick={onClose}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        ) : null}
      </div>
      <p role="status" className="sr-only">
        {announcementsOf(rows)}
      </p>
      <div id={listId} hidden={!expanded}>
        {offline ? (
          <p className={cn('mx-4 mt-3 rounded-md border p-3 text-sm', NOTICE_TONES.warning)}>
            {OFFLINE_MESSAGE}
          </p>
        ) : null}
        <ul className="max-h-96 divide-y divide-border overflow-y-auto px-4">
          {rows.map((row) => (
            <UploadRow
              key={row.id}
              row={row}
              samples={samples.byRow.get(row.id) ?? []}
              nowMs={samples.atMs}
              props={props}
            />
          ))}
        </ul>
      </div>
    </Card>
  );
}
