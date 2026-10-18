/** @jest-environment jsdom */
import type { DownloadUrlResponse, PreviewUrlResponse } from '@nimbo/contracts';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import type * as React from 'react';

import { ApiClientError } from '../../../../lib/api-error';
import { DATE_LOCALE } from '../../../../lib/format-date';

import { PreviewPage } from './PreviewPage';
import { PreviewReader } from './PreviewReader';

const authFetch = jest.fn();
const requestDownload = jest.fn();
let mockAutoReady = true;
const mockDisposeReader = jest.fn<Promise<void>, []>();
jest.mock('./PreviewReader', () => {
  const { useEffect } = jest.requireActual<typeof React>('react');
  return {
    PreviewReader: jest.fn(
      ({ registerCleanup, onReady }: React.ComponentProps<typeof PreviewReader>) => {
        useEffect(() => registerCleanup?.(mockDisposeReader), [registerCleanup]);
        useEffect(() => {
          if (mockAutoReady) onReady?.();
        }, [onReady]);
        return null;
      },
    ),
  };
});
jest.mock('../../../identity/session/use-auth-fetch', () => ({ useAuthFetch: () => authFetch }));
jest.mock('../..', () => ({
  ...jest.requireActual('../..'),
  useFileDownload: () => requestDownload,
}));
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({
    prefetch: _prefetch,
    ...props
  }: React.ComponentProps<'a'> & { prefetch?: boolean }) => <a {...props} />,
}));

const ID = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const FOLDER = '33333333-3333-4333-8333-333333333333';
const DELIVERY: PreviewUrlResponse = {
  file: {
    id: ID,
    name: 'Notas.md',
    kind: 'texto',
    folderId: FOLDER,
    sizeBytes: 100,
    createdAt: '2026-10-10T10:00:00.000Z',
    updatedAt: '2026-10-10T10:00:00.000Z',
  },
  url: 'https://objects.test/private-object?X-Amz-Signature=PRIVATE_SIGNATURE',
  expiresAt: '2026-10-10T10:05:00.000Z',
};

function renderPage() {
  const open = jest.fn();
  const rendered = render(
    <PreviewPage fileId={ID} apiPublicUrl="https://api.test/api/v1" openDownloadUrl={open} />,
    {
      // AppLayout ya aporta main en producción.
      wrapper: ({ children }: { readonly children: React.ReactNode }) => <main>{children}</main>,
    },
  );
  return { ...rendered, open };
}

function expectPrivateDom(container: HTMLElement): void {
  for (const secret of [DELIVERY.url, 'X-Amz-Signature', 'private-object', 'PRIVATE_'])
    expect(container.innerHTML.includes(secret)).toBe(false);
  expect(container.innerHTML.includes(DELIVERY.expiresAt)).toBe(false);
}

