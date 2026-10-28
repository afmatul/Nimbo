'use client';

import { AlertCircle, ChevronDown } from 'lucide-react';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '../../../components/ui/dropdown-menu';
import {
  MoveFolderTree,
  TREE_ROOT,
  useFolderTree,
  useTreeFocus,
  type FolderTree,
  type LoadFolderContents,
} from '../../storage';
import { ALL_FILES_SCOPE, type AgentScope } from '../agent-scope';

/** Archivo fijado con «Preguntar sobre esto» desde su ficha (S-1). */
export interface PinnedFile {
  readonly id: string;
  readonly name: string;
}

export interface AgentScopePickerProps {
  readonly scope: AgentScope;
  /** Sin archivo fijado, «Un archivo» aparece apagada (S-1). */
  readonly pinnedFile?: PinnedFile;
  /** `GET /folders/contents` para el árbol de «Una carpeta», el de «Mover a…». */
  readonly folderContents: LoadFolderContents;
  readonly onChange: (scope: AgentScope) => void;
}

const ALL_FILES = 'Todos mis archivos';
const CHOOSE_FOLDER = 'Elige una carpeta.';
const ROOT_IS_NOT_A_FOLDER = '«Mis archivos» no es una carpeta: elige una de sus carpetas.';
const NO_PINNED_FILE = 'Elígelo desde su ficha';
const ALL_FILES_NOTE = 'Incluye los que te compartieron';
const SUBFOLDERS_NOTE = 'Con sus subcarpetas';
const NO_OPEN_PATH: readonly never[] = [];

/** Lo que dice el botón: «Todos mis archivos», «Carpeta <nombre>» o el nombre del archivo (CA-14). */
function scopeLabel(scope: AgentScope): string {
  if (scope.type === 'all') return ALL_FILES;
  return scope.type === 'folder' ? `Carpeta ${scope.name}` : scope.name;
}

/**
 * Ámbito de las preguntas (RN-9 de 020, CA-14, S-1; mockup `panel-agente--ambito`): menú de tres opciones excluyentes.
 * «Una carpeta» abre el árbol de «Mover a…»; «Un archivo» solo ofrece el fijado desde su ficha.
 */
export function AgentScopePicker(props: AgentScopePickerProps): React.JSX.Element {
  const { scope, pinnedFile, onChange } = props;
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const [treeOpen, setTreeOpen] = React.useState(false);

  const closeTree = (chosen?: AgentScope): void => {
    setTreeOpen(false);
    if (chosen !== undefined) onChange(chosen);
  };

  return (
    <>
      <DropdownMenu>
        <ScopeTrigger ref={triggerRef} scope={scope} />
        <ScopeMenu
          scope={scope}
          pinnedFile={pinnedFile}
          onChange={onChange}
          onChooseFolder={() => setTreeOpen(true)}
        />
      </DropdownMenu>
      {treeOpen ? (
        <FolderScopeDialog
          folderContents={props.folderContents}
          onClose={closeTree}
          returnFocus={() => triggerRef.current?.focus()}
        />
      ) : null}
    </>
  );
}

interface ScopeMenuProps {
  readonly scope: AgentScope;
  readonly pinnedFile: PinnedFile | undefined;
  readonly onChange: (scope: AgentScope) => void;
  readonly onChooseFolder: () => void;
}

/** Las tres opciones; al elegir «Una carpeta», el foco pasa al árbol y no vuelve al botón. */
function ScopeMenu({
  scope,
  pinnedFile,
  onChange,
  onChooseFolder,
}: ScopeMenuProps): React.JSX.Element {
  const choosingFolder = React.useRef(false);
  return (
    <DropdownMenuContent
      align="start"
      className="w-72"
      onCloseAutoFocus={(event) => {
        if (choosingFolder.current) event.preventDefault();
        choosingFolder.current = false;
      }}
    >
      <DropdownMenuRadioGroup value={scope.type}>
        <ScopeOption
          value="all"
          title={ALL_FILES}
          note={ALL_FILES_NOTE}
          onSelect={() => onChange(ALL_FILES_SCOPE)}
        />
        <ScopeOption
          value="folder"
          title="Una carpeta"
          note={scope.type === 'folder' ? `${SUBFOLDERS_NOTE} · ${scope.name}` : SUBFOLDERS_NOTE}
          onSelect={() => {
            choosingFolder.current = true;
            onChooseFolder();
          }}
        />
        <ScopeOption
          value="file"
          title="Un archivo"
          note={pinnedFile?.name ?? NO_PINNED_FILE}
          onSelect={pinnedFile && (() => onChange({ type: 'file', ...pinnedFile }))}
        />
      </DropdownMenuRadioGroup>
    </DropdownMenuContent>
  );
}

