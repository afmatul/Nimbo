/** @jest-environment jsdom */
import { ReadableStream as NativeStream } from 'node:stream/web';

import { fetchObjectBytes } from './object-bytes';
import { openPdfSession, PdfReadError } from './pdfjs-adapter';

jest.mock('./object-bytes', () => ({ fetchObjectBytes: jest.fn() }));

function deferred<T>() {
  let resolve = (_value: T): void => undefined;
  let reject = (_error: unknown): void => undefined;
  const promise = new Promise<T>((finish, fail) => {
    resolve = finish;
    reject = fail;
  });
  return { promise, resolve, reject };
}
class InvalidPdf extends Error {}
class Ranges {
  constructor(
    readonly length: number,
    readonly initialData: Uint8Array | null,
  ) {}
  onDataRange(): void {}
}

function harness() {
  const controller = new AbortController();
  const render = { promise: Promise.resolve(), cancel: jest.fn() };
  const page = {
    getViewport: () => ({ width: 200, height: 200, scale: 1 }),
    render: jest.fn(() => render),
    cleanup: jest.fn(),
  };
  const document = { numPages: 3, getPage: jest.fn(async () => page) };
  const task = {
    promise: Promise.resolve(document),
    destroy: jest.fn(async () => undefined),
    onPassword: undefined,
  };
  const runtime = {
    engine: {
      PDFDataRangeTransport: Ranges,
      InvalidPDFException: InvalidPdf,
      AnnotationMode: { ENABLE: 1 },
      VerbosityLevel: { ERRORS: 0 },
      getDocument: jest.fn(() => task),
    },
    resources: {},
    dispose: jest.fn(),
  };
  const onFailure = jest.fn();
  const options = {
    url: 'https://objects.test/private?signature=PRIVATE',
    signal: controller.signal,
    runtime: runtime as unknown as Parameters<typeof openPdfSession>[0]['runtime'],
    onFailure,
  };
  return { options, controller, page, document, task, runtime, render, onFailure };
}
const originalStream = globalThis.ReadableStream;