describe('shell T-06', () => {
  beforeEach(() => {
    authFetch.mockReset();
    jest.mocked(PreviewReader).mockClear();
    mockAutoReady = true;
    mockDisposeReader.mockReset().mockResolvedValue(undefined);
    requestDownload.mockReset();
    authFetch.mockReturnValue(new Promise(() => undefined));
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('CA-9: loading tiene h1 seguro, un solo main y foco estable al superar 2 s', () => {
    jest.useFakeTimers();
    const { container } = renderPage();
    const region = screen.getByRole('region', { name: 'Vista previa' });
    expect(screen.getAllByRole('main')).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1, name: 'Vista previa' })).toBeTruthy();
    expect(region.getAttribute('aria-busy')).toBe('true');
    expect(document.activeElement).toBe(region);
    act(() => jest.advanceTimersByTime(1999));
    expect(screen.getByText('Abriendo la vista previa…')).toBeTruthy();
    act(() => jest.advanceTimersByTime(2));
    expect(screen.getByText('Preparando la vista previa…')).toBeTruthy();
    expect(document.activeElement).toBe(region);
    expect(container.textContent?.includes('Notas.md')).toBe(false);
    expect(screen.queryByRole('button', { name: 'Descargar' })).toBeNull();
  });

  it('CA-6: success muestra metadata autorizada y delega el contenido al lector', async () => {
    authFetch.mockResolvedValue(DELIVERY);
    const { container } = renderPage();
    await act(async () => undefined);
    expectPrivateDom(container);
    expect(screen.getByRole('heading', { level: 1, name: 'Notas.md' })).toBeTruthy();
    expect(screen.getByText('Solo lectura')).toBeTruthy();
    expect(screen.getByText('TEXTO')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Volver' }).getAttribute('href')).toBe(
      `/archivos/carpeta/${FOLDER}?foco=${ID}`,
    );
    expect(
      screen.getByRole('region', { name: 'Vista previa' }).getAttribute('aria-busy'),
    ).toBeNull();
    expect(container.querySelector('canvas,iframe,img,object,embed')).toBeNull();
    expect(authFetch).toHaveBeenCalledTimes(1);
    expect(screen.getByText('100 B')).toBeTruthy();
    expect(container.querySelector('time')?.getAttribute('dateTime')).toBe(DELIVERY.file.updatedAt);
    expect(container.querySelector('time')?.textContent).toBe(
      new Intl.DateTimeFormat(DATE_LOCALE, { dateStyle: 'medium' }).format(
        new Date(DELIVERY.file.updatedAt),
      ),
    );
    expect(authFetch.mock.calls[0]?.[0]).toBe(`https://api.test/api/v1/files/${ID}/preview-url`);
    expect(authFetch.mock.calls[0]?.[1]).toMatchObject({
      method: 'POST',
      signal: expect.any(AbortSignal),
    });
  });

  it.each(['imagen', 'texto'] as const)(
    'CA-1: entrega kind %s al lector sin usar la extensión',
    async (kind) => {
      authFetch.mockResolvedValue({
        ...DELIVERY,
        file: { ...DELIVERY.file, kind, name: 'Renombrado.pdf' },
      });
      renderPage();
      await act(async () => undefined);
      const props = jest.mocked(PreviewReader).mock.calls[0]?.[0];
      expect(props?.kind).toBe(kind);
      expect(props?.url === DELIVERY.url).toBe(true);
      expect(Object.keys(props ?? {}).sort()).toEqual([
        'kind',
        'onFailure',
        'onReady',
        'registerCleanup',
        'url',
      ]);
    },
  );

  it('CA-2: fallo del lector conserva metadata y ofrece una sola pareja Reintentar/Descargar', async () => {
    mockAutoReady = false;
    authFetch.mockResolvedValue(DELIVERY);
    const { container } = renderPage();
    await act(async () => undefined);
    const reader = jest.mocked(PreviewReader).mock.calls[0]?.[0];
    if (reader === undefined) throw new Error('Falta lector');
    act(() => reader.onFailure({ reason: 'corrupt', correlationId: DELIVERY.url }));
    expect(screen.getByRole('heading', { level: 1, name: 'Notas.md' })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Descargar' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Reintentar' })).toHaveLength(1);
    expect(screen.getByRole('alert').textContent).toContain('El original no cambió');
    expectPrivateDom(container);
    expect((await axe(container)).violations).toEqual([]);
  });

  it('CA-2: retry espera la destrucción, reemite la misma URL y rechaza failure/ready de A', async () => {
    mockAutoReady = false;
    authFetch.mockResolvedValue(DELIVERY);
    let finish = (): void => {
      throw new Error('Falta cleanup');
    };
    mockDisposeReader.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    renderPage();
    await act(async () => undefined);
    const a = jest.mocked(PreviewReader).mock.calls[0]?.[0];
    if (a === undefined) throw new Error('Falta lector A');
    act(() => a.onFailure({ reason: 'unavailable', correlationId: '' }));
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(authFetch).toHaveBeenCalledTimes(1);
    expect(mockDisposeReader).toHaveBeenCalledTimes(1);
    await act(async () => finish());
    expect(authFetch).toHaveBeenCalledTimes(2);
    const calls = jest.mocked(PreviewReader).mock.calls;
    const b = calls[calls.length - 1]?.[0];
    if (b === undefined) throw new Error('Falta lector B');
    expect(b.url === a.url).toBe(true);
    expect(b.onFailure === a.onFailure).toBe(false);
    act(() => b.onReady?.());
    act(() => {
      a.onFailure({ reason: 'corrupt', correlationId: '' });
      a.onReady?.();
    });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Reintentar' })).toBeNull();
  });

  it.each([
    ['SHARED_FORBIDDEN', 403],
    ['STORAGE_NODE_NOT_FOUND', 404],
  ] as const)(
    'CA-7: retry del lector con API %s borra metadata y contenido del mismo archivo',
    async (code, status) => {
      mockAutoReady = false;
      authFetch
        .mockResolvedValueOnce(DELIVERY)
        .mockRejectedValueOnce(
          new ApiClientError({ code, status, message: DELIVERY.url, correlationId: '' }),
        );
      const { container } = renderPage();
      await act(async () => undefined);
      const reader = jest.mocked(PreviewReader).mock.calls[0]?.[0];
      if (reader === undefined) throw new Error('Falta lector');
      act(() => reader.onFailure({ reason: 'corrupt', correlationId: '' }));
      await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
      await waitFor(() => expect(authFetch).toHaveBeenCalledTimes(2));
      expect(container.textContent?.includes('Notas.md')).toBe(false);
      expect(screen.queryByRole('button', { name: 'Descargar' })).toBeNull();
      expect(screen.getByRole('link', { name: 'Volver' }).getAttribute('href')).toBe(
        `/archivos?foco=${ID}`,
      );
      expectPrivateDom(container);
    },
  );

  it('CA-9: lectura lenta mantiene progreso tras emisión rápida, sin cambiar foco ni reemitir', async () => {
    jest.useFakeTimers();
    mockAutoReady = false;
    authFetch.mockResolvedValue(DELIVERY);
    renderPage();
    await act(async () => undefined);
    const region = screen.getByRole('region', { name: 'Vista previa' });
    expect(region.getAttribute('aria-busy')).toBe('true');
    act(() => jest.advanceTimersByTime(2000));
    expect(screen.queryByRole('progressbar')).toBeNull();
    act(() => jest.advanceTimersByTime(1));
    expect(screen.getByRole('progressbar')).toBeTruthy();
    expect(document.activeElement).toBe(region);
    const reader = jest.mocked(PreviewReader).mock.calls[0]?.[0];
    act(() => reader?.onReady?.());
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(authFetch).toHaveBeenCalledTimes(1);
  });

  it('CA-2: retry devuelve foco al visor, retira el error y no reutiliza una emisión', async () => {
    authFetch
      .mockRejectedValueOnce(
        new ApiClientError({
          code: 'INTERNAL_ERROR',
          message: 'PRIVATE_MESSAGE',
          correlationId: '',
        }),
      )
      .mockReturnValueOnce(new Promise(() => undefined));
    const { container } = renderPage();
    await act(async () => undefined);
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(document.activeElement).toBe(screen.getByRole('region', { name: 'Vista previa' }));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText('Abriendo la vista previa…')).toBeTruthy();
    expect(authFetch).toHaveBeenCalledTimes(2);
    expectPrivateDom(container);
  });

  it('CA-7: archivo nuevo no encontrado elimina nombre anterior y vuelve a raíz con foco', async () => {
    authFetch.mockResolvedValueOnce(DELIVERY).mockRejectedValueOnce(
      new ApiClientError({
        code: 'STORAGE_NODE_NOT_FOUND',
        status: 404,
        message: 'PRIVATE_MESSAGE',
        correlationId: '',
      }),
    );
    const { container, rerender } = renderPage();
    await act(async () => undefined);
    rerender(<PreviewPage fileId={OTHER} apiPublicUrl="https://api.test/api/v1" />);
    await act(async () => undefined);
    expectPrivateDom(container);
    expect(container.textContent?.includes('Notas.md')).toBe(false);
    expect(screen.getByRole('link', { name: 'Volver' }).getAttribute('href')).toBe(
      `/archivos?foco=${OTHER}`,
    );
    expect(screen.getByRole('heading', { name: 'No encontramos este archivo.' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Descargar' })).toBeNull();
  });

  it('CA-7: Descargar solicita el flujo público 005 y abre solamente su URL nueva', async () => {
    authFetch.mockResolvedValue(DELIVERY);
    const download: DownloadUrlResponse = {
      url: 'https://objects.test/private-download?X-Amz-Signature=DOWNLOAD_SIGNATURE',
      expiresAt: DELIVERY.expiresAt,
    };
    requestDownload.mockResolvedValue(download);
    const { container, open } = renderPage();
    await act(async () => undefined);
    await userEvent.click(screen.getByRole('button', { name: 'Descargar' }));
    expect(requestDownload).toHaveBeenCalledWith(ID);
    expect(open).toHaveBeenCalledTimes(1);
    expect(open.mock.calls[0]?.[0] === download.url).toBe(true);
    expectPrivateDom(container);
  });

  it('CA-7: una descarga tardía tras salir no provoca navegación', async () => {
    authFetch.mockResolvedValue(DELIVERY);
    let finish: (value: DownloadUrlResponse) => void = () => {
      throw new Error('Falta petición');
    };
    requestDownload.mockReturnValue(
      new Promise<DownloadUrlResponse>((resolve) => {
        finish = resolve;
      }),
    );
    const { unmount, open } = renderPage();
    await act(async () => undefined);
    await userEvent.click(screen.getByRole('button', { name: 'Descargar' }));
    unmount();
    await act(async () => finish({ url: DELIVERY.url, expiresAt: DELIVERY.expiresAt }));
    expect(open).toHaveBeenCalledTimes(0);
  });

  it('CA-7: cambio de fileId borra metadata inmediatamente y descarta descarga vieja', async () => {
    authFetch.mockResolvedValueOnce(DELIVERY).mockReturnValueOnce(new Promise(() => undefined));
    let finish: (value: DownloadUrlResponse) => void = () => {
      throw new Error('Falta petición');
    };
    requestDownload.mockReturnValue(
      new Promise<DownloadUrlResponse>((resolve) => {
        finish = resolve;
      }),
    );
    const { container, rerender, open } = renderPage();
    await act(async () => undefined);
    await userEvent.click(screen.getByRole('button', { name: 'Descargar' }));
    rerender(
      <PreviewPage fileId={OTHER} apiPublicUrl="https://api.test/api/v1" openDownloadUrl={open} />,
    );
    expect(container.textContent?.includes(DELIVERY.file.name)).toBe(false);
    expect(screen.queryByText('100 B')).toBeNull();
    expect(container.querySelector('time')).toBeNull();
    expect(screen.getByRole('heading', { level: 1, name: 'Vista previa' })).toBeTruthy();
    await act(async () =>
      finish({ url: 'https://objects.test/download', expiresAt: DELIVERY.expiresAt }),
    );
    expect(open).toHaveBeenCalledTimes(0);
    expectPrivateDom(container);
  });

  it.each([
    ['SHARED_FORBIDDEN', 403],
    ['SHARED_UNAUTHENTICATED', 401],
  ] as const)(
    'CA-7: reemisión %s retira metadata, sin Descargar ni datos recordados',
    async (code, status) => {
      authFetch
        .mockResolvedValueOnce(DELIVERY)
        .mockRejectedValueOnce(
          new ApiClientError({ code, status, message: DELIVERY.url, correlationId: '' }),
        );
      const { container, rerender } = renderPage();
      await act(async () => undefined);
      rerender(<PreviewPage fileId={OTHER} apiPublicUrl="https://api.test/api/v1" />);
      await act(async () => undefined);
      expect(container.textContent?.includes(DELIVERY.file.name)).toBe(false);
      expect(screen.queryByRole('button', { name: 'Descargar' })).toBeNull();
      expect(screen.getByRole('link', { name: 'Volver' }).getAttribute('href')).toBe(
        `/archivos?foco=${OTHER}`,
      );
      expectPrivateDom(container);
    },
  );

  it('CA-9: el teclado puede activar Descargar y Volver tiene nombre accesible', async () => {
    authFetch.mockResolvedValue(DELIVERY);
    requestDownload.mockResolvedValue({
      url: 'https://objects.test/download',
      expiresAt: DELIVERY.expiresAt,
    });
    const { open } = renderPage();
    await act(async () => undefined);
    act(() => screen.getByRole('button', { name: 'Descargar' }).focus());
    await userEvent.keyboard('{Enter}');
    expect(requestDownload).toHaveBeenCalledWith(ID);
    expect(open).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('link', { name: 'Volver' })).toBeTruthy();
  });

  it('CA-7: una descarga pendiente no se duplica al activarla de nuevo', async () => {
    authFetch.mockResolvedValue(DELIVERY);
    requestDownload.mockReturnValue(new Promise(() => undefined));
    renderPage();
    await act(async () => undefined);
    await userEvent.click(screen.getByRole('button', { name: 'Descargar' }));
    await userEvent.click(screen.getByRole('button', { name: 'Descargar' }));
    expect(requestDownload).toHaveBeenCalledTimes(1);
  });

  it('CA-7: retry de preview descarta una descarga pendiente y una entrega vieja tardía', async () => {
    authFetch.mockRejectedValueOnce(
      new ApiClientError({
        code: 'INTERNAL_ERROR',
        status: 500,
        message: DELIVERY.url,
        correlationId: '',
      }),
    );
    let finishDownload: (value: DownloadUrlResponse) => void = () => {
      throw new Error('Falta descarga');
    };
    requestDownload.mockReturnValue(
      new Promise<DownloadUrlResponse>((resolve) => {
        finishDownload = resolve;
      }),
    );
    let finishOld: (value: PreviewUrlResponse) => void = () => {
      throw new Error('Falta emisión');
    };
    authFetch.mockReturnValueOnce(
      new Promise<PreviewUrlResponse>((resolve) => {
        finishOld = resolve;
      }),
    );
    const { container, open, rerender } = renderPage();
    await act(async () => undefined);
    await userEvent.click(screen.getByRole('button', { name: 'Descargar' }));
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(document.activeElement).toBe(screen.getByRole('region', { name: 'Vista previa' }));
    await act(async () =>
      finishDownload({ url: 'https://objects.test/download', expiresAt: DELIVERY.expiresAt }),
    );
    expect(open).toHaveBeenCalledTimes(0);
    // Cambiar de archivo destruye también la emisión pendiente, aunque ignore el aborto.
    const next = {
      ...DELIVERY,
      file: { ...DELIVERY.file, id: OTHER, name: 'Nuevo.txt', folderId: null },
    };
    authFetch.mockResolvedValueOnce(next);
    const oldSignal = authFetch.mock.calls[1]?.[1]?.signal as AbortSignal;
    rerender(
      <PreviewPage fileId={OTHER} apiPublicUrl="https://api.test/api/v1" openDownloadUrl={open} />,
    );
    await act(async () => undefined);
    expect(oldSignal.aborted).toBe(true);
    await act(async () => finishOld(DELIVERY));
    expect(screen.getByRole('heading', { level: 1, name: 'Nuevo.txt' })).toBeTruthy();
    expect(container.textContent?.includes(DELIVERY.file.name)).toBe(false);
    expectPrivateDom(container);
  });

  it('CA-2: fallo de descarga se mantiene visible y no imprime la excepción', async () => {
    authFetch.mockResolvedValue(DELIVERY);
    requestDownload.mockRejectedValue(new Error(DELIVERY.url));
    const { container } = renderPage();
    await act(async () => undefined);
    await userEvent.click(screen.getByRole('button', { name: 'Descargar' }));
    expectPrivateDom(container);
    expect(screen.getByRole('alert').textContent).toContain('Ocurrió un error inesperado.');
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeTruthy();
    expect((await axe(container)).violations).toEqual([]);
    requestDownload.mockResolvedValue({
      url: 'https://objects.test/download',
      expiresAt: DELIVERY.expiresAt,
    });
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(requestDownload).toHaveBeenCalledTimes(2);
    expect(authFetch).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('region', { name: 'Vista previa' }));
  });

  it('Guardia transversal: la entrega exitosa no se escribe en storage, cookies o consola', async () => {
    const storage = jest.spyOn(Storage.prototype, 'setItem');
    const cookie = jest.spyOn(Document.prototype, 'cookie', 'set');
    const logs = [
      jest.spyOn(console, 'info'),
      jest.spyOn(console, 'warn'),
      jest.spyOn(console, 'error'),
    ];
    authFetch.mockResolvedValue(DELIVERY);
    const { container } = renderPage();
    await act(async () => undefined);
    expectPrivateDom(container);
    expect(storage).toHaveBeenCalledTimes(0);
    expect(cookie).toHaveBeenCalledTimes(0);
    for (const log of logs) expect(log).toHaveBeenCalledTimes(0);
  });

  it.each(['loading', 'ready', 'not-found', 'network', 'unexpected'] as const)(
    'CA-9: jest-axe pasa en shell %s',
    async (state) => {
      if (state === 'ready') authFetch.mockResolvedValue(DELIVERY);
      else if (state !== 'loading')
        authFetch.mockRejectedValue(
          new ApiClientError({
            code: state === 'not-found' ? 'STORAGE_NODE_NOT_FOUND' : 'INTERNAL_ERROR',
            status: state === 'network' ? undefined : 500,
            message: 'PRIVATE_MESSAGE',
            correlationId: '',
          }),
        );
      const { container } = renderPage();
      await act(async () => undefined);
      expectPrivateDom(container);
      expect(screen.getByRole('region', { name: 'Vista previa' })).toBeTruthy();
      expect(screen.getAllByRole('main')).toHaveLength(1);
      expect(screen.getByRole('heading', { level: 1 })).toBeTruthy();
      expect((await axe(container)).violations).toEqual([]);
    },
  );
});
