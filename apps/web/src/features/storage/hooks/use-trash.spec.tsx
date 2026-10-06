/**
 * @jest-environment jsdom
 */
import type { ListTrashResponse, TrashSummary } from '@nimbo/contracts';
import { act, renderHook } from '@testing-library/react';

import { EMPTY_POLL_INTERVAL_MS, useTrash, type TrashReader } from './use-trash';

const SUMMARY: TrashSummary = { itemCount: 2, totalBytes: 2_048, retentionDays: 60 };
const EMPTY: TrashSummary = { ...SUMMARY, itemCount: 0, totalBytes: 0 };
const PAGE: ListTrashResponse = { items: [], nextCursor: null };

function fakeReader(summaries: readonly TrashSummary[]): jest.Mocked<TrashReader> {
  const trashSummary = jest.fn<Promise<TrashSummary>, []>(() => Promise.resolve(SUMMARY));
  summaries.forEach((summary) => trashSummary.mockResolvedValueOnce(summary));
  return { listTrash: jest.fn(() => Promise.resolve(PAGE)), trashSummary };
}

describe('useTrash: refresco del espacio (007 CA-4, D-16)', () => {
  it('CA-4: al releer el resumen tras restaurar o eliminar definitivamente avisa que cambió el espacio', async () => {
    const onTrashChanged = jest.fn();
    const reader = fakeReader([SUMMARY]);
    const { result } = renderHook(() => useTrash(reader, onTrashChanged));
    await act(async () => undefined);
    expect(onTrashChanged).not.toHaveBeenCalled();

    await act(async () => result.current.refreshSummary());

    expect(onTrashChanged).toHaveBeenCalledTimes(1);
  });

  it('CA-4: al terminar de vaciar la papelera avisa que cambió el espacio', async () => {
    jest.useFakeTimers();
    const onTrashChanged = jest.fn();
    const reader = fakeReader([SUMMARY, EMPTY]);
    const { result } = renderHook(() => useTrash(reader, onTrashChanged));
    await act(async () => undefined);

    act(() => result.current.startEmptying({ scheduledItems: 2, pendingBytes: 2_048 }));
    await act(async () => {
      jest.advanceTimersByTime(EMPTY_POLL_INTERVAL_MS);
    });

    expect(onTrashChanged).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });
});
