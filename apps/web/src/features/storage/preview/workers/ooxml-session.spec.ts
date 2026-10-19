import { MessageChannel, type MessagePort } from 'node:worker_threads';

import * as packages from '../readers/ooxml-package-reader';
import { connectOoxmlWorker, type OoxmlWorkerPort } from '../readers/ooxml-worker-client';
import { SIGNED_URL, serveObject } from '../readers/testing/object-server';
import { ooxmlEntries, zipOf } from '../readers/testing/ooxml-fixtures';
import { pptxEntries } from '../readers/testing/pptx-fixtures';
import { row, xlsxEntries } from '../readers/testing/xlsx-fixtures';

import type { WorkerMessage } from './ooxml-protocol';
import { serveOoxml, type WorkerScope } from './ooxml-session';

jest.mock('../readers/zip-core', () => jest.requireActual('@zip.js/zip.js/index-native.cjs'));
jest.mock('../readers/ooxml-package-reader', () => {
  const actual = jest.requireActual<typeof packages>('../readers/ooxml-package-reader');
  return { ...actual, openZipPackage: jest.fn(actual.openZipPackage) };
});

afterEach(() => {
  jest
    .mocked(packages.openZipPackage)
    .mockImplementation(
      jest.requireActual<typeof packages>('../readers/ooxml-package-reader').openZipPackage,
    );
});

function scope() {
  const posted: WorkerMessage[] = [];
  const waiting = new Set<() => void>();
  let listener: ((event: MessageEvent<unknown>) => void) | undefined;
  const worker: WorkerScope = {
    postMessage: (message) => {
      posted.push(message);
      for (const notify of waiting) notify();
    },
    addEventListener: (_type, value) => {
      listener = value;
    },
  };
  serveOoxml(worker);
  const send = (data: unknown): void => listener?.({ data } as MessageEvent<unknown>);
  const waitFor = (count: number): Promise<void> =>
    new Promise((resolve) => {
      const notify = (): void => {
        if (posted.length < count) return;
        waiting.delete(notify);
        resolve();
      };
      waiting.add(notify);
      notify();
    });
  return { posted, send, waitFor };
}

const EMPTY_WORKBOOK = { kind: 'xlsx', sheets: [] };

function open(session: number, kind = 'xlsx') {
  return { type: 'open', session, kind, url: SIGNED_URL };
}

function observePackages() {
  const actual = jest.requireActual<typeof packages>(
    '../readers/ooxml-package-reader',
  ).openZipPackage;
  const opened: { pkg: packages.ZipPackage; close: jest.Mock }[] = [];
  jest.mocked(packages.openZipPackage).mockImplementation(async (source) => {
    const pkg = await actual(source);
    const close = jest.fn(pkg.close);
    const observed = { ...pkg, close };
    opened.push({ pkg: observed, close });
    return observed;
  });
  return opened;
}

/** Mantiene un GET real del lector pendiente hasta abortar, sin depender de temporizadores de red. */
function holdNextRange() {
  const fetch = jest.mocked(globalThis.fetch).getMockImplementation();
  if (fetch === undefined) throw new Error('Falta el origen de prueba');
  let enter = (): void => undefined;
  const held = new Promise<void>((resolve) => {
    enter = resolve;
  });
  const state = { pending: 0, held };
  let hold = true;
  jest.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    if (!hold) return fetch(input, init);
    hold = false;
    state.pending++;
    enter();
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener(
        'abort',
        () => {
          state.pending--;
          reject(new DOMException('Lectura cancelada', 'AbortError'));
        },
        { once: true },
      );
    });
  });
  return state;
}

