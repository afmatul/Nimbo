/**
 * @jest-environment jsdom
 */
import {
  BACKOFFICE_ERROR_CODES,
  SHARED_ERROR_CODES,
  type ClientFilesResponse,
} from '@nimbo/contracts';
import { act, renderHook } from '@testing-library/react';

import { ApiClientError } from '../../../lib/api-error';
import { clientFile, clientFilesPage, LAURA } from '../test-client-files';

import { useClientFiles, type ClientFilesRequest, type LoadClientFiles } from './use-client-files';

type LoadMock = jest.Mock<Promise<ClientFilesResponse>, [ClientFilesRequest]>;

function apiError(status: number, code: string): ApiClientError {
  return new ApiClientError({ status, code, message: code, correlationId: 'corr-1' });
}

function loadOf(...results: readonly (ClientFilesResponse | Error)[]): LoadMock {
  const load: LoadMock = jest.fn(
    (_request: ClientFilesRequest) => new Promise<ClientFilesResponse>(() => undefined),
  );
  for (const result of results) {
    load.mockImplementationOnce(() =>
      result instanceof Error ? Promise.reject(result) : Promise.resolve(result),
    );
  }
  return load;
}

async function settle(): Promise<void> {
  await act(async () => undefined);
}

function renderSearch(load: LoadClientFiles) {
  return renderHook(() => useClientFiles(load));
}

/** Busca a Laura y espera la respuesta. */
async function searchedForLaura(load: LoadClientFiles) {
  const rendered = renderSearch(load);
  act(() => rendered.result.current.search(LAURA.email));
  await settle();
  return rendered;
}

describe('useClientFiles (011 CA-13, CA-14, CA-17)', () => {
  it('CA-17: empieza en el estado inicial y no pide nada', () => {
    const load = loadOf();
    const { result } = renderSearch(load);

    expect(result.current.state).toEqual({ status: 'idle' });
    expect(load).not.toHaveBeenCalled();
  });

  it('CA-13: buscar pide la primera página y muestra lo encontrado', async () => {
    const page = clientFilesPage([clientFile()]);
    const load = loadOf(page);
    const { result } = renderSearch(load);

    act(() => result.current.search(LAURA.email));
    expect(result.current.state).toEqual({ status: 'loading' });
    await settle();

    expect(load).toHaveBeenCalledWith({ email: LAURA.email, page: 1 });
    expect(result.current.state).toEqual({ status: 'found', result: page, paging: false });
  });

  it('CA-13: otra página conserva lo visible mientras llega', async () => {
    const second = clientFilesPage([clientFile()], { page: 2, total: 11 });
    const load = loadOf(clientFilesPage([clientFile()], { total: 11 }), second);
    const { result } = await searchedForLaura(load);

    act(() => result.current.goToPage(2));
    expect(result.current.state).toMatchObject({ status: 'found', paging: true });
    await settle();

    expect(load).toHaveBeenLastCalledWith({ email: LAURA.email, page: 2 });
    expect(result.current.state).toEqual({ status: 'found', result: second, paging: false });
  });

  it('CA-13: un 404 es «no encontrado» con el correo buscado (inexistente o interna)', async () => {
    const load = loadOf(apiError(404, BACKOFFICE_ERROR_CODES.CLIENT_NOT_FOUND));
    const { result } = renderSearch(load);

    act(() => result.current.search('nadie@nimbo.me'));
    await settle();

    expect(result.current.state).toEqual({ status: 'notFound', email: 'nadie@nimbo.me' });
  });

  it('CA-14: un 403 SHARED_FORBIDDEN es «sin permiso»', async () => {
    const load = loadOf(apiError(403, SHARED_ERROR_CODES.FORBIDDEN));
    const { result } = await searchedForLaura(load);

    expect(result.current.state).toEqual({ status: 'forbidden' });
  });

  it('CA-17: otra falla es error y «Reintentar» repite la misma consulta', async () => {
    const page = clientFilesPage([clientFile()]);
    const load = loadOf(new TypeError('Failed to fetch'), page);
    const { result } = await searchedForLaura(load);
    expect(result.current.state).toEqual({ status: 'error' });

    act(() => result.current.retry());
    await settle();

    expect(load).toHaveBeenCalledTimes(2);
    expect(result.current.state).toEqual({ status: 'found', result: page, paging: false });
  });

  it('CA-17: limpiar vuelve al estado inicial y descarta la respuesta pendiente', async () => {
    let resolve: (page: ClientFilesResponse) => void = () => undefined;
    const load: LoadMock = jest.fn(
      (_request: ClientFilesRequest) =>
        new Promise<ClientFilesResponse>((done) => (resolve = done)),
    );
    const { result } = renderSearch(load);
    act(() => result.current.search(LAURA.email));

    act(() => result.current.clear());
    resolve(clientFilesPage([clientFile()]));
    await settle();

    expect(result.current.state).toEqual({ status: 'idle' });
  });
});
