'use client';

import {
  STORAGE_ERROR_CODES,
  type CreateFolderInput,
  type FileSummary,
  type FolderRef,
  type FolderSummary,
  type MoveFileRequest,
  type MoveFolderInput,
  type NodeSummary,
} from '@nimbo/contracts';
import { AlertCircle, FolderPlus, Info } from 'lucide-react';
import * as React from 'react';

import { Alert } from '../../../components/ui/alert';
import { Button } from '../../../components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../../../components/ui/dialog';
import { folderMoveConflictMessage, storageMessage } from '../../../lib/error-catalog';
import type { LoadFolderContents } from '../hooks/use-folder-contents';
import { TREE_ROOT, useFolderTree, type FolderTree } from '../hooks/use-folder-tree';
import { StorageRequestError } from '../storage-request-error';

import { folderNameFailureOf, storedNameOf, validateFolderName } from './folder-name-failure';
import { MoveFolderTree } from './move-folder-tree';
import { NameConflictDialog, suggestedNameOf } from './name-conflict-dialog';
import { TreeNewFolderField } from './tree-new-folder-field';

/** Texto aprobado por Adrián (2026-09-30) para la red caída o un `5xx` al crear desde el árbol. */
const CREATE_NETWORK_FAILURE = 'No pudimos crear la carpeta. Inténtalo de nuevo.';
const CHOOSE_DESTINATION = 'Elige la carpeta de destino.';
const FOLDER_HINT = 'No puedes mover una carpeta dentro de sí misma ni de sus subcarpetas.';
const CURRENT_LOCATION = 'Ubicación actual';
const MOVED_FOLDER = 'Carpeta que mueves';
const INSIDE_MOVED_FOLDER = 'Dentro de la carpeta';

export interface MoveDialogProps {
  readonly node: NodeSummary;
  /** Migas de la ubicación del elemento (las del listado abierto); vacías en la raíz. */
  readonly breadcrumbs: readonly FolderRef[];
  readonly folderContents: LoadFolderContents;
  readonly createFolder: (body: CreateFolderInput) => Promise<FolderSummary>;
  readonly moveFile: (fileId: string, body: MoveFileRequest) => Promise<FileSummary>;
  readonly moveFolder: (folderId: string, body: MoveFolderInput) => Promise<FolderSummary>;
  readonly onMoved: (node: NodeSummary) => void;
  /** La carpeta creada desde el árbol existe aunque luego no se mueva nada. */
  readonly onFolderCreated: (folder: FolderSummary) => void;
  readonly onClose: () => void;
}

const folderIdOf = (key: string): string | null => (key === TREE_ROOT ? null : key);

/** Abre lo necesario para ver la ubicación actual; al mover una carpeta, también su carpeta (mockups `mover*`). */
function openPathOf(node: NodeSummary, breadcrumbs: readonly FolderRef[]): readonly FolderRef[] {
  return node.type === 'folder' ? breadcrumbs : breadcrumbs.slice(0, -1);
}

function readyFolderNames(tree: FolderTree, key: string): readonly string[] {
  const loaded = tree.children(key);
  return loaded?.status === 'ready' ? loaded.folders.map((folder) => folder.name) : [];
}

/** Aviso dentro del diálogo para un fallo al mover (CA-3, CA-8, CA-9). */
function moveFailureOf(
  error: unknown,
  node: NodeSummary,
  tree: FolderTree,
  destination: string,
): string {
  const networkFailure = `No pudimos mover «${node.name}». Revisa tu conexión e inténtalo de nuevo.`;
  if (!(error instanceof StorageRequestError)) return networkFailure;
  if (error.code === STORAGE_ERROR_CODES.STORAGE_NAME_CONFLICT) {
    // El texto de 005 para este código habla de la carga: al mover, la web pone el suyo.
    if (node.type === 'file') {
      return `Ya tienes un archivo llamado «${node.name}» en ${tree.nameOf(destination)}. Elige otro destino.`;
    }
    const stored = storedNameOf(node.name, readyFolderNames(tree, destination));
    return folderMoveConflictMessage(stored, tree.nameOf(destination));
  }
  if (error.code === STORAGE_ERROR_CODES.STORAGE_NODE_NOT_FOUND) {
    return `No encontramos «${node.name}» o la carpeta de destino. Cierra y actualiza la lista.`;
  }
  const known = storageMessage(error.code, error.details);
  return known ? `${known.cause} ${known.fix}` : networkFailure;
}

