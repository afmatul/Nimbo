import { formatBytes, type ClientFileMetadata } from '@nimbo/contracts';
import { CircleCheck, Trash2 } from 'lucide-react';
import type { JSX } from 'react';

import { FileTypeChip } from '../../../components/nimbo/file-type-chip';
import { Badge } from '../../../components/ui/badge';
import { DATE_LOCALE } from '../../../lib/format-date';
import { CHIP_TYPE_BY_KIND } from '../../storage/components/node-rows';
import { FILE_KIND_LABELS } from '../../storage/file-kind-label';

/**
 * Fechas absolutas con hora en la zona de quien consulta (mockup `backoffice/soporte`, decisión 7): Soporte las cruza
 * con lo que le cuenta el cliente.
 */
const dateTimeFormatter = new Intl.DateTimeFormat(DATE_LOCALE, {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
const dayFormatter = new Intl.DateTimeFormat(DATE_LOCALE, {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

const dateTime = (iso: string): string => dateTimeFormatter.format(new Date(iso));
const sizeOf = (file: ClientFileMetadata): string => formatBytes(Number(file.sizeBytes));

/** Columnas que pasan a otra celda en anchos menores: tipo, tamaño y creado solo desde `xl`; todo apilado bajo `sm`. */
const WIDE_ONLY = 'hidden xl:table-cell';
const FROM_SM = 'hidden sm:table-cell';
const CELL = 'px-3.5 py-3 align-middle';
const HEAD =
  'px-3.5 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground';

/** «Disponible» o «En papelera desde…» (006), siempre ícono y texto; la papelera en neutro, nunca en rojo. */
function FileStatus({ trashedAt }: { readonly trashedAt: string | null }): JSX.Element {
  if (trashedAt === null) {
    return (
      <Badge variant="success" className="gap-1">
        <CircleCheck className="h-3.5 w-3.5" aria-hidden="true" />
        Disponible
      </Badge>
    );
  }
  return (
    <div>
      <Badge variant="outline" className="gap-1 bg-card">
        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
        En papelera
      </Badge>{' '}
      <span className="mt-1 inline-block text-xs tabular-nums text-secondary-foreground">
        {`desde ${dayFormatter.format(new Date(trashedAt))}`}
      </span>
    </div>
  );
}

/** Nombre con su tipo; bajo `xl`, tipo y tamaño debajo; bajo `sm`, los cinco metadatos apilados. */
function NameCell({ file }: { readonly file: ClientFileMetadata }): JSX.Element {
  const kindAndSize = `${FILE_KIND_LABELS[file.kind]} · ${sizeOf(file)}`;
  return (
    <td className={CELL}>
      <div className="flex min-w-0 items-start gap-3 sm:items-center">
        <FileTypeChip fileType={CHIP_TYPE_BY_KIND[file.kind]} className="shrink-0" />
        <div className="min-w-0">
          <span className="block break-words font-medium text-foreground">{file.name}</span>
          <span className="hidden text-xs text-secondary-foreground sm:block xl:hidden">
            {kindAndSize}
          </span>
          <div className="mt-1.5 grid gap-1 text-xs tabular-nums text-secondary-foreground sm:hidden">
            <span>{kindAndSize}</span>
            <span>{`Modificado: ${dateTime(file.updatedAt)}`}</span>
            <span>{`Creado: ${dateTime(file.createdAt)}`}</span>
            <FileStatus trashedAt={file.trashedAt} />
          </div>
        </div>
      </div>
    </td>
  );
}

function FileRow({ file }: { readonly file: ClientFileMetadata }): JSX.Element {
  return (
    <tr className="border-b border-border last:border-b-0">
      <NameCell file={file} />
      <td className={`${CELL} ${WIDE_ONLY} text-secondary-foreground`}>
        {FILE_KIND_LABELS[file.kind]}
      </td>
      <td className={`${CELL} ${WIDE_ONLY} whitespace-nowrap tabular-nums`}>{sizeOf(file)}</td>
      <td className={`${CELL} ${WIDE_ONLY} whitespace-nowrap tabular-nums`}>
        {dateTime(file.createdAt)}
      </td>
      <td className={`${CELL} ${FROM_SM} whitespace-nowrap tabular-nums`}>
        {dateTime(file.updatedAt)}
        <span className="block text-xs text-secondary-foreground xl:hidden">{`Creado: ${dateTime(file.createdAt)}`}</span>
      </td>
      <td className={`${CELL} ${FROM_SM}`}>
        <FileStatus trashedAt={file.trashedAt} />
      </td>
    </tr>
  );
}

export interface ClientFilesTableProps {
  readonly clientName: string;
  readonly items: readonly ClientFileMetadata[];
}

/**
 * Metadatos de los archivos de un cliente (011 CA-13, RN-1; mockup `backoffice/soporte`): solo lectura, sin enlaces,
 * menús, selección ni vistas previas, en el orden de la API (última modificación primero).
 */
export function ClientFilesTable({ clientName, items }: ClientFilesTableProps): JSX.Element {
  return (
    <div className="mt-4 overflow-hidden rounded-lg border border-border bg-card shadow-card">
      <table className="w-full border-collapse text-sm text-secondary-foreground">
        <caption className="sr-only">{`Archivos de ${clientName}: metadatos, ordenados por última modificación, de la más reciente`}</caption>
        <thead className="hidden border-b border-border bg-background sm:table-header-group">
          <tr>
            <th scope="col" className={HEAD}>
              Nombre
            </th>
            <th scope="col" className={`${HEAD} ${WIDE_ONLY}`}>
              Tipo
            </th>
            <th scope="col" className={`${HEAD} ${WIDE_ONLY}`}>
              Tamaño
            </th>
            <th scope="col" className={`${HEAD} ${WIDE_ONLY}`}>
              Creado
            </th>
            <th scope="col" className={`${HEAD} ${FROM_SM}`}>
              Modificado
            </th>
            <th scope="col" className={`${HEAD} ${FROM_SM}`}>
              Estado
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((file) => (
            <FileRow key={file.id} file={file} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