describe('adapter PDF: fallos y recursos con APIs de motor controladas', () => {
  beforeEach(() => {
    globalThis.ReadableStream = NativeStream as typeof ReadableStream;
    jest
      .mocked(fetchObjectBytes)
      .mockReset()
      .mockImplementation(async () => ({
        totalLength: 500,
        body: new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(Uint8Array.of(37));
            controller.close();
          },
        }),
      }));
  });
  afterEach(() => {
    globalThis.ReadableStream = originalStream;
  });

  it('CA-7: cancelar render espera su finalización antes de destruir task/worker', async () => {
    const test = harness();
    const pending = deferred<undefined>();
    test.render.promise = pending.promise;
    const session = await openPdfSession(test.options);
    const canvas = document.createElement('canvas');
    const rendering = session.renderPage({ canvas, pageNumber: 1, signal: test.controller.signal });
    await Promise.resolve();
    await Promise.resolve();
    test.controller.abort();
    expect(test.render.cancel).toHaveBeenCalledTimes(1);
    expect(test.task.destroy).not.toHaveBeenCalled();
    pending.resolve(undefined);
    await rendering;
    await session.dispose();
    await session.dispose();
    expect(test.task.destroy).toHaveBeenCalledTimes(1);
    expect(test.runtime.dispose).toHaveBeenCalledTimes(1);
    expect(test.page.cleanup).toHaveBeenCalledTimes(1);
    expect(canvas.width).toBe(0);
    expect(test.onFailure).not.toHaveBeenCalled();
  });

  it('CA-7: salida durante getPage descarta página tardía sin render ni failure', async () => {
    const test = harness();
    const pending = deferred<typeof test.page>();
    test.page.render.mockClear();
    const session = await openPdfSession(test.options);
    test.document.getPage.mockReturnValueOnce(pending.promise);
    const rendering = session.renderPage({
      canvas: document.createElement('canvas'),
      pageNumber: 1,
      signal: test.controller.signal,
    });
    await Promise.resolve();
    await Promise.resolve();
    test.controller.abort();
    await session.dispose();
    pending.resolve(test.page);
    await rendering;
    expect(test.page.render).not.toHaveBeenCalled();
    expect(test.page.cleanup).toHaveBeenCalledTimes(1);
    expect(test.onFailure).not.toHaveBeenCalled();
  });

  it.each([
    ['corrupt', new InvalidPdf('PRIVATE')],
    ['unavailable', new RangeError('PRIVATE')],
  ] as const)(
    'CA-2: render fallido %s retira recursos y no expone excepción',
    async (reason, error) => {
      const test = harness();
      test.page.render.mockImplementationOnce(() => {
        throw error;
      });
      const session = await openPdfSession(test.options);
      const canvas = document.createElement('canvas');
      const outcome: unknown = await session
        .renderPage({ canvas, pageNumber: 1, signal: test.controller.signal })
        .catch((caught: unknown) => caught);
      expect(outcome instanceof PdfReadError).toBe(true);
      expect(test.onFailure).toHaveBeenCalledWith({ reason, correlationId: '' });
      expect(/PRIVATE|signature=/.test(String(outcome))).toBe(false);
      expect(Reflect.has(outcome as object, 'cause')).toBe(false);
      await session.dispose();
      expect(canvas.width).toBe(0);
      expect(test.runtime.dispose).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    ['memory', 'RangeError: Array buffer allocation failed'],
    ['memory', 'InternalError: out of memory'],
    ['memory', 'RangeError: Out of memory'],
    ['unavailable', 'RangeError: Invalid array length'],
    ['unavailable', 'RangeError: PRIVATE Array buffer allocation failed'],
    ['unavailable', undefined],
  ] as const)(
    'CA-2: apertura %s solo con asignación fallida exacta del worker (%s)',
    async (reason, details) => {
      const test = harness();
      const workerError = Object.assign(new Error('PRIVATE'), {
        name: 'UnknownErrorException',
        details,
      });
      test.task.promise = Promise.reject(workerError);
      const outcome: unknown = await openPdfSession(test.options).catch(
        (caught: unknown) => caught,
      );
      expect(outcome instanceof PdfReadError && outcome.reason).toBe(reason);
      expect(/PRIVATE|signature=|allocation/.test(String(outcome))).toBe(false);
      expect(Reflect.has(outcome as object, 'cause')).toBe(false);
      expect(test.runtime.dispose).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    ['memory', new RangeError('Array buffer allocation failed')],
    ['unavailable', new TypeError('Array buffer allocation failed')],
    ['unavailable', new RangeError('Maximum call stack size exceeded')],
  ] as const)(
    'CA-2: render %s distingue asignación fallida de otros errores',
    async (reason, error) => {
      const test = harness();
      test.page.render.mockImplementationOnce(() => {
        throw error;
      });
      const session = await openPdfSession(test.options);
      const outcome: unknown = await session
        .renderPage({
          canvas: document.createElement('canvas'),
          pageNumber: 1,
          signal: test.controller.signal,
        })
        .catch((caught: unknown) => caught);
      expect(outcome instanceof PdfReadError && outcome.reason).toBe(reason);
      expect(test.onFailure).toHaveBeenCalledWith({ reason, correlationId: '' });
      await session.dispose();
    },
  );

  it('CA-7: abort de carga no espera indefinidamente task.promise ni notifica unavailable', async () => {
    const test = harness();
    test.task.promise = new Promise(() => undefined);
    const opening = openPdfSession(test.options);
    for (let i = 0; i < 12; i++) await Promise.resolve();
    test.controller.abort();
    const outcome: unknown = await opening.catch((error: unknown) => error);
    expect(outcome instanceof PdfReadError).toBe(true);
    expect(test.runtime.dispose).toHaveBeenCalledTimes(1);
    expect(test.onFailure).not.toHaveBeenCalled();
  });
});
