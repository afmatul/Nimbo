/** @jest-environment jsdom */
import { Blob as NativeBlob } from 'node:buffer';
import { ReadableStream as NativeReadableStream } from 'node:stream/web';
import { TextDecoder as NativeTextDecoder, TextEncoder as NativeTextEncoder } from 'node:util';

import type { PreviewUrlResponse } from '@nimbo/contracts';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import type { ComponentProps, ReactNode } from 'react';

import { PreviewPage } from './PreviewPage';

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

const objectFetch = jest.fn<Promise<Response>, Parameters<typeof fetch>>();
const createUrl = jest.fn<string, [Blob]>();
const revokeUrl = jest.fn((_url: string): void => undefined);
const properties = [
  [globalThis, 'ReadableStream'],
  [globalThis, 'TextDecoder'],
  [globalThis, 'Blob'],
  [globalThis, 'fetch'],
  [URL, 'createObjectURL'],
  [URL, 'revokeObjectURL'],
] as const;
const originals = properties.map(([target, key]) => ({
  target,
  key,
  descriptor: Object.getOwnPropertyDescriptor(target, key),
}));
let logs: readonly jest.SpyInstance[] = [];
let writes: jest.SpyInstance;
let cookies: jest.SpyInstance;

const ID = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const FOLDER = '33333333-3333-4333-8333-333333333333';
const SIGNED = 'https://objects.test/private-object?X-Amz-Signature=PRIVATE_SIGNATURE';
const BLOB_A = 'blob:https://web.test/preview-a';
const BLOB_B = 'blob:https://web.test/preview-b';
const SAFE_WAIT = { onTimeout: () => new Error('No se observó el estado esperado de preview') };

function delivery(kind: 'imagen' | 'texto', name = 'Archivo.txt', id = ID): PreviewUrlResponse {
  return {
    file: {
      id,
      name,
      kind,
      folderId: FOLDER,
      sizeBytes: 100,
      createdAt: '2026-10-10T10:00:00.000Z',
      updatedAt: '2026-10-10T10:00:00.000Z',
    },
    url: SIGNED,
    expiresAt: '2026-10-10T10:05:00.000Z',
  };
}

function encode(text: string): Uint8Array {
  return new NativeTextEncoder().encode(text);
}

function source() {
  let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
  const cancel = jest.fn();
  const body = new ReadableStream<Uint8Array>({
    start(value) {
      controller = value;
    },
    cancel,
  });
  if (controller === undefined) throw new Error('Falta stream de prueba');
  return { body, controller, cancel };
}

function fullBody(bytes: Uint8Array): ReadableStream<Uint8Array> {
  const value = source();
  value.controller.enqueue(bytes);
  value.controller.close();
  return value.body;
}

function response(body: ReadableStream<Uint8Array>): Response {
  // Doble del fetch nativo: solo los campos usados en GET completo; el helper y su stream son reales.
  return { status: 200, body, bodyUsed: false } as Response;
}

