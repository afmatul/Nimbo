'use client';

import type { FolderRef, FolderSummary } from '@nimbo/contracts';
import * as React from 'react';

import { MY_FILES_LABEL } from '../routes';

import type { LoadFolderContents } from './use-folder-contents';

/** Clave de «Mis archivos» en el árbol; las carpetas usan su `id`. */
export const TREE_ROOT = 'root';

export type ChildFolders =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly folders: readonly FolderRef[] };

interface TreeState {
  readonly children: ReadonlyMap<string, ChildFolders>;
  readonly expanded: ReadonlySet<string>;
  readonly names: ReadonlyMap<string, string>;
  readonly parents: ReadonlyMap<string, string>;
  /** Alguna carpeta no se pudo abrir: se cierra y se avisa; abrirla de nuevo reintenta. */
  readonly loadFailed: boolean;
}

export interface FolderTree {
  readonly children: (key: string) => ChildFolders | undefined;
  readonly isExpanded: (key: string) => boolean;
  /** Claves visibles en orden, para recorrer con las flechas. */
  readonly visibleKeys: () => readonly string[];
  readonly parentOf: (key: string) => string | undefined;
  readonly nameOf: (key: string) => string;
  /** «Proyecto Alpha / Documentación»; «Mis archivos» para la raíz. */
  readonly pathOf: (key: string) => string;
  /** Si `key` es `ancestor` o está dentro de ella. */
  readonly isWithin: (key: string, ancestor: string) => boolean;
  readonly loadFailed: boolean;
  readonly expand: (key: string) => void;
  readonly collapse: (key: string) => void;
  readonly addFolder: (parentKey: string, folder: FolderSummary) => void;
}

/** Id de la carpeta de una clave del árbol; `null` para «Mis archivos». */
export const folderIdOf = (key: string): string | null => (key === TREE_ROOT ? null : key);

function initialState(openPath: readonly FolderRef[]): TreeState {
  const keys = [TREE_ROOT, ...openPath.map((folder) => folder.id)];
  return {
    children: new Map(),
    expanded: new Set(keys),
    names: new Map([[TREE_ROOT, MY_FILES_LABEL], ...openPath.map((f) => [f.id, f.name] as const)]),
    parents: new Map(openPath.map((folder, index) => [folder.id, keys[index] ?? TREE_ROOT])),
    loadFailed: false,
  };
}

function withChildren(state: TreeState, key: string, folders: readonly FolderRef[]): TreeState {
  return {
    ...state,
    children: new Map(state.children).set(key, { status: 'ready', folders }),
    names: new Map([...state.names, ...folders.map((f) => [f.id, f.name] as const)]),
    parents: new Map([...state.parents, ...folders.map((f) => [f.id, key] as const)]),
  };
}

function withFailure(state: TreeState, key: string): TreeState {
  const children = new Map(state.children);
  children.delete(key);
  const expanded = new Set(state.expanded);
  expanded.delete(key);
  return { ...state, children, expanded, loadFailed: true };
}

/**
 * Árbol de carpetas de «Mover a…» con carga perezosa: cada carpeta pide su primera página al abrirse
 * (`GET /folders/contents`). Empieza con «Mis archivos» y la ruta actual abiertas.
 */
export function useFolderTree(
  load: LoadFolderContents,
  openPath: readonly FolderRef[],
): FolderTree {
  const [state, setState] = React.useState(() => initialState(openPath));
  const requested = React.useRef(new Set<string>());

  const fetchChildren = React.useCallback(
    (key: string) => {
      if (requested.current.has(key)) return;
      requested.current.add(key);
      setState((previous) => ({
        ...previous,
        children: new Map(previous.children).set(key, { status: 'loading' }),
      }));
      load(folderIdOf(key)).then(
        (contents) => {
          const folders = contents.items.flatMap((item) =>
            item.type === 'folder' ? [{ id: item.id, name: item.name }] : [],
          );
          setState((previous) => withChildren(previous, key, folders));
        },
        () => {
          requested.current.delete(key);
          setState((previous) => withFailure(previous, key));
        },
      );
    },
    [load],
  );

  React.useEffect(() => {
    state.expanded.forEach(fetchChildren);
  }, [state.expanded, fetchChildren]);

  return React.useMemo(() => treeOf(state, setState), [state]);
}

function treeOf(
  state: TreeState,
  setState: React.Dispatch<React.SetStateAction<TreeState>>,
): FolderTree {
  const children = (key: string): ChildFolders | undefined => state.children.get(key);
  const parentOf = (key: string): string | undefined => state.parents.get(key);
  const nameOf = (key: string): string => state.names.get(key) ?? '';

  const visibleFrom = (key: string): string[] => {
    const loaded = children(key);
    if (!state.expanded.has(key) || loaded?.status !== 'ready') return [key];
    return [key, ...loaded.folders.flatMap((folder) => visibleFrom(folder.id))];
  };

  const ancestry = (key: string): string[] => {
    const parent = parentOf(key);
    return parent === undefined ? [key] : [...ancestry(parent), key];
  };

  return {
    children,
    isExpanded: (key) => state.expanded.has(key),
    visibleKeys: () => visibleFrom(TREE_ROOT),
    parentOf,
    nameOf,
    pathOf: (key) =>
      key === TREE_ROOT
        ? MY_FILES_LABEL
        : ancestry(key)
            .filter((step) => step !== TREE_ROOT)
            .map(nameOf)
            .join(' / '),
    isWithin: (key, ancestor) => ancestry(key).includes(ancestor),
    loadFailed: state.loadFailed,
    expand: (key) =>
      setState((previous) => ({
        ...previous,
        expanded: new Set(previous.expanded).add(key),
        loadFailed: false,
      })),
    collapse: (key) =>
      setState((previous) => {
        const expanded = new Set(previous.expanded);
        expanded.delete(key);
        return { ...previous, expanded };
      }),
    addFolder: (parentKey, folder) =>
      setState((previous) => {
        const current = previous.children.get(parentKey);
        const siblings = current?.status === 'ready' ? current.folders : [];
        return withChildren(previous, parentKey, [
          { id: folder.id, name: folder.name },
          ...siblings,
        ]);
      }),
  };
}
