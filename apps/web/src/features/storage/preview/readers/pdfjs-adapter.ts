import type * as PdfJs from 'pdfjs-dist';

import { readerFailure, type PreviewFailure } from '../preview-failure';

import { openPdfRangeTransport, type PdfRanges } from './pdf-range-transport';
import { renderPdfText, type PdfTextReading } from './pdf-text-reader';

export type PdfRuntime = {
  readonly engine: typeof PdfJs;
  readonly worker?: PdfJs.PDFWorker;
  readonly resources: Pick<
    NonNullable<Parameters<typeof PdfJs.getDocument>[0]>,
    'BinaryDataFactory' | 'iccUrl' | 'standardFontDataUrl' | 'useSystemFonts'
  >;
  readonly dispose: () => void;
};
export type PdfPageTarget = {
  readonly pageNumber: number;
  readonly canvas: HTMLCanvasElement;
  readonly signal: AbortSignal;
  readonly textLayer?: HTMLElement;
  readonly literalText?: HTMLElement;
};
export type PdfSession = {
  readonly numPages: number;
  readonly renderPage: (target: PdfPageTarget) => Promise<void>;
  readonly dispose: () => Promise<void>;
};
type PdfOpenOptions = {
  readonly url: string;
  readonly signal: AbortSignal;
  readonly runtime: PdfRuntime;
  readonly onFailure: (failure: PreviewFailure) => void;
};
type PageReading = {
  readonly target: PdfPageTarget;
  active: boolean;
  page?: PdfJs.PDFPageProxy;
  render?: PdfJs.RenderTask;
  text?: PdfTextReading;
  cleanup?: Promise<void>;
};
type PdfReading = {
  readonly options: PdfOpenOptions;
  readonly controller: AbortController;
  readonly onAbort: () => void;
  ranges?: PdfRanges;
  task?: PdfJs.PDFDocumentLoadingTask;
  document?: PdfJs.PDFDocumentProxy;
  current?: PageReading;
  failure?: PreviewFailure;
  cleanup?: Promise<void>;
};

export class PdfReadError extends Error {
  readonly reason: PreviewFailure['reason'];
  constructor(reason: PreviewFailure['reason']) {
    super('No se pudo representar el PDF.');
    this.reason = reason;
  }
}

// Mensajes exactos de asignación fallida en V8, SpiderMonkey y JavaScriptCore; nunca se propagan.
const ALLOCATION_FAILURES: ReadonlySet<string> = new Set([
  'RangeError: Array buffer allocation failed',
  'InternalError: out of memory',
  'RangeError: Out of memory',
]);

/** El worker entrega errores ajenos como UnknownErrorException con `details = error.toString()`. */
function isAllocationFailure(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const details: unknown = Reflect.get(error, 'details');
  const description =
    error.name === 'UnknownErrorException' ? details : `${error.name}: ${error.message}`;
  return typeof description === 'string' && ALLOCATION_FAILURES.has(description);
}

function classifyPdfError(error: unknown, engine: typeof PdfJs): PreviewFailure['reason'] {
  if (error instanceof engine.InvalidPDFException) return 'corrupt';
  return isAllocationFailure(error) ? 'memory' : 'unavailable';
}

function releasePage(reading: PageReading | undefined): Promise<void> {
  if (reading === undefined) return Promise.resolve();
  if (reading.cleanup !== undefined) return reading.cleanup;
  reading.active = false;
  reading.render?.cancel();
  reading.cleanup = (async () => {
    await reading.text?.cancel();
    await reading.render?.promise.catch(() => undefined);
    reading.page?.cleanup();
    reading.target.canvas.width = 0;
    reading.target.canvas.height = 0;
  })();
  return reading.cleanup;
}

function disposePdf(reading: PdfReading): Promise<void> {
  if (reading.cleanup !== undefined) return reading.cleanup;
  reading.controller.abort();
  reading.options.signal.removeEventListener('abort', reading.onAbort);
  reading.cleanup = (async () => {
    await releasePage(reading.current);
    await reading.ranges?.dispose();
    await reading.task?.destroy().catch(() => undefined);
    reading.options.runtime.dispose();
  })();
  return reading.cleanup;
}

function failPdf(reading: PdfReading, reason: PreviewFailure['reason']): void {
  if (reading.controller.signal.aborted || reading.failure !== undefined) return;
  reading.failure = readerFailure(reason);
  reading.options.onFailure(reading.failure);
  void disposePdf(reading);
}

