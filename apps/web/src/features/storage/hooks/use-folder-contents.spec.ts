/**
 * @jest-environment jsdom
 */
import {
  folderContentsResponseSchema,
  type FolderContentsResponse,
  type NodeSummary,
} from '@nimbo/contracts';
import { act, renderHook } from '@testing-library/react';

import type { FolderPageQuery } from '../folders-api';
import { DEFAULT_NODE_ORDER } from '../node-order';

import { useFolderContents, type LoadFolderContents } from './use-folder-contents';

const AT = '2026-09-30T10:00:00.000Z';
const FOLDER_ID = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';

function folderNode(n: number): NodeSummary {
  const id = `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  return {
    type: 'folder',
    id,
    name: `Carpeta ${String(n)}`,
    parentId: null,
    createdAt: AT,
    updatedAt: AT,
  };
}

function fileNode(n: number): NodeSummary {
  const id = `00000000-0000-4000-9000-${String(n).padStart(12, '0')}`;
  return {
    type: 'file',
    id,
    name: `archivo-${String(n)}.pdf`,
    sizeBytes: n * 1_000,
    kind: 'pdf',
    folderId: null,
    createdAt: AT,
    updatedAt: AT,
  };
}

/** Respuesta simulada validada con el esquema de `contracts` (la API de orden, A T-04, aún no está). */
function page(items: readonly NodeSummary[], nextCursor: string | null): FolderContentsResponse {
  return folderContentsResponseSchema.parse({ folder: null, breadcrumbs: [], items, nextCursor });
}

interface Deferred {
  readonly resolve: (contents: FolderContentsResponse) => void;
  readonly reject: (error: unknown) => void;
  readonly folderId: string | null;
  readonly query: FolderPageQuery;
}

/** Cada llamada queda pendiente hasta que la prueba la resuelve, para controlar el orden de llegada. */
function deferredLoader(): {
  readonly load: jest.MockedFunction<LoadFolderContents>;
  readonly calls: Deferred[];
} {
  const calls: Deferred[] = [];
  const load = jest.fn<ReturnType<LoadFolderContents>, Parameters<LoadFolderContents>>(
    (folderId, query = {}) =>
      new Promise((resolve, reject) => {
        calls.push({ resolve, reject, folderId, query });
      }),
  );
  return { load, calls };
}

async function settle(call: Deferred | undefined, contents: FolderContentsResponse): Promise<void> {
  await act(async () => call?.resolve(contents));
}

function itemIds(listing: ReturnType<typeof useFolderContents>['listing']): readonly string[] {
  return listing.status === 'ready' ? listing.contents.items.map((item) => item.id) : [];
}

describe('useFolderContents: orden y «Cargar más» (007 CA-9, CA-10, CA-12)', () => {
  it('CA-10: sin elegir orden pide fecha de creación descendente, el de 006', async () => {
    const { load, calls } = deferredLoader();
    const { result } = renderHook(() => useFolderContents(load, FOLDER_ID));

    expect(calls[0]?.query).toEqual({ sort: 'created', dir: 'desc' });
    expect(calls[0]?.folderId).toBe(FOLDER_ID);
    expect(result.current.controls.order).toEqual(DEFAULT_NODE_ORDER);
    await settle(calls[0], page([folderNode(1)], null));

    expect(result.current.listing.status).toBe('ready');
    expect(result.current.controls.hasMore).toBe(false);
  });

  it('CA-9: «Cargar más» acumula las páginas con nextCursor, sin duplicados, hasta que no hay más', async () => {
    const { load, calls } = deferredLoader();
    const { result } = renderHook(() => useFolderContents(load, null));
    await settle(calls[0], page([folderNode(1), fileNode(1)], 'c-2'));
    expect(result.current.controls.hasMore).toBe(true);

    act(() => result.current.controls.loadMore());
    expect(result.current.controls.more).toBe('loading');
    expect(calls[1]?.query).toEqual({ sort: 'created', dir: 'desc', cursor: 'c-2' });
    await settle(calls[1], page([fileNode(1), fileNode(2), fileNode(3)], null));

    expect(itemIds(result.current.listing)).toEqual([
      folderNode(1).id,
      fileNode(1).id,
      fileNode(2).id,
      fileNode(3).id,
    ]);
    expect(result.current.controls).toMatchObject({ more: 'idle', added: 2, hasMore: false });
  });

  it('CA-12: cambiar el orden conserva lo visible mientras llega y luego reinicia en la primera página', async () => {
    const { load, calls } = deferredLoader();
    const { result } = renderHook(() => useFolderContents(load, null));
    await settle(calls[0], page([fileNode(1)], 'c-2'));
    act(() => result.current.controls.loadMore());
    await settle(calls[1], page([fileNode(2)], 'c-3'));

    act(() => result.current.controls.changeOrder({ sort: 'size', dir: 'desc' }));

    expect(calls[2]?.query).toEqual({ sort: 'size', dir: 'desc' });
    expect(result.current.controls).toMatchObject({
      sorting: true,
      order: { sort: 'size', dir: 'desc' },
      shownOrder: DEFAULT_NODE_ORDER,
    });
    expect(itemIds(result.current.listing)).toEqual([fileNode(1).id, fileNode(2).id]);

    await settle(calls[2], page([fileNode(3)], null));
    expect(itemIds(result.current.listing)).toEqual([fileNode(3).id]);
    expect(result.current.controls).toMatchObject({
      sorting: false,
      shownOrder: { sort: 'size', dir: 'desc' },
    });
  });

  it('CA-10 (I-1): refresh relee la primera página en el orden actual y conserva lo visible mientras llega', async () => {
    const { load, calls } = deferredLoader();
    const { result } = renderHook(() => useFolderContents(load, null));
    act(() => result.current.controls.changeOrder({ sort: 'name', dir: 'asc' }));
    await settle(calls[1], page([fileNode(1), fileNode(3)], null));

    act(() => result.current.refresh());

    expect(calls[2]?.query).toEqual({ sort: 'name', dir: 'asc' });
    expect(result.current.listing.status).toBe('ready');
    expect(itemIds(result.current.listing)).toEqual([fileNode(1).id, fileNode(3).id]);
    await settle(calls[2], page([fileNode(1), fileNode(2), fileNode(3)], null));
    expect(itemIds(result.current.listing)).toEqual([
      fileNode(1).id,
      fileNode(2).id,
      fileNode(3).id,
    ]);
  });

  it('CA-10: elegir el mismo orden no vuelve a pedir la carpeta', async () => {
    const { load, calls } = deferredLoader();
    const { result } = renderHook(() => useFolderContents(load, null));
    await settle(calls[0], page([fileNode(1)], null));

    act(() => result.current.controls.changeOrder({ sort: 'created', dir: 'desc' }));

    expect(load).toHaveBeenCalledTimes(1);
    expect(result.current.controls.sorting).toBe(false);
  });

  it('CA-12: la respuesta de un orden anterior que llega tarde se descarta', async () => {
    const { load, calls } = deferredLoader();
    const { result } = renderHook(() => useFolderContents(load, null));
    await settle(calls[0], page([fileNode(1)], null));

    act(() => result.current.controls.changeOrder({ sort: 'name', dir: 'asc' }));
    act(() => result.current.controls.changeOrder({ sort: 'size', dir: 'desc' }));
    await settle(calls[2], page([fileNode(3)], null));
    await settle(calls[1], page([fileNode(2)], null));

    expect(itemIds(result.current.listing)).toEqual([fileNode(3).id]);
    expect(result.current.controls.shownOrder).toEqual({ sort: 'size', dir: 'desc' });
  });

  it('CA-12: una página siguiente de un orden anterior no se agrega al orden nuevo', async () => {
    const { load, calls } = deferredLoader();
    const { result } = renderHook(() => useFolderContents(load, null));
    await settle(calls[0], page([fileNode(1)], 'c-2'));

    act(() => result.current.controls.loadMore());
    act(() => result.current.controls.changeOrder({ sort: 'name', dir: 'asc' }));
    await settle(calls[2], page([fileNode(5)], null));
    await settle(calls[1], page([fileNode(2)], null));

    expect(itemIds(result.current.listing)).toEqual([fileNode(5).id]);
    expect(result.current.controls.more).toBe('idle');
  });

  it('CA-12: si falla la página siguiente, lo visible se conserva y «Reintentar» la vuelve a pedir', async () => {
    const { load, calls } = deferredLoader();
    const { result } = renderHook(() => useFolderContents(load, null));
    await settle(calls[0], page([fileNode(1)], 'c-2'));

    act(() => result.current.controls.loadMore());
    await act(async () => calls[1]?.reject(new Error('red')));

    expect(result.current.controls.more).toBe('error');
    expect(itemIds(result.current.listing)).toEqual([fileNode(1).id]);

    act(() => result.current.controls.loadMore());
    expect(calls[2]?.query).toEqual({ sort: 'created', dir: 'desc', cursor: 'c-2' });
    await settle(calls[2], page([fileNode(2)], null));
    expect(itemIds(result.current.listing)).toEqual([fileNode(1).id, fileNode(2).id]);
  });

  it('CA-12: cerrar el aviso de error vuelve a mostrar «Cargar más»', async () => {
    const { load, calls } = deferredLoader();
    const { result } = renderHook(() => useFolderContents(load, null));
    await settle(calls[0], page([fileNode(1)], 'c-2'));
    act(() => result.current.controls.loadMore());
    await act(async () => calls[1]?.reject(new Error('red')));

    act(() => result.current.controls.dismissMoreError());

    expect(result.current.controls).toMatchObject({ more: 'idle', hasMore: true });
  });

  it('CA-9: mientras se pide otro orden «Cargar más» no pide nada', async () => {
    const { load, calls } = deferredLoader();
    const { result } = renderHook(() => useFolderContents(load, null));
    await settle(calls[0], page([fileNode(1)], 'c-2'));

    act(() => result.current.controls.changeOrder({ sort: 'name', dir: 'asc' }));
    act(() => result.current.controls.loadMore());

    expect(load).toHaveBeenCalledTimes(2);
  });

  it('CA-12: si falla el primer listado de un orden nuevo, se ve el error con «Reintentar» en ese orden', async () => {
    const { load, calls } = deferredLoader();
    const { result } = renderHook(() => useFolderContents(load, null));
    await settle(calls[0], page([fileNode(1)], null));

    act(() => result.current.controls.changeOrder({ sort: 'updated', dir: 'desc' }));
    await act(async () => calls[1]?.reject(new Error('red')));
    expect(result.current.listing.status).toBe('error');

    act(() => result.current.reload());
    expect(result.current.listing.status).toBe('loading');
    expect(calls[2]?.query).toEqual({ sort: 'updated', dir: 'desc' });
  });
});
