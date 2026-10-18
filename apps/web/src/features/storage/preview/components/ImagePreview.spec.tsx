/** @jest-environment jsdom */
import { Blob as NativeBlob } from 'node:buffer';
import { ReadableStream as NativeReadableStream } from 'node:stream/web';

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import NextImage from 'next/image';

import { useAuthFetch } from '../../../identity/session/use-auth-fetch';
import type { PreviewFailure } from '../preview-failure';
import { detectImageMime } from '../readers/image-mime';
import { fetchObjectBytes, type ObjectBytes } from '../readers/object-bytes';

import { ImagePreview } from './ImagePreview';

jest.mock('../readers/object-bytes', () => ({ fetchObjectBytes: jest.fn() }));
jest.mock('../readers/image-mime', () => ({ detectImageMime: jest.fn() }));
jest.mock('../../../identity/session/use-auth-fetch', () => ({ useAuthFetch: jest.fn() }));
jest.mock('next/image', () => ({ __esModule: true, default: jest.fn(() => null) }));

const fetchBytes = jest.mocked(fetchObjectBytes);
const detectMime = jest.mocked(detectImageMime);
const authRequest = jest.fn<Promise<unknown>, [string, RequestInit?]>();
const directFetch = jest.fn<Promise<unknown>, [unknown, unknown?]>();
const createUrl = jest.fn<string, [Blob]>();
const revokeUrl = jest.fn((_url: string): void => undefined);
const decode = jest.fn<Promise<void>, []>();
const blobConstructor = jest.fn(
  (...args: ConstructorParameters<typeof NativeBlob>) => new NativeBlob(...args),
);

const URL_A = 'https://objects.test/private-object-a?X-Amz-Signature=PRIVATE_SIGNATURE_A';
const URL_B = 'https://objects.test/private-object-b?X-Amz-Signature=PRIVATE_SIGNATURE_B';
const BLOB_A = 'blob:https://web.test/image-a';
const BLOB_B = 'blob:https://web.test/image-b';
const BYTES = Uint8Array.of(1, 2, 3, 4, 5, 6, 7, 8);

// jsdom no aporta todas las APIs binarias del navegador; la sustitución vive solo en esta suite.
const browserProperties = [
  [globalThis, 'Blob'],
  [globalThis, 'ReadableStream'],
  [globalThis, 'fetch'],
  [URL, 'createObjectURL'],
  [URL, 'revokeObjectURL'],
  [HTMLImageElement.prototype, 'decode'],
] as const;
const originalProperties = browserProperties.map(([target, key]) => ({
  target,
  key,
  descriptor: Object.getOwnPropertyDescriptor(target, key),
}));

let logs: readonly jest.SpyInstance[] = [];

function installProperty(target: object, key: string, value: unknown): void {
  Object.defineProperty(target, key, { configurable: true, writable: true, value });
}

function completeBody(): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(BYTES.slice());
      controller.close();
    },
  });
}

function controlledSource() {
  let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
  const cancel = jest.fn();
  const body = new ReadableStream<Uint8Array>({
    start(source) {
      controller = source;
    },
    cancel,
  });
  if (controller === undefined) throw new Error('Falta el controlador del stream de prueba');
  return { body, controller, cancel };
}

