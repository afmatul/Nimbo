import { MessageChannel } from 'node:worker_threads';

import * as packages from '../readers/ooxml-package-reader';
import { connectOoxmlWorker, type OoxmlWorkerPort } from '../readers/ooxml-worker-client';
import { SIGNED_URL, serveObject } from '../readers/testing/object-server';
import { zipOf } from '../readers/testing/ooxml-fixtures';
import { holdNextRange, holdPart } from '../readers/testing/pptx-cancellation';
import { pptxEntries, textShape, type PresentationFixture } from '../readers/testing/pptx-fixtures';

import { parseWorkerMessage, type WorkerMessage } from './ooxml-protocol';
import { serveOoxml, type WorkerScope } from './ooxml-session';

jest.mock('../readers/zip-core', () => jest.requireActual('@zip.js/zip.js/index-native.cjs'));
jest.mock('../readers/ooxml-package-reader', () => {
  const actual = jest.requireActual<typeof packages>('../readers/ooxml-package-reader');
  return { ...actual, openZipPackage: jest.fn(actual.openZipPackage) };
});

afterEach(() => {
  jest.restoreAllMocks();
  jest
    .mocked(packages.openZipPackage)
    .mockImplementation(
      jest.requireActual<typeof packages>('../readers/ooxml-package-reader').openZipPackage,
    );
});