describe('sesión del worker OOXML T-09a (zip.js y saxes reales)', () => {
  afterEach(() => jest.restoreAllMocks());

  it('CA-1: paquete válido responde opened, sin devolver la URL firmada', async () => {
    serveObject(await zipOf(xlsxEntries({ sheets: [] })));
    const worker = scope();
    worker.send(open(7));
    await worker.waitFor(1);
    expect(worker.posted).toEqual([{ type: 'opened', session: 7, preview: EMPTY_WORKBOOK }]);
    expect(JSON.stringify(worker.posted).includes('PRIVATE')).toBe(false);
  });

  it.each([
    ['corrupto', zipOf(ooxmlEntries('pptx')), 'corrupt'],
    ['protegido', zipOf(ooxmlEntries('xlsx'), { password: 'secreta' }), 'protected'],
  ] as const)('CA-2: paquete %s responde solo la razón cerrada', async (_label, bytes, reason) => {
    serveObject(await bytes);
    const worker = scope();
    worker.send(open(1));
    await worker.waitFor(1);
    expect(worker.posted).toEqual([{ type: 'failure', session: 1, reason }]);
  });

  it('CA-2: origen que rechaza responde unavailable', async () => {
    const server = serveObject(await zipOf(ooxmlEntries('xlsx')));
    server.failAfter = 0;
    const worker = scope();
    worker.send(open(1));
    await worker.waitFor(1);
    expect(worker.posted).toEqual([{ type: 'failure', session: 1, reason: 'unavailable' }]);
  });

  it('CA-7: una petición nueva aborta la anterior, que no publica nada tardío', async () => {
    const server = serveObject(await zipOf(xlsxEntries({ sheets: [] })));
    const worker = scope();
    worker.send(open(1));
    worker.send(open(2));
    await worker.waitFor(1);
    await Promise.allSettled(
      jest.mocked(packages.openZipPackage).mock.results.map(({ value }) => value),
    );
    expect(worker.posted).toEqual([{ type: 'opened', session: 2, preview: EMPTY_WORKBOOK }]);
    expect(server.signals[0]?.aborted).toBe(true);
  });

  it('CA-11: mensajes inválidos se ignoran sin abrir nada', async () => {
    const server = serveObject(await zipOf(ooxmlEntries('xlsx')));
    const worker = scope();
    for (const data of [null, 'open', { ...open(1), headers: {} }, { ...open(1), kind: 'docx' }])
      worker.send(data);
    expect(worker.posted).toEqual([]);
    expect(server.requests).toEqual([]);
  });
});

const BOOK = xlsxEntries({
  sheets: [
    { name: 'Datos', data: row(1, [['A1', 't="inlineStr"', '<is><t>hola</t></is>']]) },
    { name: 'Gráfico', type: 'chartsheet', state: 'hidden' },
    { name: 'Rota', data: row(1, [['A1', 't="b"', '<v>7</v>']]) },
  ],
});
const unit = (request: number, index: number, session = 1) => ({
  type: 'unit',
  session,
  request,
  index,
  offset: 0,
});

