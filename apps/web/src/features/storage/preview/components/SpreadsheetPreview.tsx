'use client';

import { Info } from 'lucide-react';
import * as React from 'react';

import { cn } from '../../../../lib/utils';
import {
  useOoxmlReading,
  type OoxmlReaderProps,
  type OoxmlReading,
} from '../hooks/use-ooxml-reading';
import type { SheetState, SheetSummary } from '../readers/xlsx-reader';
import type { CellProjection, RowProjection, SheetProjection } from '../readers/xlsx-sheet';

import { EmptyFileNotice, UnitNavigation } from './ReaderNavigation';

type Workbook = OoxmlReading<'xlsx'>;
type SheetWindows = ReturnType<typeof useSheetWindows>;
type TabIds = { readonly tab: (index: number) => string; readonly panel: string };

const STATE_LABELS: Readonly<Record<Exclude<SheetState, 'visible'>, string>> = {
  hidden: 'Oculta',
  veryHidden: 'Muy oculta',
};
const RIGHT_ALIGNED: ReadonlySet<CellProjection['type']> = new Set(['number', 'percent']);
const FOCUS_RING =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';
const NO_CELLS = 'Esta hoja no tiene celdas para mostrar.';
const SKIPPED_COLUMNS =
  'Solo se muestran las columnas con datos en estas filas; cada encabezado indica su columna real.';

function columnName(column: number): string {
  let name = '';
  for (let rest = column; rest > 0; rest = Math.floor((rest - 1) / 26))
    name = String.fromCharCode(65 + ((rest - 1) % 26)) + name;
  return name;
}

/** Solo columnas con alguna celda en esta ventana: la letra conserva la posición real. */
function usedColumns(rows: readonly RowProjection[]): number[] {
  const columns = new Set<number>();
  for (const row of rows) for (const cell of row.cells) columns.add(cell.column);
  return [...columns].sort((a, b) => a - b);
}

function targetTab(key: string, index: number, total: number): number | undefined {
  if (key === 'ArrowRight') return (index + 1) % total;
  if (key === 'ArrowLeft') return (index - 1 + total) % total;
  if (key === 'Home') return 0;
  return key === 'End' ? total - 1 : undefined;
}

type SheetTabsProps = {
  readonly sheets: readonly SheetSummary[];
  readonly selected: number;
  readonly ids: TabIds;
  readonly onSelect: (index: number) => void;
};

type SheetTabProps = {
  readonly sheet: SheetSummary;
  readonly active: boolean;
  readonly tabId: string;
  readonly panelId: string;
  readonly onSelect: () => void;
  readonly ref: React.Ref<HTMLButtonElement>;
};

