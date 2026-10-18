/** @jest-environment jsdom */
import { ReadableStream as NativeStream } from 'node:stream/web';

import type * as PdfJs from 'pdfjs-dist';

import { renderPdfText, type PdfTextContent } from './pdf-text-reader';

const layerCancel = jest.fn();
const layerRender = jest.fn(async () => undefined);
class Layer {
  render = layerRender;
  cancel = layerCancel;
}
const engine = { TextLayer: Layer } as unknown as typeof PdfJs;
const originalStream = globalThis.ReadableStream;

describe('texto PDF T-08b sin truncamiento ni HTML', () => {
  beforeEach(() => {
    globalThis.ReadableStream = NativeStream as typeof ReadableStream;
    jest.clearAllMocks();
  });
  afterEach(() => {
    globalThis.ReadableStream = originalStream;
  });

  it('CA-1: literal completo independiente del límite de TextLayer, en orden y escapado', async () => {
    const content = document.createElement('div');
    const overlay = document.createElement('div');
    const items = Array.from({ length: 100_005 }, (_, i) => ({
      str: i === 100_004 ? '<b>FINAL</b>' : 'x',
      hasEOL: false,
    }));
    const source = new ReadableStream<PdfTextContent>({
      start(controller) {
        controller.enqueue({ items: items as PdfTextContent['items'], styles: {}, lang: 'es' });
        controller.close();
      },
    });
    const reading = renderPdfText({
      engine,
      source,
      overlay,
      literal: content,
      viewport: { scale: 1 } as PdfJs.PageViewport,
    });
    await reading.promise;
    expect(content.textContent?.endsWith('<b>FINAL</b>')).toBe(true);
    expect(content.querySelector('b,script,a')).toBeNull();
    expect(layerRender).toHaveBeenCalledTimes(1);
    await reading.cancel();
    expect(layerCancel).toHaveBeenCalledTimes(1);
  });

  it('CA-7: cancel cancela ambos consumidores y libera el stream sin texto tardío', async () => {
    const cancel = jest.fn();
    const source = new ReadableStream<PdfTextContent>({ cancel });
    const literal = document.createElement('div');
    const reading = renderPdfText({
      engine,
      source,
      overlay: document.createElement('div'),
      literal,
      viewport: { scale: 1 } as PdfJs.PageViewport,
    });
    await reading.cancel();
    await reading.promise;
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(literal.textContent).toBe('');
  });
});
