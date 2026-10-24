/**
 * @jest-environment jsdom
 */
import {
  INDEXING_EVENTS,
  INTELLIGENCE_ERROR_CODES,
  STORAGE_ERROR_CODES,
  type IndexingStatusResponse,
} from '@nimbo/contracts';
import { act, renderHook, waitFor } from '@testing-library/react';
import * as React from 'react';

import { FakeRealtimeChannel } from '../../editing/test-edit-session';
import { RealtimeContext, type RealtimeChannel } from '../../realtime/use-realtime';
import { StorageRequestError } from '../../storage/storage-request-error';
import type { IndexingApi } from '../indexing-api';
import {
  FAILED,
  fakeIndexingApi,
  INDEXED_FILE_ID,
  INDEXING,
  indexingStatus,
  OTHER_FILE_ID,
} from '../test-indexing';

import { useIndexingStatus } from './use-indexing-status';

const INDEXED = indexingStatus();
const NOT_FOUND = new StorageRequestError(404, STORAGE_ERROR_CODES.STORAGE_NODE_NOT_FOUND);

async function renderStatus(api: IndexingApi, channel: RealtimeChannel, onIndexed = jest.fn()) {
  let current = channel;
  const wrapper = ({ children }: { readonly children: React.ReactNode }): React.JSX.Element => (
    <RealtimeContext.Provider value={current}>{children}</RealtimeContext.Provider>
  );
  const view = renderHook(() => useIndexingStatus(api, INDEXED_FILE_ID, onIndexed), { wrapper });
  await act(async () => undefined);
  return {
    ...view,
    reconnect: async (next: RealtimeChannel) => {
      current = next;
      view.rerender();
      await act(async () => undefined);
    },
  };
}

function statusSequence(...responses: IndexingStatusResponse[]): jest.Mock {
  const status = jest.fn<Promise<IndexingStatusResponse>, [string]>();
  responses.forEach((response) => status.mockResolvedValueOnce(response));
  return status;
}

function changeState(channel: FakeRealtimeChannel, payload: Record<string, unknown>): void {
  act(() =>
    channel.emit(INDEXING_EVENTS.STATUS_CHANGED, {
      fileId: INDEXED_FILE_ID,
      reason: null,
      ...payload,
    }),
  );
}

