'use client';

import { Check, ChevronDown, ChevronRight, Folder, House, Loader2 } from 'lucide-react';
import * as React from 'react';

import { cn } from '../../../lib/utils';
import { TREE_ROOT, type FolderTree } from '../hooks/use-folder-tree';

/** Campo «Nueva carpeta» abierto como primer hijo de `parentKey` (mockup `mover-nueva-carpeta`). */
export interface TreeNewFolder {
  readonly parentKey: string;
  readonly renderField: (level: number) => React.ReactNode;
}

export interface MoveFolderTreeProps {
  readonly tree: FolderTree;
  readonly selected: string | null;
  /** Elemento con `tabIndex=0` (foco itinerante del patrón `tree` de WAI-ARIA). */
  readonly focused: string;
  /** «Ubicación actual», «Carpeta que mueves» o «Dentro de la carpeta»; `null` si se puede elegir. */
  readonly disabledReason: (key: string) => string | null;
  readonly newFolder: TreeNewFolder | null;
  readonly itemRef: (key: string, element: HTMLLIElement | null) => void;
  readonly onFocusItem: (key: string) => void;
  readonly onSelect: (key: string) => void;
}

const LOADING_LABEL = 'Cargando carpetas…';

/**
 * Sangría de cada nivel (1 = «Mis archivos») en la fila y no en el grupo, así el campo «Nueva carpeta» puede usar todo
 * el ancho del árbol a 360 px. Clases literales para que Tailwind las genere; más allá del último nivel se repite.
 */
const ROW_INDENT = [
  'pl-2',
  'pl-7',
  'pl-12',
  'pl-17',
  'pl-22',
  'pl-27',
  'pl-32',
  'pl-37',
  'pl-42',
  'pl-47',
  'pl-52',
];
const FIELD_INDENT = [
  'sm:pl-2',
  'sm:pl-7',
  'sm:pl-12',
  'sm:pl-17',
  'sm:pl-22',
  'sm:pl-27',
  'sm:pl-32',
  'sm:pl-37',
  'sm:pl-42',
  'sm:pl-47',
  'sm:pl-52',
];

const atLevel = (classes: readonly string[], level: number): string =>
  classes[Math.min(level, classes.length) - 1] ?? '';

/** Sangría del campo en línea: la del nivel desde `sm`; por debajo, todo el ancho. */
export const fieldIndent = (level: number): string => atLevel(FIELD_INDENT, level);

/** Teclas del árbol: ↑ ↓ Inicio Fin recorren lo visible; → abre o entra; ← cierra o sube; Enter y Espacio eligen. */
function useTreeKeyboard({
  tree,
  focused,
  newFolder,
  onFocusItem,
  onSelect,
}: MoveFolderTreeProps): (event: React.KeyboardEvent<HTMLUListElement>) => void {
  return (event) => {
    if ((event.target as HTMLElement).getAttribute('data-tree-key') === null) return;
    const visible = tree.visibleKeys();
    const index = visible.indexOf(focused);
    const loaded = tree.children(focused);
    const firstChild = loaded?.status === 'ready' ? loaded.folders[0]?.id : undefined;
    const actions: Readonly<Record<string, () => void>> = {
      ArrowDown: () => onFocusItem(visible[index + 1] ?? focused),
      ArrowUp: () => onFocusItem(visible[index - 1] ?? focused),
      Home: () => onFocusItem(visible[0] ?? focused),
      End: () => onFocusItem(visible.at(-1) ?? focused),
      ArrowRight: () => {
        if (!tree.isExpanded(focused)) tree.expand(focused);
        else if (firstChild !== undefined && newFolder?.parentKey !== focused)
          onFocusItem(firstChild);
      },
      ArrowLeft: () => {
        const parent = tree.parentOf(focused);
        if (tree.isExpanded(focused) && focused !== TREE_ROOT) tree.collapse(focused);
        else if (parent !== undefined) onFocusItem(parent);
      },
      Enter: () => onSelect(focused),
      ' ': () => onSelect(focused),
    };
    const action = actions[event.key];
    if (action === undefined) return;
    event.preventDefault();
    action();
  };
}