const ScopeTrigger = React.forwardRef<HTMLButtonElement, { readonly scope: AgentScope }>(
  function ScopeTrigger({ scope }, ref) {
    return (
      <DropdownMenuTrigger asChild>
        <button
          ref={ref}
          type="button"
          className="group flex min-h-11 w-full items-center gap-2 rounded-md border border-input px-3 py-1.5 text-left text-sm text-agent-text outline-none hover:bg-agent-tag focus-visible:outline-2 focus-visible:outline-ring aria-expanded:bg-agent-tag sm:min-h-10"
        >
          <span className="text-xs font-semibold text-agent-accent group-hover:text-agent-text group-aria-expanded:text-agent-text">
            Ámbito
          </span>
          <span className="min-w-0 flex-1 truncate font-semibold">{scopeLabel(scope)}</span>
          <ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
    );
  },
);

interface ScopeOptionProps {
  readonly value: AgentScope['type'];
  readonly title: string;
  readonly note: string;
  /** Sin acción, la opción aparece apagada. */
  readonly onSelect: (() => void) | undefined;
}

function ScopeOption({ value, title, note, onSelect }: ScopeOptionProps): React.JSX.Element {
  return (
    <DropdownMenuRadioItem
      value={value}
      disabled={onSelect === undefined}
      onSelect={() => onSelect?.()}
      className="items-start"
    >
      <span className="min-w-0">
        <span className="block">{title}</span>
        <span className="block break-words text-xs font-normal text-secondary-foreground">
          {note}
        </span>
      </span>
    </DropdownMenuRadioItem>
  );
}

interface FolderScopeDialogProps {
  readonly folderContents: LoadFolderContents;
  /** Con la carpeta elegida, o sin nada si se cancela. */
  readonly onClose: (chosen?: AgentScope) => void;
  readonly returnFocus: () => void;
}

/** Árbol de «Mover a…» con selección única y nada deshabilitado: el agente busca en la carpeta y sus subcarpetas. */
function FolderScopeDialog(props: FolderScopeDialogProps): React.JSX.Element {
  const tree = useFolderTree(props.folderContents, NO_OPEN_PATH);
  const { focused, focusItem, itemRef } = useTreeFocus(TREE_ROOT);
  const [selected, setSelected] = React.useState<string | null>(null);
  const folder = selected === null || selected === TREE_ROOT ? null : selected;

  return (
    <Dialog open onOpenChange={(open) => !open && props.onClose()}>
      <DialogContent
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          focusItem(focused);
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          props.returnFocus();
        }}
      >
        <DialogHeader>
          <DialogTitle>Preguntar sobre una carpeta</DialogTitle>
          <DialogDescription>El agente buscará en ella y en sus subcarpetas.</DialogDescription>
        </DialogHeader>
        <MoveFolderTree
          tree={tree}
          label="Carpetas"
          selected={selected}
          focused={focused}
          disabledReason={() => null}
          newFolder={null}
          itemRef={itemRef}
          onFocusItem={focusItem}
          onSelect={setSelected}
        />
        <FolderScopeStatus tree={tree} selected={selected} />
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Cancelar
            </Button>
          </DialogClose>
          <Button
            type="button"
            disabled={folder === null}
            onClick={() =>
              folder !== null &&
              props.onClose({ type: 'folder', id: folder, name: tree.nameOf(folder) })
            }
          >
            Usar esta carpeta
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Aviso si una carpeta no abrió y qué carpeta se usará; «Mis archivos» no es una carpeta. */
function FolderScopeStatus({
  tree,
  selected,
}: {
  readonly tree: FolderTree;
  readonly selected: string | null;
}): React.JSX.Element {
  const folder = selected === TREE_ROOT ? null : selected;
  return (
    <>
      {tree.loadFailed ? (
        <Alert variant="error" className="flex items-start gap-2">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>No pudimos abrir una de las carpetas. Revisa tu conexión y vuelve a abrirla.</span>
        </Alert>
      ) : null}
      <p
        role="status"
        className="rounded-md bg-muted px-3 py-2.5 text-sm text-secondary-foreground"
      >
        {selected === TREE_ROOT ? ROOT_IS_NOT_A_FOLDER : null}
        {selected === null ? CHOOSE_FOLDER : null}
        {folder === null ? null : (
          <>
            Se usará{' '}
            <strong className="font-semibold text-foreground">{tree.pathOf(folder)}</strong>.
          </>
        )}
      </p>
    </>
  );
}