describe('sesión del worker XLSX T-09b: paquete abierto y unidades por petición', () => {
  afterEach(() => jest.restoreAllMocks());

  it('CA-1: opened lleva el libro y unit devuelve la proyección pedida', async () => {
    serveObject(await zipOf(BOOK));
    const worker = scope();
    worker.send(open(1));
    await worker.waitFor(1);
    expect(worker.posted[0]).toEqual({
      type: 'opened',
      session: 1,
      preview: {
        kind: 'xlsx',
        sheets: [
          { name: 'Datos', type: 'worksheet', state: 'visible' },
          { name: 'Gráfico', type: 'chartsheet', state: 'hidden' },
          { name: 'Rota', type: 'worksheet', state: 'visible' },
        ],
      },
    });
    worker.send(unit(1, 0));
    await worker.waitFor(2);
    expect(worker.posted[1]).toEqual({
      type: 'unit',
      session: 1,
      request: 1,
      projection: {
        index: 0,
        columns: 1,
        rows: [{ row: 1, cells: [{ column: 1, text: 'hola', type: 'text' }] }],
        missingCache: 0,
      },
    });
    expect(JSON.stringify(worker.posted).includes('PRIVATE')).toBe(false);
  });

  it('CA-7: una petición nueva reemplaza la anterior; de otra sesión o antes de abrir se ignora', async () => {
    serveObject(await zipOf(BOOK));
    const worker = scope();
    worker.send(unit(1, 0));
    worker.send(open(1));
    await worker.waitFor(1);
    worker.send(unit(1, 0, 99));
    worker.send(unit(2, 0));
    worker.send(unit(3, 1));
    await worker.waitFor(2);
    expect(worker.posted.slice(1)).toEqual([
      {
        type: 'unit',
        session: 1,
        request: 3,
        projection: { index: 1, columns: 0, rows: [], missingCache: 0 },
      },
    ]);
  });

  it('CA-7: tres unidades rápidas no solapan readPart y solo publican la última', async () => {
    const opened = observePackages();
    serveObject(await zipOf(BOOK));
    const worker = scope();
    worker.send(open(1));
    await worker.waitFor(1);
    const pkg = opened[0]?.pkg;
    if (pkg === undefined) throw new Error('Falta el paquete de prueba');
    const readPart = pkg.readPart;
    let concurrent = 0;
    let maximum = 0;
    const reads = jest.spyOn(pkg, 'readPart').mockImplementation(async (...args) => {
      maximum = Math.max(maximum, ++concurrent);
      try {
        await readPart(...args);
      } finally {
        concurrent--;
      }
    });
    const origin = holdNextRange();
    try {
      worker.send(unit(1, 0));
      await origin.held;
      worker.send(unit(2, 0));
      worker.send(unit(3, 0));
      await worker.waitFor(2);
      expect(worker.posted.slice(1)).toEqual([
        expect.objectContaining({ type: 'unit', session: 1, request: 3 }),
      ]);
      expect(reads).toHaveBeenCalledTimes(2);
      expect(maximum).toBe(1);
      expect(concurrent).toBe(0);
      expect(origin.pending).toBe(0);
    } finally {
      await pkg.close();
    }
  });

  it('CA-2: una unidad corrupta responde la razón cerrada', async () => {
    serveObject(await zipOf(BOOK));
    const worker = scope();
    worker.send(open(1));
    await worker.waitFor(1);
    worker.send(unit(1, 2));
    await worker.waitFor(2);
    expect(worker.posted[1]).toEqual({ type: 'failure', session: 1, reason: 'corrupt' });
  });

  it('CA-7: sin AbortSignal.any cancela el GET obsoleto y reutiliza el paquete', async () => {
    const descriptor = Object.getOwnPropertyDescriptor(AbortSignal, 'any');
    const opened = observePackages();
    let pkg: packages.ZipPackage | undefined;
    try {
      Object.defineProperty(AbortSignal, 'any', { configurable: true, value: undefined });
      expect(AbortSignal.any).toBeUndefined();
      serveObject(await zipOf(BOOK));
      const worker = scope();
      worker.send(open(1));
      await worker.waitFor(1);
      pkg = opened[0]?.pkg;
      if (pkg === undefined) throw new Error('Falta el paquete de prueba');
      expect(worker.posted[0]?.type).toBe('opened');
      const currentPackage = pkg;
      const readPart = currentPackage.readPart;
      const failed = new Promise<never>((_resolve, reject) => {
        jest.spyOn(currentPackage, 'readPart').mockImplementation((...args) =>
          readPart(...args).catch((error: unknown) => {
            reject(error);
            throw error;
          }),
        );
      });
      const origin = holdNextRange();
      const pending = Promise.race([origin.held, failed]);
      worker.send(unit(1, 0));
      await pending;
      expect(origin.pending).toBe(1);
      worker.send(unit(2, 0));
      expect(origin.pending).toBe(0);
      await worker.waitFor(2);
      expect(worker.posted[1]).toEqual({
        type: 'unit',
        session: 1,
        request: 2,
        projection: {
          index: 0,
          columns: 1,
          rows: [{ row: 1, cells: [{ column: 1, text: 'hola', type: 'text' }] }],
          missingCache: 0,
        },
      });
      worker.send(unit(3, 0));
      await worker.waitFor(3);
      expect(worker.posted[2]).toEqual({ ...worker.posted[1], request: 3 });
      expect(opened).toHaveLength(1);
      expect(opened[0]?.close).not.toHaveBeenCalled();
      expect(origin.pending).toBe(0);
    } finally {
      await pkg?.close();
      if (descriptor) Object.defineProperty(AbortSignal, 'any', descriptor);
      else Reflect.deleteProperty(AbortSignal, 'any');
    }
  });

  it('CA-7: reabrir cierra la sesión anterior; sus unidades ya no responden', async () => {
    serveObject(await zipOf(BOOK));
    const worker = scope();
    worker.send(open(1));
    await worker.waitFor(1);
    worker.send(unit(1, 0));
    worker.send(open(2));
    await worker.waitFor(2);
    worker.send(unit(1, 0));
    expect(worker.posted.map(({ type, session }) => [type, session])).toEqual([
      ['opened', 1],
      ['opened', 2],
    ]);
  });

  it.each(['worksheet', 'sharedStrings'])(
    'CA-7: una unidad nueva cancela el rango pendiente de %s y el libro sigue utilizable',
    async (partType) => {
      const opened = observePackages();
      const entries = xlsxEntries({
        sheets: [
          { name: 'Datos', data: row(1, [['A1', 't="s"', '<v>8999</v>']]) },
          { name: 'Gráfico', type: 'chartsheet' },
          { name: 'Rota', data: row(1, [['A1', 't="b"', '<v>7</v>']]) },
        ],
        sharedStrings: Array.from({ length: 9000 }, (_, i) => `<t>${i}:${'dato'.repeat(16)}</t>`),
      });
      serveObject(await zipOf(entries, { level: 0 }));
      const worker = scope();
      worker.send(open(1));
      await worker.waitFor(1);
      const pkg = opened[0]?.pkg;
      if (pkg === undefined) throw new Error('Falta el paquete de prueba');
      const readPart = pkg.readPart;
      const ready = new Promise<ReturnType<typeof holdNextRange>>((resolve) => {
        let armed = true;
        jest.spyOn(pkg, 'readPart').mockImplementation((part, consume, signal) => {
          const target =
            partType === 'worksheet'
              ? part.includes('/worksheets/')
              : part.endsWith('/sharedStrings.xml');
          if (armed && target) {
            armed = false;
            resolve(holdNextRange());
          }
          return readPart(part, consume, signal);
        });
      });
      worker.send(unit(1, 0));
      const origin = await ready;
      await origin.held;
      worker.send(unit(2, 1));
      try {
        await worker.waitFor(2);
        expect(origin.pending).toBe(0);
        expect(worker.posted.slice(1)).toEqual([
          {
            type: 'unit',
            session: 1,
            request: 2,
            projection: { index: 1, columns: 0, rows: [], missingCache: 0 },
          },
        ]);
        worker.send(unit(3, 0));
        await worker.waitFor(3);
        const latest = worker.posted[2];
        expect(latest?.type).toBe('unit');
        if (latest?.type === 'unit') {
          expect(latest.request).toBe(3);
          if (!('rows' in latest.projection)) throw new Error('Se esperaba una proyección XLSX');
          expect(latest.projection.rows[0]?.cells[0]?.text).toBe(`8999:${'dato'.repeat(16)}`);
        }
        worker.send(unit(4, 2));
        await worker.waitFor(4);
        expect(worker.posted[3]).toEqual({ type: 'failure', session: 1, reason: 'corrupt' });
      } finally {
        await pkg.close();
      }
    },
  );

  it('CA-7: open B aborta la lectura de A y cierra su paquete; failure también lo cierra', async () => {
    const opened = observePackages();
    serveObject(await zipOf(BOOK));
    const worker = scope();
    worker.send(open(1));
    await worker.waitFor(1);
    const origin = holdNextRange();
    worker.send(unit(1, 0));
    await origin.held;
    worker.send(open(2));
    await worker.waitFor(2);
    expect(origin.pending).toBe(0);
    expect(opened[0]?.close).toHaveBeenCalled();
    expect(opened[0]?.pkg.has('/xl/workbook.xml')).toBe(false);
    expect(worker.posted.map(({ type, session }) => [type, session])).toEqual([
      ['opened', 1],
      ['opened', 2],
    ]);
    worker.send(unit(1, 2, 2));
    await worker.waitFor(3);
    expect(worker.posted[2]).toEqual({ type: 'failure', session: 2, reason: 'corrupt' });
    expect(opened[1]?.close).toHaveBeenCalled();
    expect(opened[1]?.pkg.has('/xl/workbook.xml')).toBe(false);
  });

  it('CA-2/11: una excepción con URL/XML/message/stack solo entrega unavailable y cierra el paquete', async () => {
    const opened = observePackages();
    serveObject(await zipOf(BOOK));
    const worker = scope();
    worker.send(open(1));
    await worker.waitFor(1);
    const pkg = opened[0]?.pkg;
    if (pkg === undefined) throw new Error('Falta el paquete de prueba');
    jest.spyOn(pkg, 'readPart').mockRejectedValue(new Error(`${SIGNED_URL}<xml>privado</xml>`));
    worker.send(unit(1, 0));
    await worker.waitFor(2);
    expect(worker.posted[1]).toEqual({ type: 'failure', session: 1, reason: 'unavailable' });
    expect(opened[0]?.close).toHaveBeenCalled();
  });

  it('CA-1: PPTX abre con una presentación vacía válida', async () => {
    serveObject(await zipOf(pptxEntries({ slides: [] })));
    const worker = scope();
    worker.send(open(1, 'pptx'));
    await worker.waitFor(1);
    expect(worker.posted).toEqual([
      { type: 'opened', session: 1, preview: { kind: 'pptx', slides: [] } },
    ]);
  });
});