const DECK: PresentationFixture = {
  slides: [
    { layout: 0, body: textShape(2, [['Uno']]) },
    { attributes: 'show="0"', body: textShape(2, [['Dos']]) },
  ],
  layouts: [{ master: 0, body: textShape(2, [['Layout']]) }],
  masters: [{ body: textShape(2, [['Master']]) }],
};
const PREVIEW = {
  kind: 'pptx',
  slides: [
    { index: 0, state: 'visible' },
    { index: 1, state: 'hidden' },
  ],
};
const open = (session = 1) => ({ type: 'open', session, kind: 'pptx', url: SIGNED_URL });
const unit = (request: number, index: number, session = 1) => ({
  type: 'unit',
  session,
  request,
  index,
  offset: 0,
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
  return {
    posted,
    waitFor,
    send: (data: unknown) => listener?.({ data } as MessageEvent<unknown>),
  };
}

function observePackages() {
  const actual = jest.requireActual<typeof packages>(
    '../readers/ooxml-package-reader',
  ).openZipPackage;
  const opened: { pkg: packages.ZipPackage; close: jest.Mock; signal: AbortSignal }[] = [];
  jest.mocked(packages.openZipPackage).mockImplementation(async (source) => {
    const pkg = await actual(source);
    const close = jest.fn(pkg.close);
    const observed = { ...pkg, close };
    opened.push({ pkg: observed, close, signal: source.signal });
    return observed;
  });
  return opened;
}

describe('sesión PPTX T-09b: una slide por unidad sobre el worker OOXML', () => {
  it('CA-1: opened lleva la presentación y unit entrega solo proyección estrecha', async () => {
    const opened = observePackages();
    serveObject(await zipOf(pptxEntries(DECK)));
    const worker = scope();
    worker.send(open());
    await worker.waitFor(1);
    try {
      expect(worker.posted).toEqual([{ type: 'opened', session: 1, preview: PREVIEW }]);
      worker.send(unit(1, 0));
      await worker.waitFor(2);
      expect(worker.posted[1]).toEqual({
        type: 'unit',
        session: 1,
        request: 1,
        projection: {
          index: 0,
          blocks: ['Master', 'Layout', 'Uno'].map((text) => ({ kind: 'text', text })),
        },
      });
      for (const message of worker.posted) expect(parseWorkerMessage(message)).toEqual(message);
      expect(opened[0]?.close).not.toHaveBeenCalled();
      expect(JSON.stringify(worker.posted)).not.toMatch(/PRIVATE|https?:|<|rId|\.xml/);
    } finally {
      await opened[0]?.pkg.close();
    }
  });

  it.each([
    '/ppt/slides/slide1.xml',
    '/ppt/slides/_rels/slide1.xml.rels',
    '/ppt/slideLayouts/slideLayout1.xml',
    '/ppt/slideLayouts/_rels/slideLayout1.xml.rels',
    '/ppt/slideMasters/slideMaster1.xml',
    '/ppt/slideMasters/_rels/slideMaster1.xml.rels',
  ])('CA-7: unidad nueva cancela %s y reutiliza el paquete sin respuestas stale', async (part) => {
    const opened = observePackages();
    serveObject(await zipOf(pptxEntries(DECK)));
    const worker = scope();
    worker.send(open());
    await worker.waitFor(1);
    const pkg = opened[0]?.pkg;
    if (!pkg) throw new Error('Falta el paquete de prueba');
    const ready = holdPart(pkg, part);
    try {
      worker.send(unit(1, 0));
      const origin = await ready;
      await origin.held;
      worker.send(unit(2, 1));
      expect(origin.pending).toBe(0);
      await worker.waitFor(2);
      expect(worker.posted.slice(1)).toEqual([
        {
          type: 'unit',
          session: 1,
          request: 2,
          projection: {
            index: 1,
            blocks: [{ kind: 'text', text: 'Dos' }],
          },
        },
      ]);
      worker.send(unit(3, 0));
      await worker.waitFor(3);
      expect(worker.posted[2]).toMatchObject({
        type: 'unit',
        request: 3,
        projection: { index: 0 },
      });
      expect(opened).toHaveLength(1);
      expect(opened[0]?.signal.aborted).toBe(false);
      expect(opened[0]?.close).not.toHaveBeenCalled();
      expect(origin.pending).toBe(0);
    } finally {
      await pkg.close();
    }
  });

  it('CA-7: tres unidades rápidas nunca solapan readPart sobre el mismo lector', async () => {
    const opened = observePackages();
    serveObject(await zipOf(pptxEntries(DECK)));
    const worker = scope();
    worker.send(open());
    await worker.waitFor(1);
    const pkg = opened[0]?.pkg;
    if (!pkg) throw new Error('Falta el paquete de prueba');
    const origin = holdNextRange();
    const readPart = pkg.readPart;
    let active = 0;
    let maximum = 0;
    jest.spyOn(pkg, 'readPart').mockImplementation(async (...args) => {
      maximum = Math.max(maximum, ++active);
      try {
        await readPart(...args);
      } finally {
        active--;
      }
    });
    try {
      worker.send(unit(1, 0));
      await origin.held;
      worker.send(unit(2, 0));
      worker.send(unit(3, 1));
      await worker.waitFor(2);
      expect(worker.posted.slice(1)).toEqual([
        expect.objectContaining({ type: 'unit', request: 3 }),
      ]);
      expect(maximum).toBe(1);
      expect(active).toBe(0);
      expect(origin.pending).toBe(0);
    } finally {
      await pkg.close();
    }
  });

  it('CA-7: open B aborta/cierra A, ignora su unidad y solo B puede publicar', async () => {
    const opened = observePackages();
    serveObject(await zipOf(pptxEntries(DECK)));
    const worker = scope();
    worker.send(open());
    await worker.waitFor(1);
    const old = opened[0];
    if (!old) throw new Error('Falta el paquete de prueba');
    const ready = holdPart(old.pkg, '/ppt/slides/slide1.xml');
    worker.send(unit(1, 0));
    const origin = await ready;
    await origin.held;
    worker.send(open(2));
    expect(origin.pending).toBe(0);
    await worker.waitFor(2);
    worker.send(unit(2, 0, 1));
    worker.send(unit(1, 1, 2));
    await worker.waitFor(3);
    try {
      expect(old.signal.aborted).toBe(true);
      expect(old.close).toHaveBeenCalled();
      expect(old.pkg.has('/ppt/presentation.xml')).toBe(false);
      expect(worker.posted.map(({ type, session }) => [type, session])).toEqual([
        ['opened', 1],
        ['opened', 2],
        ['unit', 2],
      ]);
      expect(origin.pending).toBe(0);
    } finally {
      await opened[1]?.pkg.close();
    }
  });

  it('CA-2/11: XML corrupto de la unidad cierra el paquete y solo publica razón cerrada', async () => {
    const opened = observePackages();
    serveObject(
      await zipOf(pptxEntries({ ...DECK, slides: [...DECK.slides, { body: '<p:sp>' }] })),
    );
    const worker = scope();
    worker.send(open());
    await worker.waitFor(1);
    worker.send(unit(1, 2));
    await worker.waitFor(2);
    expect(worker.posted[1]).toEqual({ type: 'failure', session: 1, reason: 'corrupt' });
    expect(opened[0]?.signal.aborted).toBe(true);
    expect(opened[0]?.close).toHaveBeenCalled();
  });

  it('CA-2/11: fallo del GET pendiente no expone URL/XML/message/stack y cierra la sesión', async () => {
    const opened = observePackages();
    serveObject(await zipOf(pptxEntries(DECK)));
    const worker = scope();
    worker.send(open());
    await worker.waitFor(1);
    const observed = opened[0];
    if (!observed) throw new Error('Falta el paquete de prueba');
    const ready = holdPart(observed.pkg, '/ppt/slides/_rels/slide1.xml.rels');
    worker.send(unit(1, 0));
    const origin = await ready;
    await origin.held;
    origin.fail(new Error(`${SIGNED_URL}<xml>privado</xml>`));
    await worker.waitFor(2);
    expect(worker.posted.slice(1)).toEqual([
      { type: 'failure', session: 1, reason: 'unavailable' },
    ]);
    expect(origin.pending).toBe(0);
    expect(observed.signal.aborted).toBe(true);
    expect(observed.close).toHaveBeenCalled();
    expect(observed.pkg.has('/ppt/presentation.xml')).toBe(false);
  });

  it('CA-1/7: cliente y sesión intercambian una slide por MessageChannel con structured clone real', async () => {
    const opened = observePackages();
    serveObject(await zipOf(pptxEntries(DECK)));
    const { port1, port2 } = new MessageChannel();
    const terminate = jest.fn(() => {
      port1.close();
    });
    const client = Object.assign(port1, { terminate }) as unknown as OoxmlWorkerPort;
    serveOoxml(port2 as unknown as WorkerScope);
    port1.start();
    port2.start();
    try {
      const result = await new Promise((resolve, reject) => {
        const reading = connectOoxmlWorker(client, {
          kind: 'pptx',
          url: SIGNED_URL,
          signal: new AbortController().signal,
          onOpened: (preview) => {
            expect(preview).toEqual(PREVIEW);
            reading.select(1, 0);
          },
          onUnit: (projection) => {
            reading.dispose();
            resolve(projection);
          },
          onFailure: reject,
        });
      });
      expect(result).toEqual({ index: 1, blocks: [{ kind: 'text', text: 'Dos' }] });
      expect(terminate).toHaveBeenCalledTimes(1);
    } finally {
      port1.close();
      port2.close();
      await opened[0]?.pkg.close();
    }
  });
});