function pendingDelivery() {
  let resolve: (value: ObjectBytes) => void = () => {
    throw new Error('Falta la entrega pendiente');
  };
  let reject: (error: unknown) => void = () => {
    throw new Error('Falta la entrega pendiente');
  };
  const promise = new Promise<ObjectBytes>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function renderImage(url = URL_A) {
  const onFailure = jest.fn((_failure: PreviewFailure): void => undefined);
  return { ...render(<ImagePreview url={url} onFailure={onFailure} />), onFailure };
}

function requestAt(index = 0) {
  const request = fetchBytes.mock.calls[index]?.[0];
  if (request === undefined) throw new Error('Falta la solicitud de bytes del lector');
  return request;
}

function createdBlob(): Blob {
  const blob = createUrl.mock.calls[0]?.[0];
  if (blob === undefined) throw new Error('Falta el Blob local');
  return blob;
}

function expectRevoked(url: string): void {
  expect(revokeUrl).toHaveBeenCalledTimes(1);
  expect(revokeUrl.mock.calls[0]?.[0] === url).toBe(true);
}

function expectPrivateDom(container: HTMLElement): void {
  for (const secret of [URL_A, URL_B, 'X-Amz-Signature', 'PRIVATE_', 'private-object'])
    expect(container.innerHTML.includes(secret)).toBe(false);
}

function expectFailure(
  callback: jest.Mock<void, [PreviewFailure]>,
  reason: 'corrupt' | 'unavailable',
): void {
  expect(callback).toHaveBeenCalledTimes(1);
  const failure = callback.mock.calls[0]?.[0];
  expect(failure?.reason === reason).toBe(true);
  expect(failure?.correlationId === '').toBe(true);
  expect(Object.keys(failure ?? {}).sort()).toEqual(['correlationId', 'reason']);
  expect(/PRIVATE_|X-Amz-Signature|private-object/.test(JSON.stringify(failure))).toBe(false);
}

function privateError(): Error {
  return new Error(`PRIVATE_MESSAGE ${URL_A}`, { cause: new Error('PRIVATE_CAUSE') });
}

describe('ImagePreview T-07: lector nativo y lifecycle propio', () => {
  beforeEach(() => {
    installProperty(globalThis, 'ReadableStream', NativeReadableStream);
    installProperty(globalThis, 'Blob', blobConstructor);
    Object.defineProperty(blobConstructor, 'prototype', { value: NativeBlob.prototype });
    installProperty(globalThis, 'fetch', directFetch);
    installProperty(URL, 'createObjectURL', createUrl);
    installProperty(URL, 'revokeObjectURL', revokeUrl);
    installProperty(HTMLImageElement.prototype, 'decode', decode);
    blobConstructor.mockClear();
    directFetch.mockReset().mockResolvedValue(undefined);
    authRequest.mockReset().mockResolvedValue(undefined);
    jest.mocked(useAuthFetch).mockReset().mockReturnValue(authRequest);
    fetchBytes.mockReset().mockResolvedValue({ body: completeBody() });
    detectMime.mockReset().mockReturnValue('image/png');
    createUrl.mockReset().mockReturnValue(BLOB_A);
    revokeUrl.mockReset();
    decode.mockReset().mockResolvedValue(undefined);
    jest.spyOn(window, 'open').mockReturnValue(null);
    logs = (['log', 'info', 'warn', 'error', 'debug'] as const).map((method) =>
      jest.spyOn(console, method).mockImplementation(() => undefined),
    );
  });

  afterEach(() => {
    try {
      cleanup();
      for (const log of logs) expect(log).toHaveBeenCalledTimes(0);
    } finally {
      jest.restoreAllMocks();
      for (const { target, key, descriptor } of originalProperties) {
        if (descriptor === undefined) Reflect.deleteProperty(target, key);
        else Object.defineProperty(target, key, descriptor);
      }
    }
  });

  it('CA-11: usa solo el helper con URL y señal, sin headers, fetch directo ni navegación', async () => {
    const href = window.location.href;
    const { container } = renderImage();
    const image = await screen.findByRole('img');
    expect(fetchBytes).toHaveBeenCalledTimes(1);
    expect(requestAt().url === URL_A).toBe(true);
    expect(requestAt().signal instanceof AbortSignal).toBe(true);
    expect(requestAt().signal.aborted).toBe(false);
    expect(Object.keys(requestAt()).sort()).toEqual(['signal', 'url']);
    expect(directFetch).toHaveBeenCalledTimes(0);
    expect(useAuthFetch).toHaveBeenCalledTimes(0);
    expect(authRequest).toHaveBeenCalledTimes(0);
    expect(NextImage).toHaveBeenCalledTimes(0);
    expect(window.open).toHaveBeenCalledTimes(0);
    expect(window.location.href === href).toBe(true);
    expect(image.tagName).toBe('IMG');
    expect(image.getAttribute('src') === BLOB_A).toBe(true);
    expect(container.querySelector('a,iframe,object,embed')).toBeNull();
    expectPrivateDom(container);
  });

  it('CA-1: espera EOF y reconstruye tres chunks en orden antes de detectar MIME y crear Blob', async () => {
    const source = controlledSource();
    fetchBytes.mockResolvedValue({ body: source.body });
    renderImage();
    await act(async () => {
      source.controller.enqueue(BYTES.slice(0, 2));
      source.controller.enqueue(BYTES.slice(2, 5));
      source.controller.enqueue(BYTES.slice(5));
    });
    expect(detectMime).toHaveBeenCalledTimes(0);
    expect(blobConstructor).toHaveBeenCalledTimes(0);
    expect(createUrl).toHaveBeenCalledTimes(0);
    expect(screen.queryByRole('img')).toBeNull();
    await act(async () => source.controller.close());
    await screen.findByRole('img');
    expect(detectMime).toHaveBeenCalledTimes(1);
    const detected = detectMime.mock.calls[0]?.[0];
    if (detected === undefined) throw new Error('Faltan los bytes para detectar MIME');
    expect(Array.from(detected)).toEqual(Array.from(BYTES));
    expect(Array.from(new Uint8Array(await createdBlob().arrayBuffer()))).toEqual(
      Array.from(BYTES),
    );
    expect(source.body.locked).toBe(false);
  });

  it.each(['image/png', 'image/jpeg', 'image/gif', 'image/webp'] as const)(
    'CA-1: usa el MIME local %s para el Blob y solo su object URL para img',
    async (mime) => {
      detectMime.mockReturnValue(mime);
      const { container } = renderImage();
      const image = await screen.findByRole('img');
      expect(createdBlob().type === mime).toBe(true);
      expect(createUrl).toHaveBeenCalledTimes(1);
      expect(image.getAttribute('src') === BLOB_A).toBe(true);
      expect(image.getAttribute('src')?.startsWith('blob:')).toBe(true);
      expect(image.getAttribute('srcset')).toBeNull();
      expectPrivateDom(container);
    },
  );

  it('CA-2: MIME null informa corrupt sin Blob, object URL ni imagen parcial', async () => {
    const body = completeBody();
    fetchBytes.mockResolvedValue({ body });
    detectMime.mockReturnValue(null);
    const { container, onFailure } = renderImage();
    await waitFor(() => expect(onFailure).toHaveBeenCalledTimes(1));
    expectFailure(onFailure, 'corrupt');
    expect(blobConstructor).toHaveBeenCalledTimes(0);
    expect(createUrl).toHaveBeenCalledTimes(0);
    expect(screen.queryByRole('img')).toBeNull();
    expect(body.locked).toBe(false);
    expectPrivateDom(container);
  });

  it('CA-1: load nativo conserva la imagen y su object URL viva mientras siga vigente', async () => {
    const { onFailure } = renderImage();
    const image = await screen.findByRole('img');
    await act(async () => {
      fireEvent.load(image);
    });
    expect(screen.getByRole('img').getAttribute('src') === BLOB_A).toBe(true);
    expect(onFailure).toHaveBeenCalledTimes(0);
    expect(revokeUrl).toHaveBeenCalledTimes(0);
  });

  it('CA-2: error nativo informa corrupt, retira img y revoca sin doble cleanup', async () => {
    const { container, onFailure, unmount } = renderImage();
    const image = await screen.findByRole('img');
    await act(async () => {
      fireEvent.error(image);
    });
    await waitFor(() => expect(screen.queryByRole('img')).toBeNull());
    expectFailure(onFailure, 'corrupt');
    expectRevoked(BLOB_A);
    expectPrivateDom(container);
    unmount();
    expectRevoked(BLOB_A);
  });

  it('CA-2: unmount aborta la señal y revoca exactamente la object URL vigente', async () => {
    const { unmount, onFailure } = renderImage();
    await screen.findByRole('img');
    const signal = requestAt().signal;
    await act(async () => unmount());
    expect(signal.aborted).toBe(true);
    expectRevoked(BLOB_A);
    expect(onFailure).toHaveBeenCalledTimes(0);
  });

  it('CA-2: cambiar URL retira y revoca A antes de completar una nueva lectura B', async () => {
    const pending = pendingDelivery();
    fetchBytes.mockReturnValueOnce(Promise.resolve({ body: completeBody() }));
    fetchBytes.mockReturnValueOnce(pending.promise);
    const { rerender, onFailure } = renderImage();
    await screen.findByRole('img');
    const previous = requestAt().signal;
    createUrl.mockReturnValue(BLOB_B);
    rerender(<ImagePreview url={URL_B} onFailure={onFailure} />);
    expect(previous.aborted).toBe(true);
    expectRevoked(BLOB_A);
    expect(screen.queryByRole('img')).toBeNull();
    expect(fetchBytes).toHaveBeenCalledTimes(2);
    expect(requestAt(1).url === URL_B).toBe(true);
    expect(requestAt(1).signal === previous).toBe(false);
    await act(async () => pending.resolve({ body: completeBody() }));
    expect((await screen.findByRole('img')).getAttribute('src') === BLOB_B).toBe(true);
    expect(onFailure).toHaveBeenCalledTimes(0);
  });

  it('CA-2: cambiar URL durante el stream cancela A y no mezcla sus bytes con B', async () => {
    const source = controlledSource();
    fetchBytes.mockResolvedValueOnce({ body: source.body });
    const { rerender, onFailure } = renderImage();
    await act(async () => source.controller.enqueue(Uint8Array.of(99)));
    const previous = requestAt().signal;
    createUrl.mockReturnValue(BLOB_B);
    rerender(<ImagePreview url={URL_B} onFailure={onFailure} />);
    await screen.findByRole('img');
    expect(previous.aborted).toBe(true);
    expect(source.cancel).toHaveBeenCalledTimes(1);
    expect(source.body.locked).toBe(false);
    expect(Array.from(new Uint8Array(await createdBlob().arrayBuffer()))).toEqual(
      Array.from(BYTES),
    );
    expect(createUrl).toHaveBeenCalledTimes(1);
    expect(onFailure).toHaveBeenCalledTimes(0);
  });

  it('CA-2: entrega tardía de A que ignora abort no reemplaza B ni crea otra object URL', async () => {
    const pending = pendingDelivery();
    fetchBytes.mockReturnValueOnce(pending.promise);
    createUrl.mockReturnValue(BLOB_B);
    const { rerender, onFailure } = renderImage();
    const previous = requestAt().signal;
    rerender(<ImagePreview url={URL_B} onFailure={onFailure} />);
    await screen.findByRole('img');
    const stale = controlledSource();
    stale.controller.enqueue(BYTES.slice());
    stale.controller.close();
    await act(async () => pending.resolve({ body: stale.body }));
    expect(previous.aborted).toBe(true);
    expect(screen.getByRole('img').getAttribute('src') === BLOB_B).toBe(true);
    expect(createUrl).toHaveBeenCalledTimes(1);
    expect(stale.cancel).toHaveBeenCalledTimes(1);
    expect(stale.body.locked).toBe(false);
    expect(onFailure).toHaveBeenCalledTimes(0);
  });

  it('CA-2: unmount durante read pendiente cancela y silencia un error privado tardío', async () => {
    const source = controlledSource();
    fetchBytes.mockResolvedValue({ body: source.body });
    const { unmount, onFailure, container } = renderImage();
    await act(async () => undefined);
    expect(source.body.locked).toBe(true);
    const signal = requestAt().signal;
    await act(async () => unmount());
    await act(async () => source.controller.error(privateError()));
    expect(signal.aborted).toBe(true);
    expect(source.cancel).toHaveBeenCalledTimes(1);
    expect(source.body.locked).toBe(false);
    expect(createUrl).toHaveBeenCalledTimes(0);
    expect(onFailure).toHaveBeenCalledTimes(0);
    expect(screen.queryByRole('img')).toBeNull();
    expectPrivateDom(container);
  });

  it('CA-2: rechazo tardío del helper tras unmount no notifica ni crea recursos', async () => {
    const pending = pendingDelivery();
    fetchBytes.mockReturnValue(pending.promise);
    const { unmount, onFailure } = renderImage();
    const signal = requestAt().signal;
    unmount();
    await act(async () => pending.reject(privateError()));
    expect(signal.aborted).toBe(true);
    expect(onFailure).toHaveBeenCalledTimes(0);
    expect(blobConstructor).toHaveBeenCalledTimes(0);
    expect(createUrl).toHaveBeenCalledTimes(0);
  });

  it('CA-2: rechazo del transporte informa unavailable sin excepción ni contenido privado', async () => {
    fetchBytes.mockRejectedValue(privateError());
    const { container, onFailure } = renderImage();
    await waitFor(() => expect(onFailure).toHaveBeenCalledTimes(1));
    expectFailure(onFailure, 'unavailable');
    expect(blobConstructor).toHaveBeenCalledTimes(0);
    expect(createUrl).toHaveBeenCalledTimes(0);
    expect(screen.queryByRole('img')).toBeNull();
    expectPrivateDom(container);
  });

  it('CA-2: fallo del body informa unavailable y libera el reader sin contenido parcial', async () => {
    const source = controlledSource();
    fetchBytes.mockResolvedValue({ body: source.body });
    const { container, onFailure } = renderImage();
    await act(async () => source.controller.error(privateError()));
    await waitFor(() => expect(onFailure).toHaveBeenCalledTimes(1));
    expectFailure(onFailure, 'unavailable');
    expect(source.body.locked).toBe(false);
    expect(createUrl).toHaveBeenCalledTimes(0);
    expect(screen.queryByRole('img')).toBeNull();
    expectPrivateDom(container);
  });

  it.each(['Error', 'RangeError'] as const)(
    'CA-2: createObjectURL con %s informa unavailable, sin asumir memoria ni filtrar datos',
    async (kind) => {
      createUrl.mockImplementation(() => {
        if (kind === 'RangeError') throw new RangeError(`PRIVATE_RESOURCE ${URL_A}`);
        throw privateError();
      });
      const { container, onFailure, unmount } = renderImage();
      await waitFor(() => expect(onFailure).toHaveBeenCalledTimes(1));
      expectFailure(onFailure, 'unavailable');
      expect(screen.queryByRole('img')).toBeNull();
      expect(revokeUrl).toHaveBeenCalledTimes(0);
      expectPrivateDom(container);
      const signal = requestAt().signal;
      unmount();
      expect(signal.aborted).toBe(true);
      expect(onFailure).toHaveBeenCalledTimes(1);
      expect(revokeUrl).toHaveBeenCalledTimes(0);
    },
  );

  it('CA-9: avisa ready solo cuando el decoder nativo termina de cargar', async () => {
    const onReady = jest.fn();
    render(<ImagePreview url={URL_A} onFailure={jest.fn()} onReady={onReady} />);
    const image = await screen.findByRole('img');
    expect(onReady).toHaveBeenCalledTimes(0);
    await act(async () => {
      fireEvent.load(image);
    });
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it('CA-2: registra una limpieza esperable que libera la lectura antes de reemitir', async () => {
    const source = controlledSource();
    const disposals: Array<() => Promise<void>> = [];
    const registerCleanup = (dispose: () => Promise<void>) => {
      disposals.push(dispose);
      return () => undefined;
    };
    fetchBytes.mockResolvedValue({ body: source.body });
    const { unmount } = render(
      <ImagePreview url={URL_A} onFailure={jest.fn()} registerCleanup={registerCleanup} />,
    );
    await act(async () => undefined);
    expect(disposals).toHaveLength(1);
    const dispose = disposals[0];
    if (dispose === undefined) throw new Error('Falta limpieza del lector');
    await act(async () => {
      await dispose();
      await dispose();
    });
    expect(requestAt().signal.aborted).toBe(true);
    expect(source.cancel).toHaveBeenCalledTimes(1);
    expect(source.body.locked).toBe(false);
    unmount();
    expect(source.cancel).toHaveBeenCalledTimes(1);
  });

  it('CA-9: img es identificable sin nombre de archivo y no agrega un foco extra', async () => {
    const { container } = renderImage();
    const image = await screen.findByRole('img');
    expect((image.getAttribute('alt')?.trim().length ?? 0) > 0).toBe(true);
    expect(image.tabIndex).toBe(-1);
    expectPrivateDom(container);
  });
});
