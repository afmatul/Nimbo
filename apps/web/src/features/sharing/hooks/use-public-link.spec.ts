/**
 * @jest-environment jsdom
 */
import {
  SHARING_ERROR_CODES,
  type CurrentPublicLink,
  type PublicLinkSummary,
} from '@nimbo/contracts';
import { act, renderHook, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';

import { StorageRequestError } from '../../storage/storage-request-error';
import type { SharingApi } from '../sharing-api';
import {
  fakeSharingApi,
  NODE_ID,
  PUBLIC_LINK_ID,
  PUBLIC_LINK_URL,
  publicLink,
} from '../test-sharing';

import { usePublicLink } from './use-public-link';

const OTHER_FILE_ID = '8b9c0d1e-2f3a-4b4c-9d5e-7f8a9b0c1d2e';
const CHOICE = { expiresInDays: 30, password: 'puente-azul-27' } as const;
const CREATED = { link: publicLink({ hasPassword: true }), url: PUBLIC_LINK_URL };

type Current = jest.Mock<Promise<CurrentPublicLink>, [string]>;

const currentOf = (link: PublicLinkSummary | null = publicLink()): Current =>
  jest.fn<Promise<CurrentPublicLink>, [string]>(() => Promise.resolve({ link }));

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function renderLink(api: SharingApi, fileId = NODE_ID) {
  return renderHook(({ id }) => usePublicLink(api, id), {
    initialProps: { id: fileId },
    wrapper: StrictMode,
  });
}

async function renderReady(api: SharingApi) {
  const hook = renderLink(api);
  await waitFor(() => expect(hook.result.current.reading.status).toBe('ready'));
  return hook;
}

describe('usePublicLink (spec 013c)', () => {
  it('CA-1: empieza cargando y pide el enlace del archivo', () => {
    const api = fakeSharingApi();
    const { result } = renderLink(api);

    expect(result.current.reading).toEqual({ status: 'loading' });
    expect(api.currentPublicLink).toHaveBeenCalledWith(NODE_ID);
  });

  it('CA-1: un archivo sin enlace queda listo con `link: null`', async () => {
    const { result } = await renderReady(fakeSharingApi({ currentPublicLink: currentOf(null) }));

    expect(result.current.reading).toEqual({ status: 'ready', link: null });
    expect(result.current.generated).toBeNull();
  });

  it('CA-7: un enlace activo se lee sin URL', async () => {
    const { result } = await renderReady(fakeSharingApi({ currentPublicLink: currentOf() }));

    expect(result.current.reading).toEqual({ status: 'ready', link: publicLink() });
    expect(JSON.stringify(result.current)).not.toContain(PUBLIC_LINK_URL);
  });

  it('CA-13: si la lectura falla, queda en error con el error de la API y «Reintentar» relee', async () => {
    const failure = new StorageRequestError(503, 'SERVICE_UNAVAILABLE');
    const currentPublicLink = jest
      .fn<Promise<CurrentPublicLink>, [string]>()
      .mockRejectedValue(failure);
    const { result } = renderLink(fakeSharingApi({ currentPublicLink }));
    await waitFor(() =>
      expect(result.current.reading).toEqual({ status: 'error', error: failure }),
    );

    currentPublicLink.mockResolvedValue({ link: publicLink() });
    act(() => result.current.reload());

    expect(result.current.reading).toEqual({ status: 'loading' });
    await waitFor(() => expect(result.current.reading.status).toBe('ready'));
  });

  it('CA-3: generar envía la elección, deja la URL en memoria y relee el estado', async () => {
    const currentPublicLink = currentOf(null);
    const createPublicLink = jest.fn(() => Promise.resolve(CREATED));
    const { result } = await renderReady(fakeSharingApi({ currentPublicLink, createPublicLink }));
    const readsBefore = currentPublicLink.mock.calls.length;

    await act(async () => {
      await expect(result.current.create(CHOICE)).resolves.toEqual(CREATED);
    });

    expect(createPublicLink).toHaveBeenCalledWith({ fileId: NODE_ID, ...CHOICE });
    expect(result.current.generated).toEqual(CREATED);
    expect(currentPublicLink.mock.calls.length).toBeGreaterThan(readsBefore);
  });

  it('CA-13: si generar falla, rechaza con el error de la API y no deja URL', async () => {
    const failure = new StorageRequestError(503, 'SERVICE_UNAVAILABLE');
    const createPublicLink = jest.fn(() => Promise.reject(failure));
    const { result } = await renderReady(
      fakeSharingApi({ currentPublicLink: currentOf(), createPublicLink }),
    );

    await act(async () => {
      await expect(result.current.create(CHOICE)).rejects.toBe(failure);
    });

    expect(result.current.generated).toBeNull();
  });

  it('CA-8: abrir «Generar otro enlace» descarta la URL anterior', async () => {
    const { result } = await renderReady(
      fakeSharingApi({
        currentPublicLink: currentOf(),
        createPublicLink: jest.fn(() => Promise.resolve(CREATED)),
      }),
    );
    await act(async () => {
      await result.current.create(CHOICE);
    });

    act(() => result.current.clearGenerated());

    expect(result.current.generated).toBeNull();
  });

  it('CA-9: revocar borra la URL en memoria y relee el estado', async () => {
    const currentPublicLink = currentOf();
    const revokePublicLink = jest.fn(() => Promise.resolve());
    const { result } = await renderReady(
      fakeSharingApi({
        currentPublicLink,
        revokePublicLink,
        createPublicLink: jest.fn(() => Promise.resolve(CREATED)),
      }),
    );
    await act(async () => {
      await result.current.create(CHOICE);
    });
    currentPublicLink.mockResolvedValue({ link: null });

    await act(async () => {
      await result.current.revoke(PUBLIC_LINK_ID);
    });

    expect(revokePublicLink).toHaveBeenCalledWith(PUBLIC_LINK_ID);
    expect(result.current.generated).toBeNull();
    await waitFor(() => expect(result.current.reading).toEqual({ status: 'ready', link: null }));
  });

  it('CA-14: si revocar falla, rechaza con el error de la API', async () => {
    const failure = new StorageRequestError(404, SHARING_ERROR_CODES.SHARING_LINK_NOT_FOUND);
    const { result } = await renderReady(
      fakeSharingApi({
        currentPublicLink: currentOf(),
        revokePublicLink: jest.fn(() => Promise.reject(failure)),
      }),
    );

    await act(async () => {
      await expect(result.current.revoke(PUBLIC_LINK_ID)).rejects.toBe(failure);
    });
  });

  it('CA-7: una respuesta de otro archivo que llega tarde se descarta', async () => {
    const late = deferred<CurrentPublicLink>();
    const currentPublicLink = jest.fn<Promise<CurrentPublicLink>, [string]>((fileId) =>
      fileId === NODE_ID ? late.promise : Promise.resolve({ link: null }),
    );
    const hook = renderLink(fakeSharingApi({ currentPublicLink }));

    hook.rerender({ id: OTHER_FILE_ID });
    await waitFor(() =>
      expect(hook.result.current.reading).toEqual({ status: 'ready', link: null }),
    );
    await act(async () => late.resolve({ link: publicLink() }));

    expect(hook.result.current.reading).toEqual({ status: 'ready', link: null });
  });

  it('RN-1: la URL generada no va a `Storage` ni a `console`', async () => {
    const setItem = jest.spyOn(Storage.prototype, 'setItem');
    const logs = (['log', 'info', 'warn', 'error', 'debug'] as const).map((level) =>
      jest.spyOn(console, level).mockImplementation(() => undefined),
    );
    const { result } = await renderReady(
      fakeSharingApi({
        currentPublicLink: currentOf(),
        createPublicLink: jest.fn(() => Promise.resolve(CREATED)),
      }),
    );

    await act(async () => {
      await result.current.create(CHOICE);
    });

    for (const spy of [setItem, ...logs]) {
      expect(JSON.stringify(spy.mock.calls)).not.toContain(PUBLIC_LINK_URL);
      spy.mockRestore();
    }
  });
});
