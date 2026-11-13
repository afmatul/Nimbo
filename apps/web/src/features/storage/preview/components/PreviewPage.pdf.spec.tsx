/** @jest-environment jsdom */
import type { PreviewUrlResponse } from '@nimbo/contracts';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import type { ComponentProps, ReactNode } from 'react';

import { ApiClientError } from '../../../../lib/api-error';
import { openPdfSession, PdfReadError } from '../readers/pdfjs-adapter';
import { createPdfRuntime } from '../readers/pdfjs-runtime';

import { PreviewPage } from './PreviewPage';

jest.mock('../readers/pdfjs-adapter', () => ({
  ...jest.requireActual('../readers/pdfjs-adapter'),
  openPdfSession: jest.fn(),
}));
jest.mock('../readers/pdfjs-runtime', () => ({ createPdfRuntime: jest.fn() }));
const authFetch = jest.fn();
const download = jest.fn();
jest.mock('../../../identity/session/use-auth-fetch', () => ({ useAuthFetch: () => authFetch }));
jest.mock('../..', () => ({
  ...jest.requireActual('../..'),
  useFileDownload: () => download,
  useRecordedFileOpen: () => undefined,
}));
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ prefetch: _prefetch, ...props }: ComponentProps<'a'> & { prefetch?: boolean }) => (
    <a {...props} />
  ),
}));

const ID = '11111111-1111-4111-8111-111111111111';
const DELIVERY: PreviewUrlResponse = {
  file: {
    id: ID,
    name: 'Informe.pdf',
    kind: 'pdf',
    folderId: null,
    sizeBytes: 100,
    createdAt: '2026-10-10T10:00:00.000Z',
    updatedAt: '2026-10-10T10:00:00.000Z',
  },
  url: 'https://objects.test/private?X-Amz-Signature=PRIVATE',
  expiresAt: '2026-10-10T10:05:00.000Z',
};
const renderPage = jest.fn<Promise<void>, []>();
const dispose = jest.fn<Promise<void>, []>();
const disposeRuntime = jest.fn();
let logs: jest.SpyInstance[];
let storage: jest.SpyInstance;
let cookie: jest.SpyInstance;
let clock: jest.SpyInstance<number, []>;
const WAIT = { onTimeout: () => new Error('No se observó el estado PDF esperado') };

function show() {
  const open = jest.fn();
  return {
    ...render(
      <PreviewPage fileId={ID} apiPublicUrl="https://api.test/api/v1" openDownloadUrl={open} />,
      {
        wrapper: ({ children }: { readonly children: ReactNode }) => <main>{children}</main>,
      },
    ),
    open,
  };
}
function privateDom(container: HTMLElement): void {
  expect(/PRIVATE|X-Amz-Signature|objects.test|private\?/.test(container.innerHTML)).toBe(false);
  expect(container.querySelector('iframe,object,embed')).toBeNull();
}

