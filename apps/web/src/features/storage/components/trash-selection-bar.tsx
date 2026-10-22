import { formatBytes } from '@nimbo/contracts';
import { RotateCcw } from 'lucide-react';
import * as React from 'react';

import { Button } from '../../../components/ui/button';

export interface TrashSelectionBarProps {
  readonly count: number;
  readonly totalBytes: number;
  readonly busy: boolean;
  readonly onRestore: () => void;
  readonly onClear: () => void;
}

/** Selección de la papelera: solo restaura (decisión 11 del mockup); eliminar definitivamente es por elemento. */
export function TrashSelectionBar({
  count,
  totalBytes,
  busy,
  onRestore,
  onClear,
}: TrashSelectionBarProps): React.JSX.Element | null {
  if (count === 0) return null;
  return (
    <div
      role="region"
      aria-label="Selección"
      className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted px-4 py-2"
    >
      <p className="mr-auto text-sm tabular-nums text-foreground">
        <strong className="font-semibold">
          {count === 1 ? '1 seleccionado' : `${String(count)} seleccionados`}
        </strong>
        {` · ${formatBytes(totalBytes)}`}
      </p>
      <Button type="button" size="sm" loading={busy} onClick={onRestore}>
        {busy ? null : <RotateCcw className="h-4 w-4" aria-hidden="true" />}
        {`Restaurar ${String(count)}`}
      </Button>
      <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={onClear}>
        Quitar selección
      </Button>
    </div>
  );
}
