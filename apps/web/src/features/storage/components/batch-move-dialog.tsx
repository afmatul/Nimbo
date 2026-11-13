'use client';

import type { NodeSummary } from '@nimbo/contracts';
import * as React from 'react';

import { Button } from '../../../components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../../../components/ui/dialog';
import type { LoadFolderContents } from '../hooks/use-folder-contents';
import { folderIdOf, TREE_ROOT, useFolderTree, type FolderTree } from '../hooks/use-folder-tree';
import { useTreeFocus } from '../hooks/use-tree-focus';

import { MoveFolderTree } from './move-folder-tree';

const NO_OPEN_PATH: readonly never[] = [];

export interface BatchMoveDialogProps {
  readonly selected: readonly NodeSummary[];
  readonly folderContents: LoadFolderContents;
  readonly pending: boolean;
  readonly onMove: (targetFolderId: string | null) => void;
  readonly onClose: () => void;
}

/** Una carpeta seleccionada y lo que tiene dentro no pueden ser el destino (como en «Mover a…», 006 CA-8). */
function disabledReasonOf(tree: FolderTree, selected: readonly NodeSummary[]) {
  const folders = selected.filter((node) => node.type === 'folder');
  return (key: string): string | null => {
    if (folders.some((folder) => folder.id === key)) return 'Carpeta que mueves';
    return folders.some((folder) => tree.isWithin(key, folder.id)) ? 'Dentro de la carpeta' : null;
  };
}

/** «Mover» de la selección: elige el destino en el árbol de carpetas y mueve todo con un `POST /nodes/batch/move`. */
export function BatchMoveDialog(props: BatchMoveDialogProps): React.JSX.Element {
  const tree = useFolderTree(props.folderContents, NO_OPEN_PATH);
  const [target, setTarget] = React.useState<string | null>(null);
  const { focused, focusItem, itemRef } = useTreeFocus(TREE_ROOT);
  const disabledReason = disabledReasonOf(tree, props.selected);
  const select = (key: string): void => {
    if (disabledReason(key) === null) setTarget(key);
  };
  return (
    <Dialog open onOpenChange={(open) => !open && !props.pending && props.onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{`Mover ${String(props.selected.length)} elementos`}</DialogTitle>
          <DialogDescription>Elige la carpeta de destino.</DialogDescription>
        </DialogHeader>
        <MoveFolderTree
          tree={tree}
          selected={target}
          focused={focused}
          disabledReason={disabledReason}
          newFolder={null}
          itemRef={itemRef}
          onFocusItem={focusItem}
          onSelect={select}
        />
        <MoveActions {...props} target={target} />
      </DialogContent>
    </Dialog>
  );
}

function MoveActions({
  target,
  pending,
  onMove,
}: Pick<BatchMoveDialogProps, 'pending' | 'onMove'> & { readonly target: string | null }) {
  return (
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <DialogClose asChild>
        <Button type="button" variant="outline" disabled={pending}>
          Cancelar
        </Button>
      </DialogClose>
      <Button
        type="button"
        loading={pending}
        disabled={target === null}
        onClick={() => target !== null && onMove(folderIdOf(target))}
      >
        {pending ? 'Moviendo…' : 'Mover aquí'}
      </Button>
    </div>
  );
}
