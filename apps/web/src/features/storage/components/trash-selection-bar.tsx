import { formatBytes } from '@nimbo/contracts';
import { RotateCcw } from 'lucide-react';
import * as React from 'react';

import { Button } from '../../../components/ui/button';

import { useReadOnlyAccount } from './space-provider';

export interface TrashSelectionBarProps {
  readonly count: number;
  readonly totalBytes: number;
  readonly busy: boolean;
  readonly onRestore: () => void;
  readonly onClear: () => void;
}

/** «Restaurar N»; deshabilitado en solo lectura (spec 010 CA-13, CA-14). */
function RestoreSelected({
  count,
  busy,
  onRestore,
}: Pick<TrashSelectionBarProps, 'count' | 'busy' | 'onRestore'>): React.JSX.Element {
  const { readOnly } = useReadOnlyAccount();
  return (
    <Button type="button" size="sm" loading={busy} onClick={onRestore} disabled={readOnly}>
      {busy ? null : <RotateCcw className="h-4 w-4" aria-hidden="true" />}
      {`Restaurar ${String(count)}`}
    </Button>
  );
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
      <RestoreSelected count={count} busy={busy} onRestore={onRestore} />
      <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={onClear}>
        Quitar selección
      </Button>
    </div>
  );
}