describe('useIndexingStatus (019 CA-13, CA-14)', () => {
  it('CA-14: lee el estado del archivo al montar', async () => {
    const api = fakeIndexingApi({ status: statusSequence(INDEXING) });
    const { result } = await renderStatus(api, new FakeRealtimeChannel());

    await waitFor(() => expect(result.current.status).toEqual(INDEXING));
    expect(api.status).toHaveBeenCalledWith(INDEXED_FILE_ID);
  });

  it('CA-18: un 404 no muestra estado', async () => {
    const api = fakeIndexingApi({ status: jest.fn(() => Promise.reject(NOT_FOUND)) });
    const { result } = await renderStatus(api, new FakeRealtimeChannel());

    await act(async () => undefined);
    expect(result.current.status).toBeNull();
  });

  it('CA-14: `indexing.status-changed` de este archivo cambia el estado sin recargar y lo revalida', async () => {
    const channel = new FakeRealtimeChannel();
    const api = fakeIndexingApi({ status: statusSequence(INDEXING, INDEXED) });
    const onIndexed = jest.fn();
    const { result } = await renderStatus(api, channel, onIndexed);
    await waitFor(() => expect(result.current.status).toEqual(INDEXING));

    changeState(channel, { state: 'indexado' });

    expect(result.current.status?.state).toBe('indexado');
    await act(async () => undefined);
    expect(onIndexed).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(result.current.status).toEqual(INDEXED));
    expect(api.status).toHaveBeenCalledTimes(2);
  });

  it('CA-14: un aviso de otro archivo o fuera del contrato se ignora', async () => {
    const channel = new FakeRealtimeChannel();
    const api = fakeIndexingApi({ status: statusSequence(INDEXING) });
    const { result } = await renderStatus(api, channel);
    await waitFor(() => expect(result.current.status).toEqual(INDEXING));

    changeState(channel, { fileId: OTHER_FILE_ID, state: 'indexado' });
    changeState(channel, { state: 'indexado', fileName: 'informe.docx' });

    expect(result.current.status).toEqual(INDEXING);
    expect(api.status).toHaveBeenCalledTimes(1);
  });

  it('CA-14: si ya estaba indexado no vuelve a avisar', async () => {
    const channel = new FakeRealtimeChannel();
    const api = fakeIndexingApi({ status: statusSequence(INDEXED, INDEXED) });
    const onIndexed = jest.fn();
    const { result } = await renderStatus(api, channel, onIndexed);
    await waitFor(() => expect(result.current.status).toEqual(INDEXED));

    changeState(channel, { state: 'indexado' });
    await act(async () => undefined);

    expect(onIndexed).not.toHaveBeenCalled();
  });

  it('CA-14: al reconectar el canal revalida el estado', async () => {
    const api = fakeIndexingApi({ status: statusSequence(INDEXING, FAILED) });
    const { result, reconnect } = await renderStatus(api, new FakeRealtimeChannel('conexion-1'));
    await waitFor(() => expect(result.current.status).toEqual(INDEXING));

    await reconnect(new FakeRealtimeChannel('conexion-2'));

    await waitFor(() => expect(result.current.status).toEqual(FAILED));
  });

  it('CA-13: «Reintentar» deja el archivo en `pendiente` y responde que lo logró', async () => {
    let answer: (value: { state: 'pendiente' }) => void = () => undefined;
    const retry = jest.fn(() => new Promise<{ state: 'pendiente' }>((ok) => (answer = ok)));
    const api = fakeIndexingApi({ status: statusSequence(FAILED), retry });
    const { result } = await renderStatus(api, new FakeRealtimeChannel());
    await waitFor(() => expect(result.current.status).toEqual(FAILED));

    let succeeded: Promise<boolean> = Promise.resolve(false);
    act(() => {
      succeeded = result.current.retry.run();
    });
    expect(result.current.retry.pending).toBe(true);
    await act(async () => answer({ state: 'pendiente' }));

    await expect(succeeded).resolves.toBe(true);
    expect(retry).toHaveBeenCalledWith(INDEXED_FILE_ID);
    expect(result.current.retry.pending).toBe(false);
    expect(result.current.status).toEqual({
      state: 'pendiente',
      reason: null,
      updatedAt: null,
      canRetry: false,
    });
  });

  it('CA-13: si el reintento no llega al servidor, lo dice y el estado no cambia', async () => {
    const api = fakeIndexingApi({
      status: statusSequence(FAILED),
      retry: jest.fn(() => Promise.reject(new TypeError('Failed to fetch'))),
    });
    const { result } = await renderStatus(api, new FakeRealtimeChannel());
    await waitFor(() => expect(result.current.status).toEqual(FAILED));

    await act(async () => {
      await expect(result.current.retry.run()).resolves.toBe(false);
    });

    expect(result.current.retry.failed).toBe(true);
    expect(result.current.status).toEqual(FAILED);
  });

  it('CA-13: si ya no está `fallido` (409), relee el estado', async () => {
    const code = INTELLIGENCE_ERROR_CODES.INTELLIGENCE_INDEXING_NOT_RETRYABLE;
    const api = fakeIndexingApi({
      status: statusSequence(FAILED, INDEXING),
      retry: jest.fn(() => Promise.reject(new StorageRequestError(409, code))),
    });
    const { result } = await renderStatus(api, new FakeRealtimeChannel());
    await waitFor(() => expect(result.current.status).toEqual(FAILED));

    await act(async () => {
      await result.current.retry.run();
    });

    await waitFor(() => expect(result.current.status).toEqual(INDEXING));
    expect(result.current.retry.failed).toBe(false);
  });

  it('al desmontar deja de escuchar el canal', async () => {
    const channel = new FakeRealtimeChannel();
    const { unmount } = await renderStatus(fakeIndexingApi(), channel);

    unmount();

    expect(channel.subscribers(INDEXING_EVENTS.STATUS_CHANGED)).toBe(0);
  });
});