function renderPage() {
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

function objectSignal(index = 0): AbortSignal {
  const signal = objectFetch.mock.calls[index]?.[1]?.signal;
  if (signal === undefined || signal === null) throw new Error('Falta señal de lectura');
  return signal;
}

async function image(): Promise<HTMLElement> {
  await waitFor(() => expect(screen.queryByRole('img') !== null).toBe(true), SAFE_WAIT);
  const element = screen.queryByRole('img');
  if (element === null) throw new Error('Falta imagen local');
  return element;
}

async function text(container: HTMLElement, expected: string): Promise<void> {
  await waitFor(
    () => expect(container.querySelector('pre')?.textContent === expected).toBe(true),
    SAFE_WAIT,
  );
}

function privateDom(container: HTMLElement): void {
  expect(/PRIVATE_|X-Amz-Signature|private-object/.test(container.innerHTML)).toBe(false);
}

describe('PreviewPage con lectores y transporte reales, red y decoder gráfico controlados', () => {
  beforeEach(() => {
    // Reloj fijo en la emisión: la entrega del fixture sigue vigente (un fallo vencido sería `expired`).
    jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-10T10:00:00.000Z'));
    for (const [target, key, value] of [
      [globalThis, 'ReadableStream', NativeReadableStream],
      [globalThis, 'TextDecoder', NativeTextDecoder],
      [globalThis, 'Blob', NativeBlob],
      [globalThis, 'fetch', objectFetch],
      [URL, 'createObjectURL', createUrl],
      [URL, 'revokeObjectURL', revokeUrl],
    ] as const)
      Object.defineProperty(target, key, { configurable: true, writable: true, value });
    objectFetch.mockReset().mockImplementation(async () => response(fullBody(encode('Texto B'))));
    createUrl.mockReset().mockReturnValue(BLOB_A);
    revokeUrl.mockReset();
    authFetch.mockReset().mockResolvedValue(delivery('texto'));
    download.mockReset();
    writes = jest.spyOn(Storage.prototype, 'setItem');
    cookies = jest.spyOn(Document.prototype, 'cookie', 'set');
    logs = (['log', 'info', 'warn', 'error', 'debug'] as const).map((method) =>
      jest.spyOn(console, method).mockImplementation(() => undefined),
    );
  });
  afterEach(() => {
    try {
      cleanup();
      expect(writes).toHaveBeenCalledTimes(0);
      expect(cookies).toHaveBeenCalledTimes(0);
      for (const log of logs) expect(log).toHaveBeenCalledTimes(0);
    } finally {
      jest.restoreAllMocks();
      for (const { target, key, descriptor } of originals) {
        if (descriptor === undefined) Reflect.deleteProperty(target, key);
        else Object.defineProperty(target, key, descriptor);
      }
    }
  });

  // Firmas mínimas: el evento gráfico se controla aquí; la decodificación real de archivos queda en T-10.
  it.each([
    ['png', Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a), 'image/png'],
    ['jpg', Uint8Array.of(0xff, 0xd8, 0xff), 'image/jpeg'],
    ['jpeg', Uint8Array.of(0xff, 0xd8, 0xff), 'image/jpeg'],
    ['gif', encode('GIF89a'), 'image/gif'],
    ['webp', encode('RIFF....WEBP'), 'image/webp'],
  ] as const)(
    'CA-1/11: %s recorre emisión, helper, MIME local, Blob e img',
    async (extension, bytes, mime) => {
      authFetch.mockResolvedValue(delivery('imagen', `Archivo.${extension}`));
      objectFetch.mockImplementation(async () => response(fullBody(bytes)));
      const { container } = renderPage();
      const element = await image();
      expect(element.getAttribute('src') === BLOB_A).toBe(true);
      const blob = createUrl.mock.calls[0]?.[0];
      expect(blob?.type === mime).toBe(true);
      if (blob === undefined) throw new Error('Falta Blob');
      expect(Array.from(new Uint8Array(await blob.arrayBuffer()))).toEqual(Array.from(bytes));
      expect(objectFetch).toHaveBeenCalledTimes(1);
      expect(objectFetch.mock.calls[0]?.[0] === SIGNED).toBe(true);
      const options = objectFetch.mock.calls[0]?.[1];
      expect(options?.credentials === 'omit' && options.method === 'GET').toBe(true);
      expect(options?.headers === undefined).toBe(true);
      await act(async () => {
        fireEvent.load(element);
      });
      expect(
        screen.getByRole('region', { name: 'Vista previa' }).getAttribute('aria-busy'),
      ).toBeNull();
      privateDom(container);
    },
  );

  it.each(['txt', 'md'])(
    'CA-1: %s recorre el helper y muestra texto literal UTF-8',
    async (extension) => {
      const content = '# Título\n**negrita**\n<b>texto</b> 😀';
      authFetch.mockResolvedValue(delivery('texto', `Notas.${extension}`));
      objectFetch.mockImplementation(async () => response(fullBody(encode(content))));
      const { container } = renderPage();
      await text(container, content);
      expect(container.querySelector('pre')?.querySelector('b,strong,a,script')).toBeNull();
      expect(createUrl).toHaveBeenCalledTimes(0);
      privateDom(container);
    },
  );

  it('CA-2/7: error gráfico conserva Download/Volver y retry libera A antes de reemitir', async () => {
    const a = fullBody(encode('GIF89a'));
    authFetch.mockResolvedValue(delivery('imagen', 'Imagen.gif'));
    objectFetch
      .mockResolvedValueOnce(response(a))
      .mockImplementation(async () => response(fullBody(encode('GIF89a'))));
    createUrl.mockReturnValueOnce(BLOB_A).mockReturnValue(BLOB_B);
    const { container, open } = renderPage();
    const previous = await image();
    const signal = objectSignal();
    await act(async () => {
      fireEvent.error(previous);
    });
    expect(screen.getByRole('alert').textContent).toContain('El original no cambió');
    download.mockResolvedValue({
      url: 'https://objects.test/download?signature=DOWNLOAD',
      expiresAt: delivery('imagen').expiresAt,
    });
    await userEvent.click(screen.getByRole('button', { name: 'Descargar' }));
    expect(download).toHaveBeenCalledWith(ID);
    expect(open.mock.calls[0]?.[0] === 'https://objects.test/download?signature=DOWNLOAD').toBe(
      true,
    );
    expect(screen.getByRole('link', { name: 'Volver' }).getAttribute('href')).toBe(
      `/archivos/carpeta/${FOLDER}?foco=${ID}`,
    );
    let retiredBeforePost = false;
    authFetch.mockImplementationOnce(async () => {
      retiredBeforePost = signal.aborted && !a.locked && revokeUrl.mock.calls.length === 1;
      return delivery('imagen', 'Imagen.gif');
    });
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect((await image()).getAttribute('src') === BLOB_B).toBe(true);
    expect(retiredBeforePost).toBe(true);
    expect(objectFetch).toHaveBeenCalledTimes(2);
    expect(revokeUrl.mock.calls[0]?.[0] === BLOB_A).toBe(true);
    privateDom(container);
  });

  it('CA-2: retry con la misma URL crea otra lectura real y espera cancel/release de A', async () => {
    const a = source();
    // UTF-8 inválido dispara la relectura como Windows-1252; si esa también falla, el estado es `unavailable`.
    objectFetch
      .mockResolvedValueOnce(response(a.body))
      .mockRejectedValueOnce(new Error('relectura caída'));
    const { container } = renderPage();
    await act(async () => a.controller.enqueue(encode('Parcial A')));
    await text(container, 'Parcial A');
    const previous = objectSignal();
    await act(async () => a.controller.enqueue(Uint8Array.of(0xc3, 0x28)));
    await waitFor(
      () => expect(screen.queryByRole('button', { name: 'Reintentar' }) !== null).toBe(true),
      SAFE_WAIT,
    );
    let retiredBeforePost = false;
    authFetch.mockImplementationOnce(async () => {
      retiredBeforePost = previous.aborted && !a.body.locked && a.cancel.mock.calls.length === 1;
      return delivery('texto');
    });
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    await text(container, 'Texto B');
    expect(authFetch).toHaveBeenCalledTimes(2);
    expect(objectFetch).toHaveBeenCalledTimes(3);
    expect(objectFetch.mock.calls[0]?.[0] === objectFetch.mock.calls[2]?.[0]).toBe(true);
    expect(objectSignal(2) === previous).toBe(false);
    expect(objectSignal(2).aborted).toBe(false);
    expect(retiredBeforePost).toBe(true);
    expect(screen.queryByRole('alert')).toBeNull();
    privateDom(container);
  });

  it('CA-7: cambio de fileId descarta un GET tardío aun si el fetch ignora abort', async () => {
    let resolve = (_value: Response): void => {
      throw new Error('Falta GET');
    };
    objectFetch.mockImplementationOnce(
      () =>
        new Promise<Response>((finish) => {
          resolve = finish;
        }),
    );
    authFetch
      .mockResolvedValueOnce(delivery('texto', 'Anterior.txt'))
      .mockResolvedValueOnce(delivery('texto', 'Nuevo.txt', OTHER));
    const { container, rerender, open } = renderPage();
    await act(async () => undefined);
    const previous = objectSignal();
    rerender(
      <PreviewPage fileId={OTHER} apiPublicUrl="https://api.test/api/v1" openDownloadUrl={open} />,
    );
    await text(container, 'Texto B');
    const stale = source();
    stale.controller.enqueue(encode('ANTERIOR_TARDIO'));
    stale.controller.close();
    await act(async () => resolve(response(stale.body)));
    expect(previous.aborted).toBe(true);
    expect(stale.cancel).toHaveBeenCalledTimes(1);
    expect(stale.body.locked).toBe(false);
    expect(container.querySelector('pre')?.textContent === 'Texto B').toBe(true);
    expect(screen.getByRole('heading', { level: 1, name: 'Nuevo.txt' })).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    privateDom(container);
  });

  it('CA-7: unmount cancela una lectura real pendiente sin unavailable ni logs', async () => {
    const current = source();
    objectFetch.mockResolvedValue(response(current.body));
    const { container, unmount } = renderPage();
    await act(async () => current.controller.enqueue(encode('Parcial')));
    await text(container, 'Parcial');
    const signal = objectSignal();
    await act(async () => unmount());
    expect(signal.aborted).toBe(true);
    expect(current.cancel).toHaveBeenCalledTimes(1);
    expect(current.body.locked).toBe(false);
    expect(container.innerHTML).toBe('');
  });

  it('CA-7: cambio de archivo revoca la imagen anterior antes de la nueva entrega', async () => {
    authFetch
      .mockResolvedValueOnce(delivery('imagen', 'Anterior.gif'))
      .mockReturnValueOnce(new Promise(() => undefined));
    objectFetch.mockImplementation(async () => response(fullBody(encode('GIF89a'))));
    const { container, rerender, open } = renderPage();
    await image();
    const previous = objectSignal();
    rerender(
      <PreviewPage fileId={OTHER} apiPublicUrl="https://api.test/api/v1" openDownloadUrl={open} />,
    );
    expect(previous.aborted).toBe(true);
    expect(revokeUrl).toHaveBeenCalledTimes(1);
    expect(revokeUrl.mock.calls[0]?.[0] === BLOB_A).toBe(true);
    expect(screen.queryByRole('img')).toBeNull();
    expect(container.textContent?.includes('Anterior.gif')).toBe(false);
    privateDom(container);
  });

  it.each(['', '  \n\t '])(
    'CA-1: texto vacío o blanco permanece válido dentro del shell: %j',
    async (content) => {
      objectFetch.mockImplementation(async () => response(fullBody(encode(content))));
      const { container } = renderPage();
      await text(container, content);
      // Un pre vacío existe también antes de EOF; esperar la finalización real de lectura.
      await waitFor(
        () =>
          expect(
            screen.getByRole('region', { name: 'Vista previa' }).getAttribute('aria-busy'),
          ).toBeNull(),
        SAFE_WAIT,
      );
      expect(screen.queryByRole('alert')).toBeNull();
      expect(container.textContent?.includes('Este archivo no tiene contenido para mostrar.')).toBe(
        false,
      );
      expect(
        screen.getByRole('region', { name: 'Vista previa' }).getAttribute('aria-busy'),
      ).toBeNull();
    },
  );

  it.each(['imagen', 'texto'] as const)(
    'CA-9: shell con lector real %s conserva foco y pasa axe',
    async (kind) => {
      authFetch.mockResolvedValue(delivery(kind));
      if (kind === 'imagen')
        objectFetch.mockImplementation(async () => response(fullBody(encode('GIF89a'))));
      const { container } = renderPage();
      if (kind === 'imagen') {
        const element = await image();
        await act(async () => {
          fireEvent.load(element);
        });
      } else await text(container, 'Texto B');
      expect(document.activeElement).toBe(screen.getByRole('region', { name: 'Vista previa' }));
      expect((await axe(container)).violations).toEqual([]);
    },
  );
});
