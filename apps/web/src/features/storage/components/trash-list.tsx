'use client';

import { formatBytes, type TrashItem } from '@nimbo/contracts';
import { Clock, EllipsisVertical, Folder, Loader2, RotateCcw, Trash2 } from 'lucide-react';
import * as React from 'react';

import { FileTypeChip } from '../../../components/nimbo/file-type-chip';
import { Button } from '../../../components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../../components/ui/dropdown-menu';
import { cn } from '../../../lib/utils';
import { CHIP_TYPE_BY_KIND } from '../file-type';
import {
  daysLeft,
  deletedAtLabel,
  deletedPhrase,
  isPurgeDue,
  PURGE_SOON_DAYS,
  remainingLabel,
} from '../trash-dates';

import { originalPlaceName } from './restore-result';
import { useReadOnlyAccount } from './space-provider';

export interface TrashListProps {
  readonly items: readonly TrashItem[];
  /** Momento de la lectura: los días restantes se calculan desde `purgeAt` (plan 006 §4). */
  readonly now: number;
  /** «Vaciar papelera» aceptado (`202`): todas las filas «Vaciando…» y sin acciones (CA-18). */
  readonly emptying: boolean;
  /** Una restauración en curso: las acciones esperan. */
  readonly busy: boolean;
  readonly selectedIds: ReadonlySet<string>;
  readonly onSelectionChange: (ids: ReadonlySet<string>) => void;
  readonly onRestore: (item: TrashItem) => void;
  readonly onPurge: (item: TrashItem) => void;
}

const CHECKBOX_CLASS =
  'h-6 w-6 shrink-0 cursor-pointer accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-45';

function withToggled(ids: ReadonlySet<string>, id: string): ReadonlySet<string> {
  const next = new Set(ids);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

/** Elementos de la papelera, de lo más reciente a lo más antiguo; sin descarga ni vista previa (CA-12). */
export function TrashList({
  items,
  now,
  emptying,
  busy,
  selectedIds,
  onSelectionChange,
  onRestore,
  onPurge,
}: TrashListProps): React.JSX.Element {
  const selectable = items.filter((item) => !emptying && !isPurgeDue(item.purgeAt, now));
  const allSelected = selectable.length > 0 && selectable.every((item) => selectedIds.has(item.id));

  const toggleAll = (): void =>
    onSelectionChange(new Set(allSelected ? [] : selectable.map((item) => item.id)));

  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
        <table className="w-full table-fixed text-sm">
          <caption className="sr-only">
            Elementos en la papelera, de lo más reciente a lo más antiguo
          </caption>
          <thead className="hidden border-b border-border text-left text-xs font-medium text-muted-foreground lg:table-header-group">
            <tr>
              <th scope="col" className="w-14 px-4 py-2">
                <input
                  type="checkbox"
                  className={CHECKBOX_CLASS}
                  aria-label="Seleccionar todos los elementos de esta página"
                  checked={allSelected}
                  disabled={selectable.length === 0}
                  onChange={toggleAll}
                />
              </th>
              <th scope="col" className="px-2 py-2">
                Nombre
              </th>
              <th scope="col" className="w-44 px-2 py-2">
                Ubicación original
              </th>
              <th scope="col" className="w-24 px-2 py-2">
                Tamaño
              </th>
              <th scope="col" className="w-28 px-2 py-2">
                Eliminado
              </th>
              <th scope="col" className="w-32 px-2 py-2">
                Días restantes
              </th>
              <th scope="col" className="w-48 px-2 py-2">
                <span className="sr-only">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {items.map((item) => (
              <TrashRow
                key={item.id}
                item={item}
                now={now}
                purging={emptying || isPurgeDue(item.purgeAt, now)}
                busy={busy}
                selected={selectedIds.has(item.id)}
                onToggle={() => onSelectionChange(withToggled(selectedIds, item.id))}
                onRestore={() => onRestore(item)}
                onPurge={() => onPurge(item)}
              />
            ))}
          </tbody>
        </table>
      </div>
      <p className="px-1 text-xs tabular-nums text-secondary-foreground">
        {items.length === 1 ? '1 elemento' : `${String(items.length)} elementos`}
      </p>
    </div>
  );
}

interface TrashRowProps {
  readonly item: TrashItem;
  readonly now: number;
  readonly purging: boolean;
  readonly busy: boolean;
  readonly selected: boolean;
  readonly onToggle: () => void;
  readonly onRestore: () => void;
  readonly onPurge: () => void;
}