describe('T-08: shell, PdfPreview y lifecycle integrados; motor se verifica en suite real', () => {
  beforeEach(() => {
    // Reloj fijo en la emisión: la entrega del fixture sigue vigente (un fallo vencido sería `expired`).
    clock = jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-10T10:00:00.000Z'));
    authFetch.mockReset().mockResolvedValue(DELIVERY);
    download
      .mockReset()
      .mockResolvedValue({ url: 'https://objects.test/download', expiresAt: DELIVERY.expiresAt });
    renderPage.mockReset().mockResolvedValue(undefined);
    dispose.mockReset().mockResolvedValue(undefined);
    disposeRuntime.mockReset();
    jest
      .mocked(createPdfRuntime)
      .mockReset()
      .mockResolvedValue({ dispose: disposeRuntime } as unknown as Awaited<
        ReturnType<typeof createPdfRuntime>
      >);
    jest.mocked(openPdfSession).mockReset().mockResolvedValue({ numPages: 2, renderPage, dispose });
    logs = (['log', 'warn', 'error', 'info', 'debug'] as const).map((method) =>
      jest.spyOn(console, method).mockImplementation(() => undefined),
    );
    storage = jest.spyOn(Storage.prototype, 'setItem');
    cookie = jest.spyOn(Document.prototype, 'cookie', 'set');
  });
  afterEach(async () => {
    try {
      await act(async () => cleanup());
      for (const log of logs) expect(log).toHaveBeenCalledTimes(0);
      expect(storage).toHaveBeenCalledTimes(0);
      expect(cookie).toHaveBeenCalledTimes(0);
    } finally {
      jest.restoreAllMocks();
      jest.useRealTimers();
    }
  });

  it('CA-9: PDF lento conserva busy y progreso >2 s hasta render; foco, DOM privado y axe', async () => {
    jest.useFakeTimers();
    let ready = (): void => undefined;
    renderPage.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          ready = resolve;
        }),
    );
    const { container } = show();
    await act(async () => undefined);
    const region = screen.getByRole('region', { name: 'Vista previa' });
    expect(region.getAttribute('aria-busy')).toBe('true');
    act(() => jest.advanceTimersByTime(2001));
    expect(screen.getByRole('progressbar')).toBeTruthy();
    expect(document.activeElement).toBe(region);
    await act(async () => ready());
    expect(region.getAttribute('aria-busy')).toBeNull();
    jest.useRealTimers();
    privateDom(container);
    expect((await axe(container)).violations).toEqual([]);
  });

  it('CA-2: protected ofrece Descargar/Volver y retry misma URL espera cleanup antes del POST', async () => {
    const { container, open } = show();
    await waitFor(() => expect(renderPage).toHaveBeenCalledTimes(1), WAIT);
    const a = jest.mocked(openPdfSession).mock.calls[0]?.[0];
    if (a === undefined) throw new Error('Falta PDF A');
    act(() => a.onFailure({ reason: 'protected', correlationId: DELIVERY.url }));
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(
      screen.getByRole('heading', { name: 'Este archivo está protegido con contraseña.' }),
    ).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Descargar' }));
    expect(download).toHaveBeenCalledWith(ID);
    expect(open).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('link', { name: 'Volver' })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    await waitFor(() => expect(authFetch).toHaveBeenCalledTimes(2), WAIT);
    const b = jest.mocked(openPdfSession).mock.calls[1]?.[0];
    expect(b?.url === a.url).toBe(true);
    expect(a.signal.aborted).toBe(true);
    expect(b?.signal.aborted).toBe(false);
    act(() => a.onFailure({ reason: 'corrupt', correlationId: '' }));
    expect(screen.queryByRole('button', { name: 'Reintentar' })).toBeNull();
    privateDom(container);
  });

  it('CA-2: cleanup diferido bloquea reemisión y ready tardío de A no afecta PDF B', async () => {
    let readyA = (): void => undefined;
    renderPage.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          readyA = resolve;
        }),
    );
    let finishCleanup = (): void => undefined;
    dispose.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishCleanup = resolve;
        }),
    );
    show();
    await waitFor(() => expect(renderPage).toHaveBeenCalledTimes(1), WAIT);
    const a = jest.mocked(openPdfSession).mock.calls[0]?.[0];
    if (a === undefined) throw new Error('Falta PDF A');
    act(() => a.onFailure({ reason: 'corrupt', correlationId: '' }));
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(authFetch).toHaveBeenCalledTimes(1);
    expect(a.signal.aborted).toBe(true);
    await act(async () => finishCleanup());
    await waitFor(() => expect(authFetch).toHaveBeenCalledTimes(2), WAIT);
    await waitFor(() => expect(renderPage).toHaveBeenCalledTimes(2), WAIT);
    await act(async () => readyA());
    expect(screen.queryByRole('button', { name: 'Reintentar' })).toBeNull();
    expect(
      screen.getByRole('region', { name: 'Vista previa' }).getAttribute('aria-busy'),
    ).toBeNull();
  });

  it.each([403, 404])('CA-7: reemisión %s retira metadata y PDF anteriores', async (status) => {
    authFetch.mockResolvedValueOnce(DELIVERY).mockRejectedValueOnce(
      new ApiClientError({
        status,
        code: status === 403 ? 'SHARED_FORBIDDEN' : 'STORAGE_NODE_NOT_FOUND',
        message: DELIVERY.url,
        correlationId: '',
      }),
    );
    const { container } = show();
    await waitFor(() => expect(renderPage).toHaveBeenCalledTimes(1), WAIT);
    act(() =>
      jest
        .mocked(openPdfSession)
        .mock.calls[0]?.[0].onFailure({ reason: 'corrupt', correlationId: '' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    await waitFor(() => expect(authFetch).toHaveBeenCalledTimes(2), WAIT);
    expect(container.textContent?.includes('Informe.pdf')).toBe(false);
    expect(container.querySelector('canvas')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Descargar' })).toBeNull();
    privateDom(container);
  });

  it('CA-2: fallo durante apertura espera destruir loadingTask antes de reemitir', async () => {
    let finishOpening = (): void => undefined;
    jest.mocked(openPdfSession).mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          finishOpening = () => reject(new PdfReadError('protected'));
        }),
    );
    show();
    await waitFor(() => expect(openPdfSession).toHaveBeenCalledTimes(1), WAIT);
    act(() =>
      jest
        .mocked(openPdfSession)
        .mock.calls[0]?.[0].onFailure({ reason: 'protected', correlationId: '' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(authFetch).toHaveBeenCalledTimes(1);
    expect(disposeRuntime).not.toHaveBeenCalled();
    await act(async () => finishOpening());
    await waitFor(() => expect(authFetch).toHaveBeenCalledTimes(2), WAIT);
    expect(disposeRuntime).toHaveBeenCalledTimes(1);
  });

  it('CA-7: unmount durante apertura aborta, libera entrega tardía y no publica failure', async () => {
    let finish = (_session: Awaited<ReturnType<typeof openPdfSession>>): void => undefined;
    jest.mocked(openPdfSession).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const { unmount, container } = show();
    await waitFor(() => expect(openPdfSession).toHaveBeenCalledTimes(1), WAIT);
    const signal = jest.mocked(openPdfSession).mock.calls[0]?.[0].signal;
    unmount();
    await act(async () => finish({ numPages: 2, renderPage, dispose }));
    expect(signal?.aborted).toBe(true);
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(renderPage).not.toHaveBeenCalled();
    expect(container.innerHTML).toBe('');
  });

  it('CA-2: URL vencida se presenta como caducada y Reintentar emite una entrega nueva', async () => {
    const fresh = { ...DELIVERY, expiresAt: '2026-10-10T10:11:00.000Z' };
    authFetch.mockReset().mockResolvedValueOnce(DELIVERY).mockResolvedValueOnce(fresh);
    const { container } = show();
    await waitFor(() => expect(renderPage).toHaveBeenCalledTimes(1), WAIT);
    const a = jest.mocked(openPdfSession).mock.calls[0]?.[0];
    if (a === undefined) throw new Error('Falta PDF A');
    clock.mockReturnValue(Date.parse('2026-10-10T10:06:00.000Z'));
    act(() => a.onFailure({ reason: 'unavailable', correlationId: '' }));
    expect(screen.getByRole('heading', { name: 'La vista previa caducó.' })).toBeTruthy();
    const actions = [
      ...container.querySelectorAll('[role="alert"] button, [role="status"] button'),
    ];
    expect(actions.map((button) => button.textContent)).toEqual(['Reintentar', 'Descargar']);
    privateDom(container);
    expect(container.innerHTML.includes(DELIVERY.expiresAt)).toBe(false);
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    await waitFor(() => expect(openPdfSession).toHaveBeenCalledTimes(2), WAIT);
    expect(authFetch).toHaveBeenCalledTimes(2);
    act(() => a.onFailure({ reason: 'unavailable', correlationId: '' }));
    expect(screen.queryByRole('heading', { name: 'La vista previa caducó.' })).toBeNull();
    act(() =>
      jest
        .mocked(openPdfSession)
        .mock.calls[1]?.[0].onFailure({ reason: 'unavailable', correlationId: '' }),
    );
    expect(
      screen.getByRole('heading', {
        name: 'La vista previa no está disponible para este archivo.',
      }),
    ).toBeTruthy();
  });

  it('CA-2: memoria agotada muestra causa saneada con Descargar primero y Reintentar', async () => {
    jest.mocked(openPdfSession).mockRejectedValueOnce(new PdfReadError('memory'));
    const { container } = show();
    const retry = await screen.findByRole('button', { name: 'Reintentar' });
    const actions = [
      ...container.querySelectorAll('[role="alert"] button, [role="status"] button'),
    ];
    expect(actions.map((button) => button.textContent)).toEqual(['Descargar', 'Reintentar']);
    expect(actions[1]).toBe(retry);
    expect(container.querySelector('canvas')).toBeNull();
    privateDom(container);
    expect((await axe(container)).violations).toEqual([]);
  });

  it('CA-2: error del worker saneado conserva acciones sin filtrar excepción', async () => {
    jest.mocked(createPdfRuntime).mockRejectedValueOnce(new Error(DELIVERY.url));
    const { container } = show();
    await waitFor(
      () => expect(screen.queryByRole('button', { name: 'Reintentar' }) !== null).toBe(true),
      WAIT,
    );
    expect(screen.getByRole('button', { name: 'Descargar' })).toBeTruthy();
    privateDom(container);
  });
});