/** Puerto real con structured clone: el cliente del hilo principal y la sesión del worker sin jsdom. */
function channel() {
  const { port1, port2 } = new MessageChannel();
  const terminate = jest.fn(() => {
    port1.close();
  });
  const client = Object.assign(port1, { terminate }) as unknown as OoxmlWorkerPort;
  serveOoxml(port2 as unknown as WorkerScope);
  (port2 as MessagePort).start();
  (port1 as MessagePort).start();
  return { client, terminate, close: () => port2.close() };
}

describe('cliente OOXML ↔ sesión por MessageChannel real T-09a', () => {
  afterEach(() => jest.restoreAllMocks());

  it('CA-1/7: abre, notifica opened y dispose termina una sola vez', async () => {
    serveObject(await zipOf(pptxEntries({ slides: [], strict: true })));
    const { client, terminate, close } = channel();
    const onFailure = jest.fn();
    const opened = new Promise<void>((resolve) => {
      const reading = connectOoxmlWorker(client, {
        kind: 'pptx',
        url: SIGNED_URL,
        signal: new AbortController().signal,
        onOpened: () => {
          reading.dispose();
          reading.dispose();
          resolve();
        },
        onUnit: jest.fn(),
        onFailure,
      });
    });
    await opened;
    expect(terminate).toHaveBeenCalledTimes(1);
    expect(onFailure).not.toHaveBeenCalled();
    close();
  });

  it('CA-2: corrupto termina el worker antes de notificar la razón', async () => {
    serveObject(new TextEncoder().encode('no es un paquete'));
    const { client, terminate, close } = channel();
    const reason = await new Promise<string>((resolve) => {
      connectOoxmlWorker(client, {
        kind: 'xlsx',
        url: SIGNED_URL,
        signal: new AbortController().signal,
        onOpened: () => resolve('opened'),
        onUnit: jest.fn(),
        onFailure: (value) => {
          expect(terminate).toHaveBeenCalledTimes(1);
          resolve(value);
        },
      });
    });
    expect(reason).toBe('corrupt');
    close();
  });

  it('CA-1: XLSX real de punta a punta: libro, unidad clonada y cierre', async () => {
    serveObject(await zipOf(BOOK));
    const { client, terminate, close } = channel();
    const result = await new Promise<{ sheets: number; projection: unknown }>((resolve, reject) => {
      let sheets = 0;
      const reading = connectOoxmlWorker(client, {
        kind: 'xlsx',
        url: SIGNED_URL,
        signal: new AbortController().signal,
        onOpened: (preview) => {
          sheets = preview?.sheets.length ?? -1;
          reading.select(0, 0);
        },
        onUnit: (projection) => {
          reading.dispose();
          resolve({ sheets, projection });
        },
        onFailure: reject,
      });
    });
    expect(result).toEqual({
      sheets: 3,
      projection: {
        index: 0,
        columns: 1,
        rows: [{ row: 1, cells: [{ column: 1, text: 'hola', type: 'text' }] }],
        missingCache: 0,
      },
    });
    expect(terminate).toHaveBeenCalledTimes(1);
    close();
  });
});