/** Foco itinerante del árbol: mover el foco re-renderiza y después enfoca el elemento. */
function useTreeFocus(initial: string): {
  readonly focused: string;
  readonly focusItem: (key: string) => void;
  readonly itemRef: (key: string, element: HTMLLIElement | null) => void;
} {
  const [focused, setFocused] = React.useState(initial);
  const items = React.useRef(new Map<string, HTMLLIElement>());
  const pending = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (pending.current === null) return;
    items.current.get(pending.current)?.focus();
    pending.current = null;
  });

  const itemRef = React.useCallback((key: string, element: HTMLLIElement | null) => {
    if (element === null) items.current.delete(key);
    else items.current.set(key, element);
  }, []);

  const focusItem = React.useCallback((key: string) => {
    pending.current = key;
    setFocused(key);
  }, []);

  return { focused, focusItem, itemRef };
}

/**
 * «Mover a…» un archivo o una carpeta (mockups `mover`, `mover-carpeta`, `mover-conflicto` y `mover-nueva-carpeta`).
 * Se monta al abrirse. La ubicación actual y, al mover una carpeta, ella y su contenido no se pueden elegir (CA-8).
 */
export function MoveDialog(props: MoveDialogProps): React.JSX.Element {
  const { node, breadcrumbs, onClose } = props;
  const currentKey = breadcrumbs.at(-1)?.id ?? TREE_ROOT;
  const tree = useFolderTree(props.folderContents, openPathOf(node, breadcrumbs));
  const [selected, setSelected] = React.useState<string | null>(
    currentKey === TREE_ROOT ? null : TREE_ROOT,
  );
  const { focused, focusItem, itemRef } = useTreeFocus(selected ?? TREE_ROOT);
  const [newFolderParent, setNewFolderParent] = React.useState<string | null>(null);
  const fieldRef = React.useRef<HTMLInputElement>(null);
  const [failure, setFailure] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const [suggestedName, setSuggestedName] = React.useState<string | null>(null);

  /** Dentro de la carpeta que se mueve (o ella misma): nada ahí se puede elegir (CA-8). */
  const insideMovedFolder = (key: string): boolean =>
    node.type === 'folder' && tree.isWithin(key, node.id);

  const disabledReason = (key: string): string | null => {
    if (node.type === 'folder' && key === node.id) return MOVED_FOLDER;
    if (insideMovedFolder(key)) return INSIDE_MOVED_FOLDER;
    return key === currentKey ? CURRENT_LOCATION : null;
  };

  const select = (key: string): void => {
    if (disabledReason(key) !== null) return;
    setSelected(key);
    setFailure(null);
  };

  const openNewFolder = (): void => {
    if (newFolderParent !== null) {
      fieldRef.current?.focus();
      return;
    }
    const parent = selected ?? focused;
    tree.expand(parent);
    setNewFolderParent(parent);
  };

  React.useEffect(() => {
    if (newFolderParent !== null) fieldRef.current?.focus();
  }, [newFolderParent]);

  const closeNewFolder = (): void => {
    if (newFolderParent !== null) focusItem(newFolderParent);
    setNewFolderParent(null);
  };

  const createInTree = async (parentKey: string, name: string): Promise<string | null> => {
    const invalid = validateFolderName(name);
    if (invalid) return invalid.field ?? null;
    try {
      const folder = await props.createFolder({ name, parentId: folderIdOf(parentKey) });
      tree.addFolder(parentKey, folder);
      props.onFolderCreated(folder);
      setNewFolderParent(null);
      if (!insideMovedFolder(parentKey)) setSelected(folder.id);
      focusItem(folder.id);
      return null;
    } catch (error) {
      const siblings = readyFolderNames(tree, parentKey);
      const failed = folderNameFailureOf(error, name, siblings, CREATE_NETWORK_FAILURE);
      return failed.field ?? failed.alert ?? CREATE_NETWORK_FAILURE;
    }
  };

  const move = async (destination: string, keepBoth: boolean): Promise<void> => {
    setPending(true);
    setFailure(null);
    try {
      const target = folderIdOf(destination);
      const moved: NodeSummary =
        node.type === 'file'
          ? {
              type: 'file',
              ...(await props.moveFile(node.id, {
                folderId: target,
                onConflict: keepBoth ? 'keep_both' : 'ask',
              })),
            }
          : { type: 'folder', ...(await props.moveFolder(node.id, { parentId: target })) };
      props.onMoved(moved);
      onClose();
    } catch (error) {
      setPending(false);
      const suggested = node.type === 'file' ? suggestedNameOf(error) : null;
      if (suggested !== null) setSuggestedName(suggested);
      else setFailure(moveFailureOf(error, node, tree, destination));
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          focusItem(focused);
        }}
        onEscapeKeyDown={(event) => {
          if (newFolderParent === null || document.activeElement !== fieldRef.current) return;
          event.preventDefault();
          closeNewFolder();
        }}
      >
        <DialogHeader>
          <DialogTitle className="break-words">
            {node.type === 'file' ? `Mover «${node.name}»` : `Mover la carpeta «${node.name}»`}
          </DialogTitle>
          <DialogDescription>{CHOOSE_DESTINATION}</DialogDescription>
        </DialogHeader>
        {node.type === 'folder' ? (
          <p className="flex items-start gap-2 text-sm text-secondary-foreground">
            <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{FOLDER_HINT}</span>
          </p>
        ) : null}
        <MoveFolderTree
          tree={tree}
          selected={selected}
          focused={focused}
          disabledReason={disabledReason}
          itemRef={itemRef}
          onFocusItem={focusItem}
          onSelect={select}
          newFolder={
            newFolderParent === null
              ? null
              : {
                  parentKey: newFolderParent,
                  renderField: (level) => (
                    <TreeNewFolderField
                      ref={fieldRef}
                      level={level}
                      parentName={tree.nameOf(newFolderParent)}
                      onSubmit={(name) => createInTree(newFolderParent, name)}
                      onCancel={closeNewFolder}
                    />
                  ),
                }
          }
        />
        {tree.loadFailed ? (
          <Alert variant="error" className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              No pudimos abrir una de las carpetas. Revisa tu conexión y vuelve a abrirla.
            </span>
          </Alert>
        ) : null}
        <p
          role="status"
          className="rounded-md bg-muted px-3 py-2.5 text-sm text-secondary-foreground"
        >
          {selected === null ? (
            CHOOSE_DESTINATION
          ) : (
            <>
              Se moverá a{' '}
              <strong className="font-semibold text-foreground">{tree.pathOf(selected)}</strong>.
            </>
          )}
        </p>
        {failure === null ? null : (
          <Alert variant="error" className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{failure}</span>
          </Alert>
        )}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
          <Button type="button" variant="outline" className="sm:mr-auto" onClick={openNewFolder}>
            <FolderPlus className="h-4 w-4" aria-hidden="true" />
            Nueva carpeta
          </Button>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Cancelar
            </Button>
          </DialogClose>
          <Button
            type="button"
            loading={pending}
            disabled={selected === null}
            onClick={() => selected !== null && void move(selected, false)}
          >
            {pending ? 'Moviendo…' : 'Mover aquí'}
          </Button>
        </div>
        <NameConflictDialog
          open={suggestedName !== null}
          fileName={node.name}
          finalName={suggestedName ?? ''}
          othersCount={0}
          onKeepBoth={() => {
            setSuggestedName(null);
            if (selected !== null) void move(selected, true);
          }}
          onDiscard={onClose}
        />
      </DialogContent>
    </Dialog>
  );
}
