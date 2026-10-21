import { formatBytes, type FileVersionOrigin, type FileVersionSummary } from '@nimbo/contracts';
import { Check, Pencil, Sparkles, Undo2, Upload, UserRound } from 'lucide-react';
import * as React from 'react';

import { dateTimeLabel } from '../../lib/format-date';
import { cn } from '../../lib/utils';
import { badgeVariants } from '../ui/badge';

/** Autor de una versión: antes de 016 solo el propietario actúa (D-9), y la API no envía nombres (plan 014 §1). */
export const YOU_LABEL = 'Tú';
const OTHER_AUTHOR_LABEL = 'Otra persona';

const ORIGINS: Readonly<
  Record<FileVersionOrigin, { label: string; icon: React.ComponentType<{ className?: string }> }>
> = {
  carga: { label: 'Carga', icon: Upload },
  edicion: { label: 'Edición', icon: Pencil },
  restauracion: { label: 'Restauración', icon: Undo2 },
  optimizacion: { label: 'Optimización', icon: Sparkles },
};

/** Anchos de las columnas en escritorio, compartidos por el encabezado visual y cada versión. */
const COLUMNS = {
  number: 'xl:w-44 xl:shrink-0',
  when: 'xl:w-52 xl:shrink-0',
  origin: 'xl:min-w-0 xl:flex-1',
  size: 'xl:w-32 xl:shrink-0',
  actions: 'xl:w-60 xl:shrink-0 xl:justify-end',
} as const;

export interface VersionTimelineProps {
  /** Id del título que nombra la lista («Historial de versiones»). */
  readonly labelledBy: string;
  /** De la más nueva a la más antigua, como llegan de `GET /files/:fileId/versions`. */
  readonly versions: readonly FileVersionSummary[];
  /** Usuario de la sesión: su versión dice «Tú». */
  readonly viewerId: string | null;
  /** Momento de referencia de «hoy» y «ayer». */
  readonly now: number;
  /** Versión recién restaurada: lleva «NUEVA» hasta que se recarga la ficha. */
  readonly highlightedId?: string | null;
  /** «Descargar» y «Restaurar» de cada versión. */
  readonly renderActions: (version: FileVersionSummary) => React.ReactNode;
}

export function authorLabel(version: FileVersionSummary, viewerId: string | null): string {
  return version.createdById === viewerId ? YOU_LABEL : OTHER_AUTHOR_LABEL;
}

/** «ayer, 17:20 · Tú»: fecha y autor de una versión. */
export function versionByline(
  version: FileVersionSummary,
  viewerId: string | null,
  now: number,
): string {
  return `${dateTimeLabel(version.createdAt, now)} · ${authorLabel(version, viewerId)}`;
}

function originLabel(version: FileVersionSummary): string {
  const from = version.restoredFromNumber;
  if (version.origin === 'restauracion' && from !== null) {
    return `Restauración de la versión ${String(from)}`;
  }
  return ORIGINS[version.origin].label;
}

interface SizeChange {
  readonly shown: string;
  /** Para lectores de pantalla («200 KB más que la versión 4»); `null` si basta con lo visible. */
  readonly spoken: string | null;
}

/** Cambio de tamaño frente a la anterior retenida (CA-6); sin ella, «Primera versión» o «Sin comparación». */
function sizeChange(version: FileVersionSummary, previousNumber: number): SizeChange {
  if (version.deltaBytes === null) {
    return version.number === 1
      ? { shown: 'Primera versión', spoken: null }
      : {
          shown: 'Sin comparación',
          spoken: `Sin comparación: la versión ${String(version.number - 1)} ya no se conserva`,
        };
  }
  const delta = Number(version.deltaBytes);
  const previous = `la versión ${String(previousNumber)}`;
  if (delta === 0) return { shown: 'Mismo tamaño', spoken: `Mismo tamaño que ${previous}` };
  const amount = formatBytes(Math.abs(delta));
  return delta > 0
    ? { shown: `+${amount}`, spoken: `${amount} más que ${previous}` }
    : { shown: `−${amount}`, spoken: `${amount} menos que ${previous}` };
}

function SizeChangeText({ change }: { readonly change: SizeChange }): React.JSX.Element {
  if (change.spoken === null) return <span>{change.shown}</span>;
  return (
    <span>
      <span aria-hidden="true">{change.shown}</span>
      <span className="sr-only">{change.spoken}</span>
    </span>
  );
}

const TAG_CLASS = 'ml-2 gap-1 px-1.5 py-0 align-middle font-semibold tracking-wide';

