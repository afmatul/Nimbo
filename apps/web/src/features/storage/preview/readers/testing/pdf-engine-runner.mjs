// Jest/Next transforma a CJS; este proceso aislado conserva el ESM real de PDF.js.
import { readFileSync } from 'node:fs';
import { createRequire, registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

registerHooks({
  resolve(specifier, context, next) {
    if (
      specifier.startsWith('.') &&
      context.parentURL?.endsWith('.ts') &&
      !/\.[a-z]+$/.test(specifier)
    )
      return next(`${specifier}.ts`, context);
    return next(specifier, context);
  },
  load(url, context, next) {
    if (!url.endsWith('.ts')) return next(url, context);
    return {
      format: 'module',
      shortCircuit: true,
      source: ts.transpileModule(readFileSync(new URL(url), 'utf8'), {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
      }).outputText,
    };
  },
});

let phase = 'setup';
try {
  const require = createRequire(import.meta.url);
  const pdfRequire = createRequire(require.resolve('pdfjs-dist/package.json'));
  const { createCanvas, DOMMatrix, Path2D, ImageData } = pdfRequire('@napi-rs/canvas');
  Object.assign(globalThis, { DOMMatrix, Path2D, ImageData });
  const { JSDOM } = await import('jsdom');
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true });
  const canvases = new WeakMap();
  dom.window.HTMLCanvasElement.prototype.getContext = function () {
    if (!canvases.has(this)) {
      const native = createCanvas(this.width, this.height).getContext('2d');
      canvases.set(
        this,
        new Proxy(native, {
          get: (target, key) => {
            if (key === 'canvas') return this;
            const value = Reflect.get(target, key, target);
            return typeof value === 'function' ? value.bind(target) : value;
          },
          set(target, key, value) {
            return Reflect.set(target, key, value, target);
          },
        }),
      );
    }
    return canvases.get(this);
  };
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
    devicePixelRatio: 1,
    requestAnimationFrame: (callback) => setTimeout(callback, 0),
    cancelAnimationFrame: clearTimeout,
  });
  const engine = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const { openPdfSession } = await import('../pdfjs-adapter.ts');
  const { pdfFixture } = await import('./pdf-fixtures.ts');
  const input = process.argv[2] ?? 'normal';
  const data =
    input === 'corrupt'
      ? new TextEncoder().encode('no es PDF')
      : pdfFixture({
          pages: input === 'multi' ? 3 : 1,
          scanned: input === 'scan',
          script: input === 'script',
          protected: input === 'protected',
          // Separar los streams más de un chunk: first/last-page checks del parser no deben cubrir todo el fixture.
          padding: input === 'multi' ? 200000 : 70000,
        });
  const requests = [];
  const signals = [];
  const failures = [];
  let sameUrl = true;
  globalThis.fetch = async (_url, init) => {
    sameUrl &&= _url === 'https://objects.test/private?signature=PRIVATE';
    if (input === 'transport') throw new Error('PRIVATE transporte');
    const range = new Headers(init.headers).get('Range');
    const match = /^bytes=(\d+)-(\d+)$/.exec(range ?? '');
    if (!match) throw new Error('Se requiere rango');
    const start = Number(match[1]);
    const end = Math.min(Number(match[2]), data.length - 1);
    requests.push({
      start,
      end,
      omit: init.credentials === 'omit',
      headers: [...new Headers(init.headers).keys()],
    });
    signals.push(init.signal);
    if (input === 'rangeFailure' && requests.length > 1) return new Response(data, { status: 200 });
    return new Response(data.slice(start, end + 1), {
      status: 206,
      headers: {
        'Content-Range': `bytes ${start}-${end}/${data.length}`,
        'Content-Length': String(end - start + 1),
      },
    });
  };
  const abort = new AbortController();
  let taskRef;
  let inspectActions = Promise.resolve(false);
  let runtimeDisposals = 0;
  phase = 'open';
  const options = {
    url: 'https://objects.test/private?signature=PRIVATE',
    signal: abort.signal,
    onFailure: (failure) => failures.push(failure),
    runtime: {
      engine: {
        ...engine,
        getDocument(options) {
          phase = 'loading';
          const task = engine.getDocument(options);
          taskRef = task;
          inspectActions =
            input === 'script'
              ? task.promise.then(
                  (document) => document.hasJSActions(),
                  () => false,
                )
              : Promise.resolve(false);
          return task;
        },
      },
      dispose() {
        runtimeDisposals++;
      },
      resources: {
        standardFontDataUrl: fileURLToPath(
          new URL('../standard_fonts/', import.meta.resolve('pdfjs-dist')),
        ).replaceAll('\\', '/'),
        useSystemFonts: false,
      },
    },
  };
  let session = await openPdfSession(options);
  const pages = [];
  let lastCanvas;
  let firstPageBytes = 0;
  phase = 'render';
  for (let page = 1; page <= session.numPages; page++) {
    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 200;
    lastCanvas = canvas;
    const textLayer = document.createElement('div');
    const literalText = document.createElement('div');
    document.body.append(textLayer, literalText);
    await session.renderPage({
      pageNumber: page,
      canvas,
      textLayer,
      literalText,
      signal: abort.signal,
    });
    const pixel = canvas.getContext('2d').getImageData(20, 180, 1, 1).data;
    pages.push({
      number: page,
      width: canvas.width,
      rendered: pixel[3] > 0 && [...pixel].slice(0, 3).some((value) => value !== 255),
      text: literalText.textContent,
    });
    if (page === 1)
      firstPageBytes = requests.reduce((sum, range) => sum + range.end - range.start + 1, 0);
  }
  const containsJavaScript = await inspectActions;
  let retry;
  if (input === 'retry') {
    await session.dispose();
    const previousDestroyed = taskRef.destroyed && lastCanvas.width === 0;
    session = await openPdfSession({ ...options, signal: new AbortController().signal });
    lastCanvas = document.createElement('canvas');
    await session.renderPage({
      pageNumber: 1,
      canvas: lastCanvas,
      signal: new AbortController().signal,
    });
    retry = {
      previousDestroyed,
      sameUrl,
      bootstraps: requests.filter((range) => range.start === 0 && range.end === 0).length,
    };
  }
  await session.dispose();
  await session.dispose();
  process.stdout.write(
    JSON.stringify({
      ok: true,
      pages,
      requests,
      failures,
      firstPageBytes,
      totalLength: data.length,
      containsJavaScript,
      retry,
      cleanup: {
        taskDestroyed: taskRef.destroyed,
        signalsAborted: signals.every((signal) => signal.aborted),
        canvasReleased: lastCanvas.width === 0 && lastCanvas.height === 0,
        runtimeDisposals,
      },
      scriptExecuted: globalThis.PDF_SCRIPT_EXECUTED === true,
    }),
  );
  dom.window.close();
} catch (error) {
  process.stdout.write(
    JSON.stringify({
      ok: false,
      phase,
      reason: ['protected', 'corrupt', 'unavailable'].includes(error?.reason)
        ? error.reason
        : 'harness',
    }),
  );
  process.exitCode = 1;
}