function TrashRow({
  item,
  now,
  purging,
  busy,
  selected,
  onToggle,
  onRestore,
  onPurge,
}: TrashRowProps): React.JSX.Element {
  const { readOnly } = useReadOnlyAccount();
  const days = daysLeft(item.purgeAt, now);
  const deleted = deletedAtLabel(item.deletedAt, now);
  const place = originalPlaceName(item);
  const size = formatBytes(item.sizeBytes);
  return (
    <tr className={cn('h-14', selected && 'bg-accent')}>
      <td
        className={cn(
          'w-14 border-l-3 px-4 py-2 align-middle',
          selected ? 'border-l-brand' : 'border-l-transparent',
        )}
      >
        <input
          type="checkbox"
          className={CHECKBOX_CLASS}
          aria-label={`Seleccionar ${item.name}`}
          checked={selected}
          disabled={purging}
          onChange={onToggle}
        />
      </td>
      <td className="px-2 py-2">
        <span className="flex min-w-0 items-center gap-3">
          <NodeIcon item={item} />
          <span className="flex min-w-0 flex-col">
            <span className="break-words font-medium text-foreground lg:truncate" title={item.name}>
              {item.name}
            </span>
            {item.type === 'folder' ? (
              <span className="text-xs text-secondary-foreground">Carpeta</span>
            ) : null}
            <span className="text-xs tabular-nums text-secondary-foreground lg:hidden">
              {`${place} · ${size}`}
            </span>
            <span className="text-xs tabular-nums text-secondary-foreground lg:hidden">
              {purging ? (
                <PurgingLabel />
              ) : (
                <>
                  {`${deletedPhrase(item.deletedAt, now)} · `}
                  <DaysLeft days={days} text={remainingLabel(days)} />
                </>
              )}
            </span>
          </span>
        </span>
      </td>
      <td
        className="hidden truncate px-2 py-2 text-secondary-foreground lg:table-cell"
        title={place}
      >
        {place}
      </td>
      <td className="hidden px-2 py-2 tabular-nums text-secondary-foreground lg:table-cell">
        {size}
      </td>
      <td className="hidden px-2 py-2 tabular-nums text-secondary-foreground lg:table-cell">
        <time dateTime={item.deletedAt}>{deleted}</time>
      </td>
      <td className="hidden px-2 py-2 tabular-nums text-secondary-foreground lg:table-cell">
        {purging ? (
          <PurgingLabel />
        ) : (
          <DaysLeft days={days} text={days === 1 ? '1 día' : `${String(days)} días`} />
        )}
      </td>
      <td className="w-14 px-2 py-2 text-right lg:w-auto">
        {purging ? null : (
          <span className="flex items-center justify-end gap-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="hidden lg:inline-flex"
              aria-label={`Restaurar ${item.name}`}
              disabled={busy || readOnly}
              onClick={onRestore}
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              Restaurar
            </Button>
            <TrashRowMenu name={item.name} busy={busy} onRestore={onRestore} onPurge={onPurge} />
          </span>
        )}
      </td>
    </tr>
  );
}

function NodeIcon({ item }: { readonly item: TrashItem }): React.JSX.Element {
  if (item.type === 'folder') {
    return (
      <span className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-md bg-brand/10 text-primary lg:flex">
        <Folder className="h-4 w-4" aria-hidden="true" />
      </span>
    );
  }
  return (
    <FileTypeChip
      fileType={CHIP_TYPE_BY_KIND[item.kind ?? 'otro']}
      className="hidden shrink-0 lg:flex"
    />
  );
}

/** ≤ 7 días: reloj y texto `warning-foreground` (5.20:1), no solo color (mockup, cambio 5). */
function DaysLeft({
  days,
  text,
}: {
  readonly days: number;
  readonly text: string;
}): React.JSX.Element {
  if (days > PURGE_SOON_DAYS) return <>{text}</>;
  return (
    <span className="inline-flex items-center gap-1 font-semibold text-warning-foreground">
      <Clock className="h-3.5 w-3.5" aria-hidden="true" />
      {text}
    </span>
  );
}

function PurgingLabel(): React.JSX.Element {
  return (
    <span className="inline-flex items-center gap-1 text-secondary-foreground">
      <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
      Vaciando…
    </span>
  );
}

/** Menú ⋮: «Restaurar» y «Eliminar definitivamente» (el rojo queda solo para lo definitivo, spec 006 §6). */
function TrashRowMenu({
  name,
  busy,
  onRestore,
  onPurge,
}: {
  readonly name: string;
  readonly busy: boolean;
  readonly onRestore: () => void;
  readonly onPurge: () => void;
}): React.JSX.Element {
  const { readOnly } = useReadOnlyAccount();
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="shrink-0 text-secondary-foreground"
          aria-label={`Acciones de ${name}`}
          disabled={busy}
        >
          <EllipsisVertical className="h-5 w-5" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={onRestore} disabled={readOnly}>
          <RotateCcw className="h-4 w-4 text-secondary-foreground" aria-hidden="true" />
          Restaurar
        </DropdownMenuItem>
        <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={onPurge}>
          <Trash2 className="h-4 w-4" aria-hidden="true" />
          Eliminar definitivamente
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
