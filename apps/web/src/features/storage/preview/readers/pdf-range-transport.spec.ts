import type * as PdfJs from 'pdfjs-dist';

import { fetchObjectBytes } from './object-bytes';
import { openPdfRangeTransport } from './pdf-range-transport';

jest.mock('./object-bytes', () => ({ fetchObjectBytes: jest.fn() }));

class RangeTransport {
  readonly onDataRange = jest.fn();
  constructor(
    readonly length: number,
    readonly initialData: Uint8Array | null,
  ) {}
}
const engine = { PDFDataRangeTransport: RangeTransport } as unknown as typeof PdfJs;
const bytes = jest.mocked(fetchObjectBytes);
const URL = 'https://objects.test/private?X-Amz-Signature=PRIVATE';
const body = (value: number[]): ReadableStream<Uint8Array> => {
  const stream = new Response(Uint8Array.from(value)).body;
  if (stream === null) throw new Error('Falta stream del fixture');
  return stream;
};

describe('PDF range transport T-08a', () => {
  beforeEach(() => bytes.mockReset().mockResolvedValue({ totalLength: 500, body: body([37]) }));

  it('CA-11: bootstrap 0-0 y rangos exclusivos delegan al helper sin otras opciones', async () => {
    const onFailure = jest.fn();
    const opened = await openPdfRangeTransport({
      engine,
      url: URL,
      signal: new AbortController().signal,
      onFailure,
    });
    expect(opened.transport.length).toBe(500);
    expect(Array.from(opened.transport.initialData ?? [])).toEqual([37]);
    expect(bytes.mock.calls[0]?.[0].range).toEqual({ start: 0, end: 0 });
    bytes.mockResolvedValueOnce({ totalLength: 500, body: body([1, 2, 3]) });
    opened.transport.requestDataRange(10, 13);
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(bytes.mock.calls[1]?.[0].range).toEqual({ start: 10, end: 12 });
    expect(Object.keys(bytes.mock.calls[1]?.[0] ?? {}).sort()).toEqual(['range', 'signal', 'url']);
    expect(bytes.mock.calls[1]?.[0].url === URL).toBe(true);
    expect(opened.transport.onDataRange).toHaveBeenCalledWith(10, Uint8Array.of(1, 2, 3));
    await opened.dispose();
    expect(bytes.mock.calls[0]?.[0].signal.aborted).toBe(true);
    expect(onFailure).not.toHaveBeenCalled();
  });

  it('CA-2: fallo de rango notifica solo unavailable y cleanup es idempotente', async () => {
    const onFailure = jest.fn();
    const opened = await openPdfRangeTransport({
      engine,
      url: URL,
      signal: new AbortController().signal,
      onFailure,
    });
    bytes.mockRejectedValueOnce(new Error(URL));
    opened.transport.requestDataRange(1, 2);
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(onFailure).toHaveBeenCalledWith({ reason: 'unavailable', correlationId: '' });
    await opened.dispose();
    await opened.dispose();
    expect(opened.transport.onDataRange).not.toHaveBeenCalled();
  });

  it('CA-7: abort durante lectura cancela y no entrega bytes ni fallo tardío', async () => {
    const abort = new AbortController();
    const onFailure = jest.fn();
    const opened = await openPdfRangeTransport({
      engine,
      url: URL,
      signal: abort.signal,
      onFailure,
    });
    let finish = (_value: Awaited<ReturnType<typeof fetchObjectBytes>>): void => undefined;
    bytes.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    opened.transport.requestDataRange(10, 13);
    abort.abort();
    finish({ body: body([1, 2, 3]), totalLength: 500 });
    await opened.dispose();
    expect(opened.transport.onDataRange).not.toHaveBeenCalled();
    expect(onFailure).not.toHaveBeenCalled();
  });
});
