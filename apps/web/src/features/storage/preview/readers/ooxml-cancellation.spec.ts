import type { WorkerMessage } from '../workers/ooxml-protocol';
import { serveOoxml } from '../workers/ooxml-session';

import { OoxmlError, openZipPackage } from './ooxml-package-reader';
import { SIGNED_URL } from './testing/object-server';
import { zipOf } from './testing/ooxml-fixtures';
import { pptxEntries } from './testing/pptx-fixtures';

jest.mock('./zip-core', () => jest.requireActual('@zip.js/zip.js/index-native.cjs'));

/**
 * Origen controlado: a partir de la petición `holdFrom` cada GET queda en curso hasta que su señal aborta,
 * como un fetch real que no termina. Registra peticiones iniciadas y las que siguen pendientes.
 */
function gatedOrigin(bytes: Uint8Array, holdFrom: number) {
  let enter = (): void => undefined;
  const held = new Promise<undefined>((resolve) => {
    enter = () => resolve(undefined);
  });
  const state = { started: 0, pending: new Set<number>(), held };
  jest.spyOn(globalThis, 'fetch').mockImplementation((_input, init) => {
    const id = ++state.started;
    const [, start = 0, end = 0] =
      /bytes=(\d+)-(\d+)/.exec(new Headers(init?.headers).get('Range') ?? '')?.map(Number) ?? [];
    if (id < holdFrom) {
      const last = Math.min(end, bytes.length - 1);
      return Promise.resolve(
        new Response(bytes.slice(start, last + 1), {
          status: 206,
          headers: {
            'Content-Range': `bytes ${start}-${last}/${bytes.length}`,
            'Content-Length': String(last - start + 1),
          },
        }),
      );
    }
    state.pending.add(id);
    enter();
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        state.pending.delete(id);
        reject(new DOMException(`${SIGNED_URL} abortado`, 'AbortError'));
      });
    });
  });
  return state;
}

describe('cancelación a mitad de una lectura OOXML real (T-09a, revisión D1)', () => {
  afterEach(() => jest.restoreAllMocks());

  it('CA-7: abortar con un rango en curso termina en unavailable, sin pendientes ni peticiones nuevas', async () => {
    const bytes = await zipOf([['big.xml', `<a>${'x'.repeat(200_000)}</a>`]], { level: 0 });
    const opening = gatedOrigin(bytes, Number.POSITIVE_INFINITY);
    const controller = new AbortController();
    const pkg = await openZipPackage({ url: SIGNED_URL, signal: controller.signal });
    jest.restoreAllMocks();
    const origin = gatedOrigin(bytes, 1);
    let chunks = 0;
    const reading = pkg.readPart('/big.xml', () => {
      chunks++;
    });
    await origin.held;
    expect(origin.pending.size).toBe(1);
    controller.abort();
    const outcome: unknown = await reading.catch((error: unknown) => error);
    const startedAtAbort = origin.started;
    await new Promise((resolve) => setImmediate(resolve));
    expect(outcome instanceof OoxmlError && outcome.reason).toBe('unavailable');
    expect(String(outcome)).toBe('Error: No se pudo leer el paquete OOXML.');
    expect(Reflect.has(outcome as object, 'cause')).toBe(false);
    expect(
      /PRIVATE|AbortError|objects\.test/.test(
        JSON.stringify(outcome) + String((outcome as Error).stack),
      ),
    ).toBe(false);
    expect(origin.pending.size).toBe(0);
    expect(origin.started).toBe(startedAtAbort);
    expect(chunks).toBe(0);
    expect(opening.started).toBeGreaterThan(0);
    await pkg.close();
  });

  it('CA-7: en la frontera del worker, la sesión abortada a mitad de lectura no publica nada tardío', async () => {
    const bytes = await zipOf(pptxEntries({ slides: [] }));
    // La 1.ª petición es el rango 0-0; la 2.ª (cola del ZIP) queda en curso.
    const origin = gatedOrigin(bytes, 2);
    const posted: WorkerMessage[] = [];
    let first = (): void => undefined;
    // Espera por evento, no por ticks: la descompresión nativa depende del threadpool, no del bucle.
    const published = new Promise<void>((resolve) => (first = resolve));
    let listener: ((event: MessageEvent<unknown>) => void) | undefined;
    serveOoxml({
      postMessage: (message) => {
        posted.push(message);
        first();
      },
      addEventListener: (_type, value) => (listener = value),
    });
    const send = (session: number) =>
      listener?.({
        data: { type: 'open', session, kind: 'pptx', url: SIGNED_URL },
      } as MessageEvent<unknown>);
    send(1);
    await origin.held;
    expect(origin.pending.size).toBe(1);
    jest.restoreAllMocks();
    const fresh = gatedOrigin(bytes, Number.POSITIVE_INFINITY);
    send(2);
    await published;
    await new Promise((resolve) => setImmediate(resolve));
    expect(posted).toEqual([{ type: 'opened', session: 2, preview: { kind: 'pptx', slides: [] } }]);
    expect(origin.pending.size).toBe(0);
    expect(fresh.started).toBeGreaterThan(0);
  });
});