function SheetTab(props: SheetTabProps): React.JSX.Element {
  const { sheet, active, tabId, panelId, onSelect, ref } = props;
  return (
    <button
      ref={ref}
      type="button"
      role="tab"
      id={tabId}
      aria-selected={active}
      aria-controls={active ? panelId : undefined}
      tabIndex={active ? 0 : -1}
      onClick={onSelect}
      className={cn(
        'inline-flex min-h-11 shrink-0 items-center gap-2 rounded-t-md px-3 text-sm',
        FOCUS_RING,
        active
          ? 'bg-accent font-medium text-foreground'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      <span className="whitespace-nowrap">{sheet.name}</span>
      {sheet.state === 'visible' ? null : (
        <span className="rounded-sm border border-border px-1.5 text-xs text-foreground">
          {STATE_LABELS[sheet.state]}
        </span>
      )}
    </button>
  );
}

/** Patrón tablist: flechas, Inicio y Fin; la selección sigue al foco y cada hoja pide su unidad. */
function useTabKeys({ selected, sheets, onSelect }: SheetTabsProps) {
  const tabs = React.useRef<(HTMLButtonElement | null)[]>([]);
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    const target = targetTab(event.key, selected, sheets.length);
    if (target === undefined) return;
    event.preventDefault();
    onSelect(target);
    tabs.current[target]?.focus();
  };
  return { tabs, onKeyDown };
}

function SheetTabs(props: SheetTabsProps): React.JSX.Element {
  const { tabs, onKeyDown } = useTabKeys(props);
  return (
    <div
      role="tablist"
      aria-label="Hojas del libro"
      onKeyDown={onKeyDown}
      className="flex gap-1 overflow-x-auto border-b border-border"
    >
      {props.sheets.map((sheet, index) => (
        <SheetTab
          key={`${index}:${sheet.name}`}
          ref={(element) => {
            tabs.current[index] = element;
          }}
          sheet={sheet}
          active={index === props.selected}
          tabId={props.ids.tab(index)}
          panelId={props.ids.panel}
          onSelect={() => props.onSelect(index)}
        />
      ))}
    </div>
  );
}

function MissingCacheNote({ count }: { readonly count: number }): React.JSX.Element {
  const subject = count === 1 ? '1 celda tiene una fórmula' : `${count} celdas tienen una fórmula`;
  return (
    <div
      role="note"
      className="flex gap-2 rounded-md border border-border bg-muted p-3 text-sm text-foreground"
    >
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
      <p>
        <strong>En estas filas, {subject} sin valor guardado.</strong> Nimbo muestra los valores que
        guardó el archivo y no recalcula fórmulas. Para ver el resultado, abre el archivo en tu hoja
        de cálculo y guárdalo de nuevo.
      </p>
    </div>
  );
}

function SheetCell({ cell }: { readonly cell: CellProjection | undefined }): React.JSX.Element {
  const noCache = cell?.type === 'no-cache';
  const aligned = cell !== undefined && RIGHT_ALIGNED.has(cell.type);
  return (
    <td
      className={cn(
        'border-b border-r border-border px-3 py-2 align-top text-foreground',
        aligned && 'text-right tabular-nums',
        noCache && 'italic text-muted-foreground',
      )}
    >
      <div className="min-w-24 max-w-xs whitespace-pre-wrap break-words">
        {noCache ? <Info className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" /> : null}
        {cell?.text ?? ''}
      </div>
    </td>
  );
}

const HEADER_CELL = 'bg-muted px-3 py-2 text-xs font-medium text-secondary-foreground';
const ROW_HEADER = cn(HEADER_CELL, 'sticky left-0 border-b border-r border-border text-right');

function SheetRow(props: { readonly row: RowProjection; readonly columns: readonly number[] }) {
  const cells = new Map(props.row.cells.map((cell) => [cell.column, cell]));
  return (
    <tr>
      <th scope="row" className={cn(ROW_HEADER, 'tabular-nums')}>
        {props.row.row}
      </th>
      {props.columns.map((column) => (
        <SheetCell key={column} cell={cells.get(column)} />
      ))}
    </tr>
  );
}

function GridHeader({ columns }: { readonly columns: readonly number[] }) {
  return (
    <thead>
      <tr>
        <th scope="col" className={ROW_HEADER}>
          <span className="sr-only">Fila</span>
        </th>
        {columns.map((column) => (
          <th key={column} scope="col" className={cn(HEADER_CELL, 'border-b border-border')}>
            {columnName(column)}
          </th>
        ))}
      </tr>
    </thead>
  );
}

type SheetGridProps = {
  readonly name: string;
  readonly unit: SheetProjection;
  readonly columns: readonly number[];
};

function SheetGrid({ name, unit, columns }: SheetGridProps) {
  return (
    <div
      role="region"
      aria-label={`Celdas de la hoja ${name}`}
      tabIndex={0}
      className={cn('max-w-full overflow-x-auto rounded-md border border-border', FOCUS_RING)}
    >
      <table className="min-w-full border-collapse text-left text-sm">
        <caption className="sr-only">Hoja {name}: valores guardados en el archivo</caption>
        <GridHeader columns={columns} />
        <tbody>
          {/* Por posición: un archivo malformado puede repetir el número de fila. */}
          {unit.rows.map((row, index) => (
            <SheetRow key={index} row={row} columns={columns} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

type WindowPath = { readonly offsets: readonly number[]; readonly position: number };
const FIRST_WINDOW: WindowPath = { offsets: [0], position: 0 };

/**
 * Ventanas por offsets del reader: siguiente usa `nextOffset` y el recorrido recuerda las ya vistas.
 * Mientras carga, los controles conservan su estado (el foco no se pierde) y no piden otra unidad.
 */
function useSheetWindows(reading: Workbook) {
  const [path, setPath] = React.useState<WindowPath>(FIRST_WINDOW);
  const { index } = reading.selection;
  const known = reading.lastUnit?.index === index ? reading.lastUnit : null;
  const go = (next: WindowPath): void => {
    const offset = next.offsets[next.position];
    if (reading.unit === null || offset === undefined) return;
    setPath(next);
    reading.select({ index, offset });
  };
  const openSheet = (target: number): void => {
    if (target === index) return;
    setPath(FIRST_WINDOW);
    reading.select({ index: target, offset: 0 });
  };
  const next = (): void => {
    const ahead = path.offsets[path.position + 1] ?? known?.nextOffset;
    if (ahead === undefined) return;
    const seen = path.position + 1 < path.offsets.length;
    go({ offsets: seen ? path.offsets : [...path.offsets, ahead], position: path.position + 1 });
  };
  const previous = (): void => go({ ...path, position: path.position - 1 });
  const hasNext = path.position < path.offsets.length - 1 || known?.nextOffset !== undefined;
  return { openSheet, next, previous, hasPrevious: path.position > 0, hasNext };
}

function rowsStatus(unit: SheetProjection | null): string {
  const first = unit?.rows[0]?.row;
  const last = unit?.rows[unit.rows.length - 1]?.row;
  return first === undefined || last === undefined ? 'Cargando filas…' : `Filas ${first} a ${last}`;
}

function SheetCells(props: { readonly name: string; readonly unit: SheetProjection }) {
  if (props.unit.rows.length === 0) return <p className="text-muted-foreground">{NO_CELLS}</p>;
  const columns = usedColumns(props.unit.rows);
  // Sin columnas vacías generadas: si hay saltos, se dice; las letras conservan la posición real.
  const skipped = columns.some((column, index) => column !== index + 1);
  return (
    <>
      {props.unit.missingCache > 0 ? <MissingCacheNote count={props.unit.missingCache} /> : null}
      {skipped ? <p className="text-sm text-muted-foreground">{SKIPPED_COLUMNS}</p> : null}
      <SheetGrid name={props.name} unit={props.unit} columns={columns} />
    </>
  );
}

type SheetPanelProps = {
  readonly sheet: SheetSummary;
  readonly unit: SheetProjection | null;
  readonly windows: SheetWindows;
};

function SheetPanel({ sheet, unit, windows }: SheetPanelProps): React.JSX.Element {
  // Gráficos, diálogos y macros: nunca se dibujan ni se ejecutan.
  if (sheet.type !== 'worksheet') return <p className="text-muted-foreground">{NO_CELLS}</p>;
  const paged = windows.hasPrevious || windows.hasNext;
  return (
    <div className="space-y-4">
      {unit === null ? (
        <p role={paged ? undefined : 'status'}>Cargando celdas…</p>
      ) : (
        <SheetCells name={sheet.name} unit={unit} />
      )}
      {paged ? (
        <UnitNavigation
          label="Filas de la hoja"
          status={rowsStatus(unit)}
          hasPrevious={windows.hasPrevious}
          hasNext={windows.hasNext}
          previous={windows.previous}
          next={windows.next}
          previousLabel="Filas anteriores"
          nextLabel="Filas siguientes"
        />
      ) : null}
    </div>
  );
}

function WorkbookView(props: {
  readonly reading: Workbook;
  readonly sheets: readonly SheetSummary[];
}) {
  const { reading, sheets } = props;
  const base = React.useId();
  const ids: TabIds = { tab: (index) => `${base}-hoja-${index}`, panel: `${base}-panel` };
  const windows = useSheetWindows(reading);
  const { index } = reading.selection;
  const sheet = sheets[index];
  return (
    <div className="min-w-0 space-y-4">
      <SheetTabs sheets={sheets} selected={index} ids={ids} onSelect={windows.openSheet} />
      <p className="text-sm text-muted-foreground tabular-nums">
        Hoja {index + 1} de {sheets.length} · valores guardados
      </p>
      <div role="tabpanel" id={ids.panel} aria-labelledby={ids.tab(index)} className="min-w-0">
        {sheet === undefined ? null : (
          <SheetPanel sheet={sheet} unit={reading.unit} windows={windows} />
        )}
      </div>
    </div>
  );
}

function SpreadsheetReading(props: OoxmlReaderProps): React.JSX.Element | null {
  const reading = useOoxmlReading('xlsx', props);
  if (reading.preview === null) return null;
  if (reading.preview.sheets.length === 0) return <EmptyFileNotice />;
  return <WorkbookView reading={reading} sheets={reading.preview.sheets} />;
}

/** Valores ya formateados por el reader: no se recalculan fórmulas ni se reinterpretan fechas. */
export function SpreadsheetPreview(props: OoxmlReaderProps): React.JSX.Element {
  return <SpreadsheetReading key={props.url} {...props} />;
}
