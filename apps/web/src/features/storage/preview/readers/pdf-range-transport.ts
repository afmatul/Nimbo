import type * as PdfJs from 'pdfjs-dist';

import type { PreviewFailure } from '../preview-failure';

import { fetchObjectBytes } from './object-bytes';

type RangeOptions = {
  readonly engine: typeof PdfJs;
  readonly url: string;
  readonly signal: AbortSignal;
  readonly onFailure: (failure: PreviewFailure) => void;
};
export type PdfRanges = {
  readonly transport: PdfJs.PDFDataRangeTransport;
  readonly dispose: () => Promise<void>;
};
type RangeReading = RangeOptions & {
  readonly controller: AbortController;
  readonly pending: Set<Promise<void>>;
  readonly length: number;
};

/** Consumir un rango ya validado no repite ninguna política HTTP del helper. */
async function readPdfBody(body: ReadableStream<Uint8Array>): Promise<Uint8Array<ArrayBuffer>> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      chunks.push(chunk.value);
    }
    const result = new Uint8Array(chunks.reduce((size, chunk) => size + chunk.length, 0));
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    return result;
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
    chunks.length = 0;
  }
}

async function deliverRange(
  reading: RangeReading,
  transport: PdfJs.PDFDataRangeTransport,
  range: { readonly begin: number; readonly end: number },
): Promise<void> {
  try {
    const result = await fetchObjectBytes({
      url: reading.url,
      signal: reading.controller.signal,
      range: { start: range.begin, end: range.end - 1 },
    });
    if (reading.controller.signal.aborted) {
      await result.body.cancel();
      return;
    }
    if (result.totalLength !== reading.length) {
      await result.body.cancel();
      throw new Error('El objeto cambió durante la lectura.');
    }
    const chunk = await readPdfBody(result.body);
    if (!reading.controller.signal.aborted) transport.onDataRange(range.begin, chunk);
  } catch {
    if (reading.controller.signal.aborted) return;
    reading.onFailure({ reason: 'unavailable', correlationId: '' });
    reading.controller.abort();
  }
}

function createTransport(
  reading: RangeReading,
  initialData: Uint8Array,
): PdfJs.PDFDataRangeTransport {
  return new (class extends reading.engine.PDFDataRangeTransport {
    constructor() {
      super(reading.length, initialData, true);
    }
    override requestDataRange(begin: number, end: number): void {
      if (reading.controller.signal.aborted) return;
      const pending = deliverRange(reading, this, { begin, end });
      reading.pending.add(pending);
      void pending.finally(() => reading.pending.delete(pending));
    }
    override abort(): void {
      reading.controller.abort();
    }
  })();
}

export async function openPdfRangeTransport(options: RangeOptions): Promise<PdfRanges> {
  const controller = new AbortController();
  const abort = (): void => controller.abort();
  options.signal.addEventListener('abort', abort, { once: true });
  if (options.signal.aborted) controller.abort();
  try {
    const result = await fetchObjectBytes({
      url: options.url,
      signal: controller.signal,
      range: { start: 0, end: 0 },
    });
    const initial = await readPdfBody(result.body);
    if (result.totalLength === undefined || controller.signal.aborted)
      throw new Error('Lectura cancelada.');
    const reading: RangeReading = {
      ...options,
      controller,
      length: result.totalLength,
      pending: new Set(),
    };
    const transport = createTransport(reading, initial);
    return {
      transport,
      dispose: async () => {
        controller.abort();
        options.signal.removeEventListener('abort', abort);
        await Promise.allSettled(reading.pending);
      },
    };
  } catch {
    controller.abort();
    options.signal.removeEventListener('abort', abort);
    throw new Error('No se pudo preparar la lectura PDF.');
  }
}
