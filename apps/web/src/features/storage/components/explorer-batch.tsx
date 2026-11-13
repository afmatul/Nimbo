'use client';

import type * as React from 'react';

import { ConfirmDestructiveDialog } from '../../../components/nimbo/confirm-destructive-dialog';
import type { BatchApi } from '../batch-api';
import { elementCount } from '../batch-outcome';
import { useBatchActions, type BatchActions } from '../hooks/use-batch-actions';
import type { LoadFolderContents } from '../hooks/use-folder-contents';
import type { NodeSelection } from '../hooks/use-node-selection';

import { BatchMoveDialog } from './batch-move-dialog';
import { BatchOutcomeAlert } from './batch-outcome-alert';
import { BatchShareDialog } from './batch-share-dialog';
import { SelectionBar } from './selection-bar';

export interface ExplorerBatchProps {
  readonly api: BatchApi;
  readonly selection: NodeSelection;
  /** Árbol de destino de «Mover». */
  readonly folderContents: LoadFolderContents;
  readonly onChanged: () => void;
}

function BatchDialogs({
  actions,
  selection,
  folderContents,
}: {
  readonly actions: BatchActions;
  readonly selection: NodeSelection;
  readonly folderContents: LoadFolderContents;
}): React.JSX.Element | null {
  const { dialog, pending } = actions;
  const close = (): void => actions.setDialog(null);
  const count = selection.selected.length;
  if (dialog === 'move') {
    const props = { selected: selection.selected, folderContents, pending, onClose: close };
    return <BatchMoveDialog {...props} onMove={(target) => void actions.move(target)} />;
  }
  if (dialog === 'share') {
    const onShare = (email: string, level: Parameters<BatchActions['share']>[1]) =>
      void actions.share(email, level);
    const props = { count, pending, error: actions.shareError, onClose: close };
    return <BatchShareDialog {...props} onShare={onShare} />;
  }
  return (
    <ConfirmDestructiveDialog
      open={dialog === 'trash'}
      onOpenChange={(open) => !open && close()}
      title={`¿Mover ${elementCount(count)} a la papelera?`}
      description="Podrás restaurarlos desde la Papelera mientras tu plan los conserve."
      confirmLabel="Mover a la papelera"
      pendingLabel="Moviendo…"
      pending={pending}
      onConfirm={() => void actions.trash()}
    />
  );
}

/** Barra de la selección múltiple, sus diálogos y el resultado de la última acción por lote, arriba de la lista. */
export function ExplorerBatch({
  api,
  selection,
  folderContents,
  onChanged,
}: ExplorerBatchProps): React.JSX.Element {
  const actions = useBatchActions({ api, selection, onChanged });
  return (
    <div className="space-y-3 empty:hidden">
      {actions.outcome === null ? null : (
        <BatchOutcomeAlert outcome={actions.outcome} onDismiss={() => actions.setOutcome(null)} />
      )}
      <SelectionBar
        count={selection.selected.length}
        pending={actions.pending}
        onOpen={actions.setDialog}
        onDownload={() => void actions.download()}
        onClear={selection.clear}
      />
      <BatchDialogs actions={actions} selection={selection} folderContents={folderContents} />
    </div>
  );
}
