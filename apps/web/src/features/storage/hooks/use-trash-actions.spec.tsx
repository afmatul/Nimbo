/**
 * @jest-environment jsdom
 */
import { STORAGE_ERROR_CODES, type RestoreResponse, type TrashItem } from '@nimbo/contracts';
import { act, renderHook } from '@testing-library/react';

import { StorageRequestError } from '../storage-request-error';
import type { TrashApi } from '../trash-api';

import { useTrashActions } from './use-trash-actions';

const AT = '2026-09-30T10:00:00.000Z';
const LATER = '2026-10-30T10:00:00.000Z';

function trashItem(id: string, name: string): TrashItem {
  return {
    id,
    type: 'file',
    name,
    kind: 'docx',
    sizeBytes: 1024,
    originalFolder: null,
    deletedAt: AT,
    purgeAt: LATER,
  };
}

const FIRST = trashItem('00000000-0000-4000-8000-000000000001', 'informe.docx');
const SECOND = trashItem('00000000-0000-4000-8000-000000000002', 'acta.docx');
const THIRD = trashItem('00000000-0000-4000-8000-000000000003', 'nota.docx');

function restored(item: TrashItem): RestoreResponse {
  return {
    item: {
      type: 'file',
      id: item.id,
      name: item.name,
      kind: 'docx',
      sizeBytes: item.sizeBytes,
      folderId: null,
      createdAt: AT,
      updatedAt: AT,
    },
    outcome: 'restored',
    originalName: item.name,
  } as RestoreResponse;
}

const NOT_FOUND = new StorageRequestError(404, STORAGE_ERROR_CODES.STORAGE_NODE_NOT_FOUND);

function setup(api: Partial<Pick<TrashApi, 'restore' | 'purge' | 'emptyTrash'>>) {
  const trash = { removeItems: jest.fn(), refreshSummary: jest.fn(), startEmptying: jest.fn() };
  const fullApi = {
    restore: jest.fn(),
    purge: jest.fn(),
    emptyTrash: jest.fn(),
    ...api,
  };
  const hook = renderHook(() => useTrashActions(fullApi, trash));
  return { ...hook, trash };
}

describe('useTrashActions (006 CA-13 a CA-18, 007 CA-4)', () => {
  it('CA-17: restaurar varios quita los restaurados y los que ya no existen, limpia la selección y relee el resumen', async () => {
    const restore = jest.fn((_type: string, id: string) => {
      if (id === FIRST.id) return Promise.resolve(restored(FIRST));
      if (id === SECOND.id) return Promise.reject(NOT_FOUND);
      return Promise.reject(new TypeError('Failed to fetch'));
    });
    const { result, trash } = setup({ restore });
    act(() => result.current.setSelectedIds(new Set([FIRST.id, SECOND.id, THIRD.id])));

    await act(() => result.current.restore([FIRST, SECOND, THIRD]));

    expect(trash.removeItems).toHaveBeenCalledWith(new Set([FIRST.id, SECOND.id]));
    expect(result.current.selectedIds.size).toBe(0);
    expect(trash.refreshSummary).toHaveBeenCalledTimes(1);
    expect(result.current.result?.map((line) => line.status)).toEqual([
      'restored',
      'failed',
      'failed',
    ]);
    expect(result.current.restoring).toBe(false);
    act(() => result.current.dismissResult());
    expect(result.current.result).toBeNull();
  });

  it('CA-18: eliminar definitivamente un elemento lo quita de la selección y relee el resumen', async () => {
    const purge = jest.fn(() => Promise.resolve({ freedBytes: 1024 }));
    const { result, trash } = setup({ purge });
    act(() => result.current.setSelectedIds(new Set([FIRST.id, SECOND.id])));
    act(() => result.current.setPurgeTarget({ scope: 'item', item: FIRST }));

    await act(() => result.current.confirmPurge());

    expect(purge).toHaveBeenCalledWith('file', FIRST.id);
    expect(trash.removeItems).toHaveBeenCalledWith(new Set([FIRST.id]));
    expect([...result.current.selectedIds]).toEqual([SECOND.id]);
    expect(trash.refreshSummary).toHaveBeenCalledTimes(1);
  });

  it('CA-18: si ya no estaba (404) la quita igual y propaga el error al diálogo', async () => {
    const purge = jest.fn(() => Promise.reject(NOT_FOUND));
    const { result, trash } = setup({ purge });
    act(() => result.current.setPurgeTarget({ scope: 'item', item: FIRST }));

    await act(() => expect(result.current.confirmPurge()).rejects.toBe(NOT_FOUND));

    expect(trash.removeItems).toHaveBeenCalledWith(new Set([FIRST.id]));
    expect(trash.refreshSummary).not.toHaveBeenCalled();
  });

  it('CA-18: vaciar programa el vaciado y limpia la selección', async () => {
    const scheduled = { scheduledItems: 2, pendingBytes: 2048 };
    const emptyTrash = jest.fn(() => Promise.resolve(scheduled));
    const { result, trash } = setup({ emptyTrash });
    act(() => result.current.setSelectedIds(new Set([FIRST.id])));
    act(() => result.current.setPurgeTarget({ scope: 'all', itemCount: 2, totalBytes: 2048 }));

    await act(() => result.current.confirmPurge());

    expect(trash.startEmptying).toHaveBeenCalledWith(scheduled);
    expect(result.current.selectedIds.size).toBe(0);
  });

  it('sin destino confirmado no llama a la API', async () => {
    const { result } = setup({});

    await act(() => result.current.confirmPurge());

    expect(result.current.purgeTarget).toBeNull();
  });
});
