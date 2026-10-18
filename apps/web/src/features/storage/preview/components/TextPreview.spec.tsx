/** @jest-environment jsdom */
import { ReadableStream as NativeReadableStream } from 'node:stream/web';
import { TextDecoder as NativeTextDecoder, TextEncoder as NativeTextEncoder } from 'node:util';

import { act, cleanup, render, waitFor } from '@testing-library/react';

import { useAuthFetch } from '../../../identity/session/use-auth-fetch';
import type { PreviewFailure } from '../preview-failure';
import { fetchObjectBytes, type ObjectBytes } from '../readers/object-bytes';

import { TextPreview } from './TextPreview';

jest.mock('../readers/object-bytes', () => ({ fetchObjectBytes: jest.fn() }));
jest.mock('../../../identity/session/use-auth-fetch', () => ({ useAuthFetch: jest.fn() }));

const fetchBytes = jest.mocked(fetchObjectBytes);
const directFetch = jest.fn<Promise<unknown>, [unknown, unknown?]>();
const authRequest = jest.fn<Promise<unknown>, [string, RequestInit?]>();

// El decoder es real; solo se suplen APIs de navegador ausentes en jsdom.
const browserProperties = [
  [globalThis, 'ReadableStream'],
  [globalThis, 'TextDecoder'],
  [globalThis, 'fetch'],
] as const;
const originalProperties = browserProperties.map(([target, key]) => ({
  target,
  key,
  descriptor: Object.getOwnPropertyDescriptor(target, key),
}));

let logs: readonly jest.SpyInstance[] = [];
let storageWrite: jest.SpyInstance;
let initialHref: string;

const URL_A = 'https://objects.test/private-object-a?X-Amz-Signature=PRIVATE_SIGNATURE_A';
const URL_B = 'https://objects.test/private-object-b?X-Amz-Signature=PRIVATE_SIGNATURE_B';
const DEFAULT_TEXT = 'Texto de prueba.';
const WAIT_OPTIONS = {
  // Evitar que el diagnóstico automático de waitFor vuelque un DOM con datos privados.
  onTimeout: () => new Error('No se observó el estado esperado del lector'),
};

function installProperty(target: object, key: string, value: unknown): void {
  Object.defineProperty(target, key, { configurable: true, writable: true, value });
}

function encode(text: string): Uint8Array {
  return new NativeTextEncoder().encode(text);
}

function completeBody(text: string): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      if (text.length > 0) controller.enqueue(encode(text));
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

