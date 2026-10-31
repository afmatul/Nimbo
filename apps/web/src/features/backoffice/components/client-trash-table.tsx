import { formatBytes, type TrashItem } from '@nimbo/contracts';
import { Folder } from 'lucide-react';
import type { JSX } from 'react';

import { FileTypeChip } from '../../../components/nimbo/file-type-chip';
import { Button } from '../../../components/ui/button';
import { CHIP_TYPE_BY_KIND } from '../../storage/components/node-rows';
import { FILE_KIND_LABELS } from '../../storage/file-kind-label';
import { dayText } from '../backoffice-dates';
import { locationText } from '../trash-notices';

/** Columnas que pasan a otra celda en anchos menores (mockup `papelera`, decisión 19). */
const FROM_SM = 'hidden sm:table-cell';
const FROM_LG = 'hidden lg:table-cell';
const FROM_XL = 'hidden xl:table-cell';
const CELL = 'px-3.5 py-3 align-middle max-sm:block max-sm:py-0';
const HEAD =
  'px-3.5 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground';

const kindLabelOf = (item: TrashItem): string =>
  item.kind === undefined ? 'Carpeta' : FILE_KIND_LABELS[item.kind];
const kindAndSizeOf = (item: TrashItem): string =>
  `${kindLabelOf(item)} · ${formatBytes(Number(item.sizeBytes))}`;
const originOf = (item: TrashItem): string => locationText(item.originalFolder?.name);

/** Archivo con el chip de su tipo; carpeta con el ícono de carpeta. Solo decorativos: el tipo va también en texto. */
function ItemIcon({ item }: { readonly item: TrashItem }): JSX.Element {
  if (item.kind !== undefined)
    return <FileTypeChip fileType={CHIP_TYPE_BY_KIND[item.kind]} className="shrink-0" />;
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-brand/10 text-primary">
      <Folder className="h-4 w-4" aria-hidden="true" />
    </span>
  );
}

/** Lo que no cabe en columnas: bajo `xl` tipo, tamaño y eliminado; bajo `lg` el origen; bajo `sm`, todo apilado. */
function NameDetails({ item }: { readonly item: TrashItem }): JSX.Element {
  return (
    <>
      <span className="hidden text-xs tabular-nums text-secondary-foreground sm:block xl:hidden">
        {`${kindAndSizeOf(item)} · Eliminado: ${dayText(item.deletedAt)}`}
      </span>
      <span className="hidden text-xs text-secondary-foreground sm:block lg:hidden">
        {`Estaba en: ${originOf(item)}`}
      </span>
      <div className="mt-1.5 grid gap-1 text-xs tabular-nums text-secondary-foreground sm:hidden">
        <span>{kindAndSizeOf(item)}</span>
        <span>{`Eliminado: ${dayText(item.deletedAt)}`}</span>
        <span>{`Se purga: ${dayText(item.purgeAt)}`}</span>
        <span>{`Estaba en: ${originOf(item)}`}</span>
      </div>
    </>
  );
}

function NameCell({ item }: { readonly item: TrashItem }): JSX.Element {
  return (
    <td className={`${CELL} max-sm:pt-3`}>
      <div className="flex min-w-0 items-start gap-3 sm:items-center">
        <ItemIcon item={item} />
        <div className="min-w-0">
          <span className="block break-words font-medium text-foreground">{item.name}</span>
          <NameDetails item={item} />
        </div>
      </div>
    </td>
  );
}

interface TrashRowProps {
  readonly item: TrashItem;
  readonly onRestore: (item: TrashItem, opener: HTMLButtonElement) => void;
}

/** La única acción de la fila; su botón es el `opener` al que vuelve el foco. */
function RestoreCell({ item, onRestore }: TrashRowProps): JSX.Element {
  return (
    <td className={`${CELL} max-sm:pb-3 sm:text-right`}>
      <Button
        type="button"
        variant="outline"
        className="max-sm:w-full"
        aria-label={`Restaurar ${item.name}`}
        onClick={(event) => onRestore(item, event.currentTarget)}
      >
        Restaurar
      </Button>
    </td>
  );
}

function TrashRow({ item, onRestore }: TrashRowProps): JSX.Element {
  return (
    <tr className="border-b border-border last:border-b-0 max-sm:flex max-sm:flex-col">
      <NameCell item={item} />
      <td className={`${CELL} ${FROM_XL}`}>{kindLabelOf(item)}</td>
      <td className={`${CELL} ${FROM_XL} whitespace-nowrap tabular-nums`}>
        {formatBytes(Number(item.sizeBytes))}
      </td>
      <td className={`${CELL} ${FROM_XL} whitespace-nowrap tabular-nums`}>
        {dayText(item.deletedAt)}
      </td>
      <td className={`${CELL} ${FROM_SM} whitespace-nowrap tabular-nums`}>
        {dayText(item.purgeAt)}
      </td>
      <td className={`${CELL} ${FROM_LG} break-words`}>{originOf(item)}</td>
      <RestoreCell item={item} onRestore={onRestore} />
    </tr>
  );
}

const COLUMNS: readonly (readonly [string, string])[] = [
  ['Nombre', ''],
  ['Tipo', FROM_XL],
  ['Tamaño', FROM_XL],
  ['Eliminado', FROM_XL],
  ['Se purga', FROM_SM],
  ['Ubicación original', FROM_LG],
  ['Acción', FROM_SM],
];

function TrashHead(): JSX.Element {
  return (
    <thead className="hidden border-b border-border bg-background sm:table-header-group">
      <tr>
        {COLUMNS.map(([label, visibility]) => (
          <th key={label} scope="col" className={`${HEAD} ${visibility}`.trim()}>
            {label}
          </th>
        ))}
      </tr>
    </thead>
  );
}

export interface ClientTrashTableProps {
  readonly clientName: string;
  readonly items: readonly TrashItem[];
  /** `opener` es el botón de la fila: al cerrar el diálogo el foco vuelve ahí, o a la lista si la fila ya no está. */
  readonly onRestore: (item: TrashItem, opener: HTMLButtonElement) => void;
}

/**
 * Raíces de la papelera de un cliente (011b CA-10, RN-3; mockup `backoffice/soporte`, decisiones 14 y 19): archivos y
 * carpetas con su fecha de purga. No se abren, descargan ni previsualizan y no muestran versiones: la única acción es
 * «Restaurar».
 */
export function ClientTrashTable({
  clientName,
  items,
  onRestore,
}: ClientTrashTableProps): JSX.Element {
  return (
    <div className="mt-4 overflow-hidden rounded-lg border border-border bg-card shadow-card">
      <table className="w-full border-collapse text-sm text-secondary-foreground">
        <caption className="sr-only">{`Papelera de ${clientName}: raíces de archivos y carpetas, con su fecha de purga`}</caption>
        <TrashHead />
        <tbody>
          {items.map((item) => (
            <TrashRow key={item.id} item={item} onRestore={onRestore} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
