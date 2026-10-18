import { MessageChannel, type MessagePort } from 'node:worker_threads';

import { connectOoxmlWorker, type OoxmlWorkerPort } from '../readers/ooxml-worker-client';
import { SIGNED_URL, serveObject } from '../readers/testing/object-server';
import { ooxmlEntries, zipOf } from '../readers/testing/ooxml-fixtures';

import type { WorkerMessage } from './ooxml-protocol';
import { serveOoxml, type WorkerScope } from './ooxml-session';

jest.mock('../readers/zip-core', () => jest.requireActual('@zip.js/zip.js/index-native.cjs'));

function scope() {
  const posted: WorkerMessage[] = [];
  let listener: ((event: MessageEvent<unknown>) => void) | undefined;
  const worker: WorkerScope = {
    postMessage: (message) => posted.push(message),
    addEventListener: (_type, value) => {
      listener = value;
    },
  };
  serveOoxml(worker);
  const send = (data: unknown): void => listener?.({ data } as MessageEvent<unknown>);
  return { posted, send };
}

async function settled(posted: readonly WorkerMessage[], count: number): Promise<void> {
  for (let attempt = 0; attempt < 200 && posted.length < count; attempt++)
    await new Promise((resolve) => setTimeout(resolve, 5));
}

function open(session: number, kind = 'xlsx') {
  return { type: 'open', session, kind, url: SIGNED_URL };
}

describe('sesión del worker OOXML T-09a (zip.js y saxes reales)', () => {
  afterEach(() => jest.restoreAllMocks());

  it('CA-1: paquete válido responde opened, sin devolver la URL firmada', async () => {
    serveObject(await zipOf(ooxmlEntries('xlsx')));
    const worker = scope();
    worker.send(open(7));
    await settled(worker.posted, 1);
    expect(worker.posted).toEqual([{ type: 'opened', session: 7 }]);
    expect(JSON.stringify(worker.posted).includes('PRIVATE')).toBe(false);
  });

  it.each([
    ['corrupto', zipOf(ooxmlEntries('pptx')), 'corrupt'],
    ['protegido', zipOf(ooxmlEntries('xlsx'), { password: 'secreta' }), 'protected'],
  ] as const)('CA-2: paquete %s responde solo la razón cerrada', async (_label, bytes, reason) => {
    serveObject(await bytes);
    const worker = scope();
    worker.send(open(1));
    await settled(worker.posted, 1);
    expect(worker.posted).toEqual([{ type: 'failure', session: 1, reason }]);
  });

  it('CA-2: origen que rechaza responde unavailable', async () => {
    const server = serveObject(await zipOf(ooxmlEntries('xlsx')));
    server.failAfter = 0;
    const worker = scope();
    worker.send(open(1));
    await settled(worker.posted, 1);
    expect(worker.posted).toEqual([{ type: 'failure', session: 1, reason: 'unavailable' }]);
  });

  it('CA-7: una petición nueva aborta la anterior, que no publica nada tardío', async () => {
    const server = serveObject(await zipOf(ooxmlEntries('xlsx')));
    const worker = scope();
    worker.send(open(1));
    worker.send(open(2));
    await settled(worker.posted, 1);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(worker.posted).toEqual([{ type: 'opened', session: 2 }]);
    expect(server.signals[0]?.aborted).toBe(true);
  });

  it('CA-11: mensajes inválidos se ignoran sin abrir nada', async () => {
    const server = serveObject(await zipOf(ooxmlEntries('xlsx')));
    const worker = scope();
    for (const data of [null, 'open', { ...open(1), headers: {} }, { ...open(1), kind: 'docx' }])
      worker.send(data);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(worker.posted).toEqual([]);
    expect(server.requests).toEqual([]);
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
    serveObject(await zipOf(ooxmlEntries('pptx', { strict: true })));
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
        onFailure: (value) => {
          expect(terminate).toHaveBeenCalledTimes(1);
          resolve(value);
        },
      });
    });
    expect(reason).toBe('corrupt');
    close();
  });
});
