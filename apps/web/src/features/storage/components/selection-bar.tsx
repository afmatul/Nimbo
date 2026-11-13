import { Download, FolderInput, Share2, Trash2, type LucideIcon } from 'lucide-react';
import type * as React from 'react';

import { Button } from '../../../components/ui/button';
import type { BatchDialog } from '../hooks/use-batch-actions';

import { useReadOnlyAccount } from './space-provider';

export interface SelectionBarProps {
  readonly count: number;
  readonly pending: boolean;
  readonly onOpen: (dialog: BatchDialog) => void;
  readonly onDownload: () => void;
  readonly onClear: () => void;
}

/**
 * Acciones que abren un diálogo y si la bloquea la solo lectura (010 CA-13, CA-14): compartir y mover sí; mandar a la
 * papelera no, como «Mover a la papelera» de cada fila y `POST /nodes/batch/delete`.
 */
const DIALOG_ACTIONS: readonly (readonly [BatchDialog, string, LucideIcon, boolean])[] = [
  ['share', 'Compartir', Share2, true],
  ['move', 'Mover', FolderInput, true],
  ['trash', 'Eliminar', Trash2, false],
];

/**
 * Barra contextual de la selección múltiple (mockup p. 12): cuántos hay y Compartir, Descargar, Mover y Eliminar.
 * Solo aparece con algo seleccionado.
 */
export function SelectionBar({
  count,
  pending,
  onOpen,
  onDownload,
  onClear,
}: SelectionBarProps): React.JSX.Element | null {
  const { readOnly } = useReadOnlyAccount();
  if (count === 0) return null;
  return (
    <div
      role="region"
      aria-label="Selección"
      className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted px-4 py-2"
    >
      <p className="mr-auto text-sm font-semibold tabular-nums text-foreground">
        {count === 1 ? '1 seleccionado' : `${String(count)} seleccionados`}
      </p>
      <Button type="button" variant="outline" size="sm" disabled={pending} onClick={onDownload}>
        <Download className="h-4 w-4" aria-hidden="true" />
        Descargar
      </Button>
      {DIALOG_ACTIONS.map(([dialog, label, Icon, blockedWhenReadOnly]) => (
        <Button
          key={dialog}
          type="button"
          variant="outline"
          size="sm"
          disabled={pending || (readOnly && blockedWhenReadOnly)}
          onClick={() => onOpen(dialog)}
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
          {label}
        </Button>
      ))}
      <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={onClear}>
        Quitar selección
      </Button>
    </div>
  );
}