function startTask(reading: PdfReading): PdfJs.PDFDocumentLoadingTask {
  const { engine, worker, resources } = reading.options.runtime;
  const task = engine.getDocument({
    ...resources,
    range: reading.ranges?.transport,
    ...(worker === undefined ? {} : { worker }),
    disableStream: true,
    disableAutoFetch: true,
    stopAtErrors: true,
    enableXfa: false,
    useWorkerFetch: false,
    verbosity: engine.VerbosityLevel.ERRORS,
  });
  task.onPassword = () => failPdf(reading, 'protected');
  return task;
}

/** destroy() no garantiza rechazar task.promise si falló el transporte antes de GetDoc. */
function waitForDocument(reading: PdfReading): Promise<PdfJs.PDFDocumentProxy> {
  return new Promise((resolve, reject) => {
    const signal = reading.controller.signal;
    const abort = (): void => {
      signal.removeEventListener('abort', abort);
      reject(new PdfReadError(reading.failure?.reason ?? 'unavailable'));
    };
    signal.addEventListener('abort', abort, { once: true });
    void reading.task?.promise.then(
      (document) => {
        signal.removeEventListener('abort', abort);
        resolve(document);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', abort);
        reject(error);
      },
    );
    if (signal.aborted) abort();
  });
}

async function paintPage(reading: PdfReading, current: PageReading): Promise<void> {
  const { target, page } = current;
  if (page === undefined) throw new Error('Página no disponible.');
  const width = target.canvas.closest?.<HTMLElement>('[data-pdf-page]')?.clientWidth;
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: width ? Math.min(1, width / base.width) : 1 });
  target.canvas.width = Math.ceil(viewport.width);
  target.canvas.height = Math.ceil(viewport.height);
  current.render = page.render({
    canvas: target.canvas,
    viewport,
    // ENABLE solo pinta apariencias estáticas en el canvas; sin ENABLE_FORMS ni capa de anotaciones no hay widgets ni acciones.
    annotationMode: reading.options.runtime.engine.AnnotationMode.ENABLE,
  });
  if (target.textLayer !== undefined && target.literalText !== undefined)
    current.text = renderPdfText({
      engine: reading.options.runtime.engine,
      source: page.streamTextContent(),
      overlay: target.textLayer,
      literal: target.literalText,
      viewport,
    });
  await Promise.all([current.render.promise, current.text?.promise]);
}

async function renderPage(reading: PdfReading, target: PdfPageTarget): Promise<void> {
  await releasePage(reading.current);
  if (reading.controller.signal.aborted || target.signal.aborted) return;
  const current: PageReading = { target, active: true };
  reading.current = current;
  const abort = (): void => {
    void releasePage(current);
  };
  target.signal.addEventListener('abort', abort, { once: true });
  try {
    if (reading.document === undefined) throw new Error('Documento no disponible.');
    const page = await reading.document.getPage(target.pageNumber);
    current.page = page;
    if (!current.active || reading.controller.signal.aborted) {
      page.cleanup();
      return;
    }
    await paintPage(reading, current);
  } catch (error) {
    if (current.active && !reading.controller.signal.aborted) {
      failPdf(reading, classifyPdfError(error, reading.options.runtime.engine));
      throw new PdfReadError(reading.failure?.reason ?? 'unavailable');
    }
  } finally {
    target.signal.removeEventListener('abort', abort);
  }
}

async function loadDocument(reading: PdfReading): Promise<PdfJs.PDFDocumentProxy> {
  const { options, controller } = reading;
  reading.ranges = await openPdfRangeTransport({
    engine: options.runtime.engine,
    url: options.url,
    signal: controller.signal,
    onFailure: () => failPdf(reading, 'unavailable'),
  });
  if (controller.signal.aborted) {
    await reading.ranges.dispose();
    throw new PdfReadError('unavailable');
  }
  reading.task = startTask(reading);
  const document = await waitForDocument(reading);
  if (controller.signal.aborted) throw new PdfReadError('unavailable');
  return document;
}

export async function openPdfSession(options: PdfOpenOptions): Promise<PdfSession> {
  const controller = new AbortController();
  const reading: PdfReading = {
    options,
    controller,
    onAbort: () => {
      void disposePdf(reading);
    },
  };
  options.signal.addEventListener('abort', reading.onAbort, { once: true });
  if (options.signal.aborted) controller.abort();
  try {
    reading.document = await loadDocument(reading);
    return {
      numPages: reading.document.numPages,
      renderPage: (target) => renderPage(reading, target),
      dispose: () => disposePdf(reading),
    };
  } catch (error) {
    const reason = reading.failure?.reason ?? classifyPdfError(error, options.runtime.engine);
    await disposePdf(reading);
    throw new PdfReadError(reason);
  }
}