/** Árbol de destino de «Mover a…»: selección única, carga perezosa al abrir cada carpeta. */
export function MoveFolderTree(props: MoveFolderTreeProps): React.JSX.Element {
  const onKeyDown = useTreeKeyboard(props);
  return (
    <ul
      role="tree"
      aria-label="Carpetas de destino"
      onKeyDown={onKeyDown}
      className="max-h-72 overflow-y-auto rounded-md border border-border bg-card p-1"
    >
      <TreeItem {...props} itemKey={TREE_ROOT} level={1} />
    </ul>
  );
}

interface TreeItemProps extends MoveFolderTreeProps {
  readonly itemKey: string;
  readonly level: number;
}

function TreeItem(props: TreeItemProps): React.JSX.Element {
  const { tree, itemKey, level, selected, focused, newFolder } = props;
  const nameId = React.useId();
  const noteId = React.useId();
  const loaded = tree.children(itemKey);
  const expanded = tree.isExpanded(itemKey);
  const hostsNewFolder = newFolder?.parentKey === itemKey;
  const loading = loaded?.status === 'loading';
  const expandable = loaded?.status !== 'ready' || loaded.folders.length > 0 || hostsNewFolder;
  const reason = props.disabledReason(itemKey);
  const isSelected = selected === itemKey;

  const toggle = (event: React.MouseEvent): void => {
    event.stopPropagation();
    props.onFocusItem(itemKey);
    if (expanded) tree.collapse(itemKey);
    else tree.expand(itemKey);
  };

  return (
    <li
      role="treeitem"
      ref={(element) => props.itemRef(itemKey, element)}
      data-tree-key={itemKey}
      aria-level={level}
      aria-selected={isSelected}
      aria-expanded={expandable ? expanded : undefined}
      aria-disabled={reason === null ? undefined : true}
      aria-labelledby={nameId}
      aria-describedby={reason === null ? undefined : noteId}
      aria-busy={loading || undefined}
      tabIndex={focused === itemKey ? 0 : -1}
      className="outline-none [&:focus-visible>div]:outline-2 [&:focus-visible>div]:-outline-offset-2 [&:focus-visible>div]:outline-ring"
      onClick={(event) => {
        event.stopPropagation();
        props.onFocusItem(itemKey);
        props.onSelect(itemKey);
      }}
    >
      <div
        className={cn(
          'flex min-h-10 cursor-pointer items-center gap-2 rounded-md py-1.5 pr-2 text-sm',
          atLevel(ROW_INDENT, level),
          isSelected ? 'border-l-[3px] border-l-brand bg-accent font-semibold' : 'hover:bg-muted',
          reason === null ? 'text-foreground' : 'cursor-default text-muted-foreground',
        )}
      >
        <span
          aria-hidden="true"
          className="flex h-6 w-6 shrink-0 items-center justify-center text-secondary-foreground"
          onClick={expandable ? toggle : undefined}
        >
          {expandable && expanded ? <ChevronDown className="h-4 w-4" /> : null}
          {expandable && !expanded ? <ChevronRight className="h-4 w-4" /> : null}
        </span>
        {level === 1 ? (
          <House className="h-4 w-4 shrink-0" aria-hidden="true" />
        ) : (
          <Folder className="h-4 w-4 shrink-0" aria-hidden="true" />
        )}
        <span id={nameId} className="min-w-0 flex-1 truncate">
          {tree.nameOf(itemKey)}
        </span>
        {loading ? (
          <>
            <Loader2
              className="h-4 w-4 shrink-0 animate-spin motion-reduce:animate-none"
              aria-hidden="true"
            />
            <span className="sr-only">{LOADING_LABEL}</span>
          </>
        ) : null}
        {reason === null ? null : (
          <span id={noteId} className="shrink-0 text-xs font-normal text-secondary-foreground">
            {reason}
          </span>
        )}
        {isSelected ? <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" /> : null}
      </div>
      {expanded && (loaded?.status === 'ready' || hostsNewFolder) ? (
        <ul role="group">
          {hostsNewFolder ? newFolder.renderField(level + 1) : null}
          {loaded?.status === 'ready'
            ? loaded.folders.map((folder) => (
                <TreeItem {...props} key={folder.id} itemKey={folder.id} level={level + 1} />
              ))
            : null}
        </ul>
      ) : null}
    </li>
  );
}