function VersionTags({
  isCurrent,
  isNew,
}: {
  readonly isCurrent: boolean;
  readonly isNew: boolean;
}): React.JSX.Element {
  return (
    <>
      {isCurrent ? (
        <span className={cn(badgeVariants({ variant: 'success' }), TAG_CLASS, 'bg-success/12')}>
          <Check className="h-3 w-3" aria-hidden="true" />
          ACTUAL
        </span>
      ) : null}
      {isNew ? (
        <span
          className={cn(
            badgeVariants({ variant: 'outline' }),
            TAG_CLASS,
            'border-primary-hover text-primary-hover',
          )}
        >
          NUEVA
        </span>
      ) : null}
    </>
  );
}

function OriginText({ version }: { readonly version: FileVersionSummary }): React.JSX.Element {
  const Icon = ORIGINS[version.origin].icon;
  return (
    <p className={cn('flex items-center gap-1.5 text-secondary-foreground', COLUMNS.origin)}>
      <Icon className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
      <span>
        <span className="xl:sr-only">Origen: </span>
        {originLabel(version)}
      </span>
    </p>
  );
}

interface VersionItemProps {
  readonly version: FileVersionSummary;
  /** Número de la siguiente versión de la lista (la anterior retenida), para el cambio de tamaño. */
  readonly previousNumber: number;
  readonly byline: { readonly when: string; readonly author: string };
  readonly isNew: boolean;
  readonly actions: React.ReactNode;
}

function VersionItem({
  version,
  previousNumber,
  byline,
  isNew,
  actions,
}: VersionItemProps): React.JSX.Element {
  return (
    <li
      className={cn(
        'flex flex-col gap-1.5 border-t border-border px-4 py-4 text-sm sm:px-5 xl:flex-row xl:items-center xl:gap-4',
        isNew && 'border-l-[3px] border-l-brand bg-brand/12',
      )}
    >
      <p className={cn('font-semibold text-foreground', COLUMNS.number)}>
        {`Versión ${String(version.number)}`}
        <VersionTags isCurrent={version.isCurrent} isNew={isNew} />
      </p>
      <p className={cn('tabular-nums text-secondary-foreground', COLUMNS.when)}>
        {byline.when}
        <span aria-hidden="true"> · </span>
        <span className="inline-flex items-center gap-1">
          <UserRound className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
          <span className="sr-only">, por </span>
          {byline.author}
        </span>
      </p>
      <OriginText version={version} />
      <p
        className={cn(
          'flex flex-wrap gap-x-2 tabular-nums text-foreground xl:flex-col',
          COLUMNS.size,
        )}
      >
        <span>
          <span className="xl:sr-only">Tamaño: </span>
          {formatBytes(version.sizeBytes)}
        </span>
        <span className="text-secondary-foreground">
          <SizeChangeText change={sizeChange(version, previousNumber)} />
        </span>
      </p>
      <div className={cn('mt-2 flex w-full gap-2 xl:mt-0', COLUMNS.actions)}>{actions}</div>
    </li>
  );
}

/** Encabezado visual de las columnas en escritorio; cada versión ya dice sus datos en texto. */
function ColumnHeader(): React.JSX.Element {
  return (
    <div
      aria-hidden="true"
      className="hidden border-t border-border bg-muted px-5 py-2.5 text-xs font-semibold uppercase tracking-wide text-secondary-foreground xl:flex xl:gap-4"
    >
      <span className={COLUMNS.number}>Versión</span>
      <span className={COLUMNS.when}>Fecha y autor</span>
      <span className={COLUMNS.origin}>Origen</span>
      <span className={COLUMNS.size}>Tamaño</span>
      <span className={COLUMNS.actions} />
    </div>
  );
}

/**
 * Historial de versiones con autoría (`VersionTimeline`, `ui-guidelines.md` §4; RF-29): lista ordenada de la más
 * reciente a la más antigua con número, «ACTUAL», fecha, autor, origen, tamaño y cambio en texto. Las acciones las pone
 * quien la usa. Columnas en escritorio (`xl`); por debajo, cada versión se apila con sus rótulos visibles.
 */
export function VersionTimeline({
  labelledBy,
  versions,
  viewerId,
  now,
  highlightedId = null,
  renderActions,
}: VersionTimelineProps): React.JSX.Element {
  return (
    <>
      <ColumnHeader />
      <ol aria-labelledby={labelledBy}>
        {versions.map((version, index) => (
          <VersionItem
            key={version.id}
            version={version}
            previousNumber={versions[index + 1]?.number ?? version.number - 1}
            byline={{
              when: dateTimeLabel(version.createdAt, now),
              author: authorLabel(version, viewerId),
            }}
            isNew={version.id === highlightedId}
            actions={renderActions(version)}
          />
        ))}
      </ol>
    </>
  );
}