function deferred<T>() {
  let resolve: (value: T) => void = () => {
    throw new Error('Falta la operación pendiente');
  };
  let reject: (error: unknown) => void = () => {
    throw new Error('Falta la operación pendiente');
  };
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function renderText(url = URL_A) {
  const onFailure = jest.fn((_failure: PreviewFailure): void => undefined);
  return { ...render(<TextPreview url={url} onFailure={onFailure} />), onFailure };
}

function requestAt(index = 0) {
  const request = fetchBytes.mock.calls[index]?.[0];
  if (request === undefined) throw new Error('Falta la solicitud de bytes del lector');
  return request;
}

async function expectText(container: HTMLElement, text: string): Promise<void> {
  await waitFor(() => expect(container.textContent === text).toBe(true), WAIT_OPTIONS);
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

describe('TextPreview T-07: UTF-8 incremental literal y lifecycle propio', () => {
  beforeEach(() => {
    installProperty(globalThis, 'ReadableStream', NativeReadableStream);
    installProperty(globalThis, 'TextDecoder', NativeTextDecoder);
    installProperty(globalThis, 'fetch', directFetch);
    directFetch.mockReset().mockResolvedValue(undefined);
    authRequest.mockReset().mockResolvedValue(undefined);
    jest.mocked(useAuthFetch).mockReset().mockReturnValue(authRequest);
    fetchBytes.mockReset().mockResolvedValue({ body: completeBody(DEFAULT_TEXT) });
    initialHref = window.location.href;
    jest.spyOn(window, 'open').mockReturnValue(null);
    storageWrite = jest.spyOn(Storage.prototype, 'setItem');
    logs = (['log', 'info', 'warn', 'error', 'debug'] as const).map((method) =>
      jest.spyOn(console, method).mockImplementation(() => undefined),
    );
  });

  afterEach(() => {
    try {
      cleanup();
      for (const log of logs) expect(log).toHaveBeenCalledTimes(0);
      expect(storageWrite).toHaveBeenCalledTimes(0);
      expect(window.open).toHaveBeenCalledTimes(0);
      expect(window.location.href === initialHref).toBe(true);
    } finally {
      jest.restoreAllMocks();
      for (const { target, key, descriptor } of originalProperties) {
        if (descriptor === undefined) Reflect.deleteProperty(target, key);
        else Object.defineProperty(target, key, descriptor);
      }
    }
  });

  it('CA-11: usa solo el helper con URL y señal, sin headers ni transporte autenticado', async () => {
    const { container } = renderText();
    await expectText(container, DEFAULT_TEXT);
    expect(fetchBytes).toHaveBeenCalledTimes(1);
    expect(requestAt().url === URL_A).toBe(true);
    expect(requestAt().signal instanceof AbortSignal).toBe(true);
    expect(requestAt().signal.aborted).toBe(false);
    expect(Object.keys(requestAt()).sort()).toEqual(['signal', 'url']);
    expect(directFetch).toHaveBeenCalledTimes(0);
    expect(useAuthFetch).toHaveBeenCalledTimes(0);
    expect(authRequest).toHaveBeenCalledTimes(0);
    expectPrivateDom(container);
  });

  it('CA-1: muestra UTF-8 exacto sin caracteres de reemplazo', async () => {
    const text = 'Texto con á, ñ y 😀.\nSegunda línea.';
    fetchBytes.mockResolvedValue({ body: completeBody(text) });
    const { container, onFailure } = renderText();
    await expectText(container, text);
    expect(container.textContent?.includes('\ufffd')).toBe(false);
    expect(onFailure).toHaveBeenCalledTimes(0);
  });

  it.each([
    ['á', Uint8Array.of(0xc3, 0xa1)],
    ['ñ', Uint8Array.of(0xc3, 0xb1)],
    ['😀', Uint8Array.of(0xf0, 0x9f, 0x98, 0x80)],
  ] as const)('CA-1: conserva %s partido entre chunks antes del EOF', async (character, bytes) => {
    const source = controlledSource();
    fetchBytes.mockResolvedValue({ body: source.body });
    const { container, onFailure } = renderText();
    await act(async () => {
      source.controller.enqueue(encode('Antes '));
      source.controller.enqueue(bytes.slice(0, 1));
    });
    await expectText(container, 'Antes ');
    expect(container.textContent?.includes('\ufffd')).toBe(false);
    await act(async () => {
      source.controller.enqueue(bytes.slice(1));
      source.controller.enqueue(encode(' después'));
    });
    await expectText(container, `Antes ${character} después`);
    await act(async () => source.controller.close());
    expect(onFailure).toHaveBeenCalledTimes(0);
    expect(source.body.locked).toBe(false);
  });

  it.each([
    ['secuencia inválida durante stream', Uint8Array.of(0xc3, 0x28), false],
    ['secuencia incompleta al EOF', Uint8Array.of(0xf0, 0x9f, 0x98), true],
  ] as const)('CA-2: %s retira el parcial e informa corrupt', async (_label, bytes, close) => {
    const source = controlledSource();
    fetchBytes.mockResolvedValue({ body: source.body });
    const { container, onFailure } = renderText();
    await act(async () => source.controller.enqueue(encode('PARCIAL_VALIDO_T07')));
    await expectText(container, 'PARCIAL_VALIDO_T07');
    await act(async () => {
      source.controller.enqueue(bytes);
      if (close) source.controller.close();
    });
    await waitFor(() => expect(onFailure).toHaveBeenCalledTimes(1), WAIT_OPTIONS);
    expectFailure(onFailure, 'corrupt');
    expect(container.textContent?.includes('PARCIAL_VALIDO_T07')).toBe(false);
    expect(container.textContent?.includes('\ufffd')).toBe(false);
    expect(source.body.locked).toBe(false);
    if (!close) expect(source.cancel).toHaveBeenCalledTimes(1);
    expectPrivateDom(container);
  });

  it('CA-1: Markdown se muestra literal sin generar headings, formato, links ni listas', async () => {
    const text = '# Título\n**negrita**\n[enlace](https://example.test)\n- lista';
    fetchBytes.mockResolvedValue({ body: completeBody(text) });
    const { container } = renderText();
    await expectText(container, text);
    expect(container.querySelector('h1,h2,h3,strong,a,ul,ol,li') === null).toBe(true);
  });

  it('CA-1: HTML se muestra como texto sin crear elementos ejecutables', async () => {
    const text = '<script>alert(1)</script>\n<img src=x onerror=alert(1)>\n<b>texto</b>';
    fetchBytes.mockResolvedValue({ body: completeBody(text) });
    const { container } = renderText();
    await expectText(container, text);
    expect(container.querySelector('script,img,b,iframe,object,embed') === null).toBe(true);
  });

  it('CA-1: cero bytes es texto vacío válido, sin error ni estado de documento sin páginas', async () => {
    const body = completeBody('');
    fetchBytes.mockResolvedValue({ body });
    const { container, onFailure } = renderText();
    await act(async () => undefined);
    expect(fetchBytes).toHaveBeenCalledTimes(1);
    expect(body.locked).toBe(false);
    expect(container.textContent === '').toBe(true);
    expect(onFailure).toHaveBeenCalledTimes(0);
  });

  it('CA-1: conserva espacios, tabulaciones y saltos sin tratar el texto como vacío', async () => {
    const text = '  \n\t \n   ';
    fetchBytes.mockResolvedValue({ body: completeBody(text) });
    const { container, onFailure } = renderText();
    await expectText(container, text);
    expect(onFailure).toHaveBeenCalledTimes(0);
  });

  it('CA-1: publica y amplía texto antes del EOF, conservando el último fragmento multibyte', async () => {
    const source = controlledSource();
    fetchBytes.mockResolvedValue({ body: source.body });
    const { container, onFailure } = renderText();
    await act(async () => source.controller.enqueue(encode('Primero\n')));
    await expectText(container, 'Primero\n');
    await act(async () => {
      source.controller.enqueue(encode('Segundo '));
      source.controller.enqueue(Uint8Array.of(0xf0, 0x9f, 0x98));
    });
    await expectText(container, 'Primero\nSegundo ');
    await act(async () => {
      source.controller.enqueue(Uint8Array.of(0x80));
      source.controller.enqueue(encode('\nFinal'));
      source.controller.close();
    });
    await expectText(container, 'Primero\nSegundo 😀\nFinal');
    expect(onFailure).toHaveBeenCalledTimes(0);
    expect(source.body.locked).toBe(false);
  });

  it('CA-1: mantiene todo el contenido y MARCADOR_FINAL_T07 sin truncamiento', async () => {
    const middle = 'línea de lectura '.repeat(20_000);
    const text = `INICIO\n${middle}\nMARCADOR_FINAL_T07`;
    const source = controlledSource();
    fetchBytes.mockResolvedValue({ body: source.body });
    const { container, onFailure } = renderText();
    await act(async () => {
      source.controller.enqueue(encode('INICIO\n'));
      source.controller.enqueue(encode(middle));
      source.controller.enqueue(encode('\nMARCADOR_FINAL_T07'));
      source.controller.close();
    });
    await expectText(container, text);
    expect(container.textContent?.endsWith('MARCADOR_FINAL_T07')).toBe(true);
    expect(onFailure).toHaveBeenCalledTimes(0);
  });

  it('CA-9: usa pre o presentación equivalente que preserva whitespace sin foco extra', async () => {
    const text = '  Primera línea\n\tSegunda línea  ';
    fetchBytes.mockResolvedValue({ body: completeBody(text) });
    const { container } = renderText();
    await expectText(container, text);
    const element = Array.from(container.querySelectorAll<HTMLElement>('*')).find((candidate) => {
      const whitespace = window.getComputedStyle(candidate).whiteSpace;
      return (
        candidate.tagName === 'PRE' ||
        ['pre', 'pre-wrap', 'break-spaces'].includes(whitespace) ||
        ['whitespace-pre', 'whitespace-pre-wrap', 'whitespace-break-spaces'].some((token) =>
          candidate.classList.contains(token),
        )
      );
    });
    expect(element !== undefined).toBe(true);
    expect(element?.textContent === text).toBe(true);
    expect(element?.tabIndex).toBe(-1);
  });

  it('CA-2: cambiar URL borra A, cancela su reader y descarta un read tardío tras cancel', async () => {
    const source = controlledSource();
    const next = controlledSource();
    const lateRead = deferred<ReadableStreamReadResult<Uint8Array>>();
    const getReader = source.body.getReader.bind(source.body);
    jest.spyOn(source.body, 'getReader').mockImplementation(() => {
      const reader = getReader();
      // Solo esta segunda read ignora cancel para comprobar la identidad del intento.
      jest
        .spyOn(reader, 'read')
        .mockResolvedValueOnce({ done: false, value: encode('A_VISIBLE') })
        .mockReturnValueOnce(lateRead.promise);
      return reader;
    });
    fetchBytes
      .mockResolvedValueOnce({ body: source.body })
      .mockResolvedValueOnce({ body: next.body });
    const { container, rerender, onFailure } = renderText();
    await expectText(container, 'A_VISIBLE');
    const previous = requestAt().signal;
    rerender(<TextPreview url={URL_B} onFailure={onFailure} />);
    expect(container.textContent === '').toBe(true);
    expect(previous.aborted).toBe(true);
    await act(async () => next.controller.enqueue(encode('B_ACTUAL')));
    await expectText(container, 'B_ACTUAL');
    const decodeCall = jest.spyOn(NativeTextDecoder.prototype, 'decode');
    await act(async () => lateRead.resolve({ done: false, value: encode('A_TARDIO') }));
    expect(decodeCall).toHaveBeenCalledTimes(0);
    expect(container.textContent === 'B_ACTUAL').toBe(true);
    expect(source.cancel).toHaveBeenCalledTimes(1);
    expect(source.body.locked).toBe(false);
    expect(requestAt(1).url === URL_B).toBe(true);
    expect(requestAt(1).signal === previous).toBe(false);
    await act(async () => next.controller.close());
    expect(onFailure).toHaveBeenCalledTimes(0);
  });

  it('CA-2: unmount durante read aborta, cancela, libera y silencia el fallo tardío', async () => {
    const source = controlledSource();
    fetchBytes.mockResolvedValue({ body: source.body });
    const { container, unmount, onFailure } = renderText();
    await act(async () => source.controller.enqueue(encode('PARCIAL_AL_SALIR')));
    await expectText(container, 'PARCIAL_AL_SALIR');
    const signal = requestAt().signal;
    await act(async () => unmount());
    await act(async () => source.controller.error(privateError()));
    expect(signal.aborted).toBe(true);
    expect(source.cancel).toHaveBeenCalledTimes(1);
    expect(source.body.locked).toBe(false);
    expect(onFailure).toHaveBeenCalledTimes(0);
    expect(container.textContent === '').toBe(true);
    expectPrivateDom(container);
  });

  it('CA-2: entrega tardía de A no decodifica contenido ni reemplaza B', async () => {
    const pending = deferred<ObjectBytes>();
    fetchBytes
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce({ body: completeBody('B') });
    const { container, rerender, onFailure } = renderText();
    const previous = requestAt().signal;
    rerender(<TextPreview url={URL_B} onFailure={onFailure} />);
    await expectText(container, 'B');
    const stale = controlledSource();
    stale.controller.enqueue(encode('A_TARDIO'));
    stale.controller.close();
    const decodeCall = jest.spyOn(NativeTextDecoder.prototype, 'decode');
    await act(async () => pending.resolve({ body: stale.body }));
    expect(previous.aborted).toBe(true);
    expect(decodeCall).toHaveBeenCalledTimes(0);
    expect(stale.cancel).toHaveBeenCalledTimes(1);
    expect(stale.body.locked).toBe(false);
    expect(container.textContent === 'B').toBe(true);
    expect(onFailure).toHaveBeenCalledTimes(0);
  });

  it('CA-2: entrega posterior a unmount cancela el body sin decode, texto ni failure', async () => {
    const pending = deferred<ObjectBytes>();
    fetchBytes.mockReturnValue(pending.promise);
    const { container, unmount, onFailure } = renderText();
    const signal = requestAt().signal;
    unmount();
    const stale = controlledSource();
    stale.controller.enqueue(encode('TEXTO_TARDIO'));
    stale.controller.close();
    const decodeCall = jest.spyOn(NativeTextDecoder.prototype, 'decode');
    await act(async () => pending.resolve({ body: stale.body }));
    expect(signal.aborted).toBe(true);
    expect(stale.cancel).toHaveBeenCalledTimes(1);
    expect(stale.body.locked).toBe(false);
    expect(decodeCall).toHaveBeenCalledTimes(0);
    expect(container.textContent === '').toBe(true);
    expect(onFailure).toHaveBeenCalledTimes(0);
  });

  it('CA-2: rechazo tardío del helper tras unmount es silencioso', async () => {
    const pending = deferred<ObjectBytes>();
    fetchBytes.mockReturnValue(pending.promise);
    const { container, unmount, onFailure } = renderText();
    const signal = requestAt().signal;
    unmount();
    await act(async () => pending.reject(privateError()));
    expect(signal.aborted).toBe(true);
    expect(onFailure).toHaveBeenCalledTimes(0);
    expectPrivateDom(container);
  });

  it('CA-2: rechazo del transporte comunica unavailable sin copiar datos privados', async () => {
    fetchBytes.mockRejectedValue(privateError());
    const { container, onFailure } = renderText();
    await waitFor(() => expect(onFailure).toHaveBeenCalledTimes(1), WAIT_OPTIONS);
    expectFailure(onFailure, 'unavailable');
    expect(container.textContent === '').toBe(true);
    expectPrivateDom(container);
  });

  it('CA-9: publica ready al EOF, no al recibir el primer texto parcial', async () => {
    const source = controlledSource();
    const onReady = jest.fn();
    fetchBytes.mockResolvedValue({ body: source.body });
    const { container } = render(
      <TextPreview url={URL_A} onFailure={jest.fn()} onReady={onReady} />,
    );
    await act(async () => source.controller.enqueue(encode('Parcial')));
    await expectText(container, 'Parcial');
    expect(onReady).toHaveBeenCalledTimes(0);
    await act(async () => source.controller.close());
    expect(onReady).toHaveBeenCalledTimes(1);
    expect(source.body.locked).toBe(false);
  });

  it('CA-2: registra limpieza idempotente que espera cancel y release del reader', async () => {
    const source = controlledSource();
    const disposals: Array<() => Promise<void>> = [];
    fetchBytes.mockResolvedValue({ body: source.body });
    render(
      <TextPreview
        url={URL_A}
        onFailure={jest.fn()}
        registerCleanup={(dispose) => {
          disposals.push(dispose);
          return () => undefined;
        }}
      />,
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
  });

  it('CA-2: fallo del body después de publicar parcial lo retira e informa unavailable', async () => {
    const source = controlledSource();
    fetchBytes.mockResolvedValue({ body: source.body });
    const { container, onFailure } = renderText();
    await act(async () => source.controller.enqueue(encode('PARCIAL_ANTES_DEL_FALLO')));
    await expectText(container, 'PARCIAL_ANTES_DEL_FALLO');
    await act(async () => source.controller.error(privateError()));
    await waitFor(() => expect(onFailure).toHaveBeenCalledTimes(1), WAIT_OPTIONS);
    expectFailure(onFailure, 'unavailable');
    expect(container.textContent?.includes('PARCIAL_ANTES_DEL_FALLO')).toBe(false);
    expect(source.body.locked).toBe(false);
    expectPrivateDom(container);
  });
});
