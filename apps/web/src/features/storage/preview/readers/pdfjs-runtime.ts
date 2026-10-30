import { readerFailure, type PreviewFailure } from '../preview-failure';

import type { PdfRuntime } from './pdfjs-adapter';

// Contextos estáticos de Webpack: solo assets de render; quickjs/scripting quedan excluidos.
declare const require: {
  context: (path: string, recursive: boolean, pattern: RegExp) => (filename: string) => string;
};
const RESOURCES: Readonly<Record<string, (filename: string) => string>> = {
  cMapUrl: require.context('!!./pdf-asset-loader.cjs!pdfjs-dist/cmaps', false, /\.bcmap$/),
  standardFontDataUrl: require.context(
    '!!./pdf-asset-loader.cjs!pdfjs-dist/standard_fonts',
    false,
    /\.(ttf|pfb)$/,
  ),
  wasmUrl: require.context(
    '!!./pdf-asset-loader.cjs!pdfjs-dist/wasm',
    false,
    /\/(jbig2|openjpeg|qcms_bg)\.wasm$/,
  ),
};

/** Debe coincidir con `pdfjs-dist` en `package.json` (ADR-0026): el worker y los assets empaquetados son de esa versión. */
const PINNED_ENGINE_VERSION = '6.4.299';

function resourceUrl(kind: string, filename: string): string {
  if (!/^[\w.-]+$/.test(filename) || filename.includes('..'))
    throw new Error('Recurso PDF no disponible.');
  const resolve = Object.hasOwn(RESOURCES, kind) ? RESOURCES[kind] : undefined;
  if (resolve === undefined) throw new Error('Recurso PDF no disponible.');
  return resolve(`./${filename}`);
}

function resourceFactory(
  signal: AbortSignal,
  onFailure: (failure: PreviewFailure) => void,
): object {
  return class {
    async fetch({
      kind,
      filename,
    }: {
      readonly kind: string;
      readonly filename: string;
    }): Promise<Uint8Array> {
      // Assets empaquetados del mismo origen, no el objeto privado firmado: sin el helper de objetos.
      try {
        const response = await fetch(resourceUrl(kind, filename), { credentials: 'omit', signal });
        if (!response.ok) throw new Error('Recurso PDF no disponible.');
        return new Uint8Array(await response.arrayBuffer());
      } catch {
        if (!signal.aborted) onFailure(readerFailure('unavailable'));
        throw new Error('Recurso PDF no disponible.');
      }
    }
  };
}

function watchWorker(
  port: Worker,
  signal: AbortSignal,
  onFailure: (failure: PreviewFailure) => void,
): () => void {
  const failed = (): void => {
    if (!signal.aborted) onFailure(readerFailure('unavailable'));
  };
  port.addEventListener('error', failed);
  port.addEventListener('messageerror', failed);
  return () => {
    port.removeEventListener('error', failed);
    port.removeEventListener('messageerror', failed);
  };
}

function workerCleanup(
  port: Worker,
  worker: NonNullable<PdfRuntime['worker']>,
  unwatch: () => void,
): () => void {
  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    unwatch();
    try {
      worker.destroy();
    } finally {
      port.terminate();
    }
  };
}

function localResources(
  signal: AbortSignal,
  onFailure: (failure: PreviewFailure) => void,
): PdfRuntime['resources'] {
  return {
    BinaryDataFactory: resourceFactory(signal, onFailure),
    // PDF.js exige `/` final (getFactoryUrlProp) y el worker pide `${iccUrl}CGATS001Compat-v2-micro.icc`;
    // con el query, ese nombre queda en la query string y se sirve el asset ICC local con hash.
    iccUrl: `${new URL('pdfjs-dist/iccs/CGATS001Compat-v2-micro.icc', import.meta.url).href}?profile=/`,
  };
}

export async function createPdfRuntime(
  signal: AbortSignal,
  onFailure: (failure: PreviewFailure) => void,
): Promise<PdfRuntime> {
  const engine = await import('pdfjs-dist');
  if (signal.aborted || engine.version !== PINNED_ENGINE_VERSION) throw new Error('Motor PDF no disponible.');
  const port = new Worker(new URL('../workers/pdfjs.worker.ts', import.meta.url), {
    type: 'module',
  });
  const unwatch = watchWorker(port, signal, onFailure);
  try {
    const worker = engine.PDFWorker.create({ port, verbosity: engine.VerbosityLevel.ERRORS });
    return {
      engine,
      worker,
      resources: localResources(signal, onFailure),
      dispose: workerCleanup(port, worker, unwatch),
    };
  } catch {
    unwatch();
    port.terminate();
    throw new Error('Motor PDF no disponible.');
  }
}
