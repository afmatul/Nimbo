import { connectOoxmlWorker, type OoxmlWorkerPort } from './ooxml-worker-client';

const URL = 'https://objects.test/private-object?X-Amz-Signature=PRIVATE_SIGNATURE';

/** Worker de prueba basado en EventTarget: registra lo enviado y si fue terminado. */
function fakeWorker() {
  const target = new EventTarget();
  const sent: unknown[] = [];
  const terminate = jest.fn();
  const port = {
    postMessage: (message: unknown) => sent.push(message),
    addEventListener: target.addEventListener.bind(target),
    removeEventListener: target.removeEventListener.bind(target),
    terminate,
  } as unknown as OoxmlWorkerPort;
  const emit = (type: string, data?: unknown): void => {
    target.dispatchEvent(Object.assign(new Event(type), { data }));
  };
  return { port, sent, terminate, emit };
}

const PREVIEW = { kind: 'xlsx', sheets: [{ name: 'Uno', type: 'worksheet', state: 'visible' }] };
const PROJECTION = { index: 0, columns: 0, rows: [], missingCache: 0 };
const PRESENTATION = { kind: 'pptx', slides: [{ index: 0, state: 'hidden' }] };
const SLIDE = { index: 0, blocks: [{ kind: 'text', text: 'Texto cacheado' }] };

function connect(
  worker: ReturnType<typeof fakeWorker>,
  signal = new AbortController().signal,
  kind: 'xlsx' | 'pptx' = 'xlsx',
) {
  const onOpened = jest.fn();
  const onUnit = jest.fn();
  const onFailure = jest.fn();
  const reading = connectOoxmlWorker(worker.port, {
    kind,
    url: URL,
    signal,
    onOpened,
    onUnit,
    onFailure,
  });
  const session = (worker.sent[0] as { session: number }).session;
  return { reading, onOpened, onUnit, onFailure, session };
}

describe('cliente del worker OOXML T-09a', () => {
  it('CA-11: envía solo la petición open con una sesión nueva', () => {
    const worker = fakeWorker();
    const first = connect(worker);
    connect(fakeWorker());
    expect(worker.sent).toEqual([{ type: 'open', session: first.session, kind: 'xlsx', url: URL }]);
    expect(first.session).toBeGreaterThan(0);
  });

  it('CA-2: aplica solo mensajes válidos de su propia sesión', () => {
    const worker = fakeWorker();
    const { onOpened, onFailure, session } = connect(worker);
    worker.emit('message', { type: 'opened', session: session + 100 });
    worker.emit('message', { type: 'failure', session, reason: 'Invalid CRC32' });
    worker.emit('message', { type: 'opened', session, url: URL });
    expect(onOpened).not.toHaveBeenCalled();
    expect(onFailure).not.toHaveBeenCalled();
    // Desde T-09b, un XLSX abre siempre con su libro.
    worker.emit('message', { type: 'opened', session, preview: PREVIEW });
    worker.emit('message', { type: 'opened', session, preview: PREVIEW });
    expect(onOpened.mock.calls).toEqual([[PREVIEW]]);
    expect(worker.terminate).not.toHaveBeenCalled();
  });

  it('CA-2: un XLSX que abre sin libro es una violación del protocolo (unavailable)', () => {
    const worker = fakeWorker();
    const { onOpened, onFailure, session } = connect(worker);
    worker.emit('message', { type: 'opened', session });
    expect(onOpened).not.toHaveBeenCalled();
    expect(onFailure.mock.calls).toEqual([['unavailable']]);
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });

  it('CA-2: PPTX sin metadata es una violación del protocolo (unavailable)', () => {
    const worker = fakeWorker();
    const { onOpened, onFailure, session } = connect(worker, new AbortController().signal, 'pptx');
    worker.emit('message', { type: 'opened', session });
    expect(onOpened).not.toHaveBeenCalled();
    expect(onFailure.mock.calls).toEqual([['unavailable']]);
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });

  it('CA-1/7: PPTX entrega metadata y solo la última slide, sin callbacks después de dispose', () => {
    const worker = fakeWorker();
    const { reading, onOpened, onUnit, onFailure, session } = connect(
      worker,
      new AbortController().signal,
      'pptx',
    );
    worker.emit('message', { type: 'opened', session, preview: PRESENTATION });
    expect(onOpened.mock.calls).toEqual([[PRESENTATION]]);
    reading.select(0, 0);
    reading.select(0, 0);
    worker.emit('message', { type: 'unit', session, request: 1, projection: SLIDE });
    expect(onUnit).not.toHaveBeenCalled();
    worker.emit('message', { type: 'unit', session, request: 2, projection: SLIDE });
    expect(onUnit.mock.calls).toEqual([[SLIDE]]);
    reading.dispose();
    worker.emit('message', { type: 'unit', session, request: 2, projection: SLIDE });
    worker.emit('error', new Error(URL));
    expect(onUnit).toHaveBeenCalledTimes(1);
    expect(onFailure).not.toHaveBeenCalled();
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });

  it.each(['xlsx', 'pptx'] as const)(
    'CA-2: no entrega metadata de otro formato a un cliente %s',
    (kind) => {
      const worker = fakeWorker();
      const { onOpened, onFailure, session } = connect(worker, new AbortController().signal, kind);
      worker.emit('message', {
        type: 'opened',
        session,
        preview: kind === 'xlsx' ? PRESENTATION : PREVIEW,
      });
      expect(onOpened).not.toHaveBeenCalled();
      expect(onFailure.mock.calls).toEqual([['unavailable']]);
    },
  );

  it.each(['xlsx', 'pptx'] as const)(
    'CA-2: no entrega proyección de otro formato a un cliente %s',
    (kind) => {
      const worker = fakeWorker();
      const { reading, onUnit, onFailure, session } = connect(
        worker,
        new AbortController().signal,
        kind,
      );
      worker.emit('message', {
        type: 'opened',
        session,
        preview: kind === 'xlsx' ? PREVIEW : PRESENTATION,
      });
      reading.select(0, 0);
      worker.emit('message', {
        type: 'unit',
        session,
        request: 1,
        projection: kind === 'xlsx' ? SLIDE : PROJECTION,
      });
      expect(onUnit).not.toHaveBeenCalled();
      expect(onFailure.mock.calls).toEqual([['unavailable']]);
    },
  );

  it('CA-7: select solo tras abrir, con peticiones crecientes; solo la última unidad se aplica', () => {
    const worker = fakeWorker();
    const { reading, onUnit, session } = connect(worker);
    reading.select(0, 0);
    expect(worker.sent).toHaveLength(1);
    worker.emit('message', { type: 'opened', session, preview: PREVIEW });
    reading.select(0, 0);
    reading.select(0, 200);
    expect(worker.sent.slice(1)).toEqual([
      { type: 'unit', session, request: 1, index: 0, offset: 0 },
      { type: 'unit', session, request: 2, index: 0, offset: 200 },
    ]);
    worker.emit('message', { type: 'unit', session, request: 1, projection: PROJECTION });
    worker.emit('message', {
      type: 'unit',
      session: session + 1,
      request: 2,
      projection: PROJECTION,
    });
    expect(onUnit).not.toHaveBeenCalled();
    worker.emit('message', { type: 'unit', session, request: 2, projection: PROJECTION });
    expect(onUnit.mock.calls).toEqual([[PROJECTION]]);
    reading.dispose();
    reading.select(1, 0);
    expect(worker.sent).toHaveLength(3);
  });

  it.each(['corrupt', 'protected', 'unavailable', 'memory'])(
    'CA-2: failure %s termina el worker y notifica una vez',
    (reason) => {
      const worker = fakeWorker();
      const { onFailure, session } = connect(worker);
      worker.emit('message', { type: 'failure', session, reason });
      worker.emit('message', { type: 'failure', session, reason: 'corrupt' });
      worker.emit('message', { type: 'opened', session });
      expect(onFailure.mock.calls).toEqual([[reason]]);
      expect(worker.terminate).toHaveBeenCalledTimes(1);
    },
  );

  it.each(['error', 'messageerror'])(
    'CA-2: evento %s del worker es unavailable saneado',
    (type) => {
      const worker = fakeWorker();
      const { onFailure } = connect(worker);
      worker.emit(type, new Error(URL));
      expect(onFailure.mock.calls).toEqual([['unavailable']]);
      expect(worker.terminate).toHaveBeenCalledTimes(1);
    },
  );

  it('CA-7: abortar termina sin notificar y descarta mensajes tardíos', () => {
    const controller = new AbortController();
    const worker = fakeWorker();
    const { onOpened, onFailure, session, reading } = connect(worker, controller.signal);
    controller.abort();
    worker.emit('message', { type: 'opened', session });
    worker.emit('error');
    reading.dispose();
    expect(onOpened).not.toHaveBeenCalled();
    expect(onFailure).not.toHaveBeenCalled();
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });

  it('CA-7: señal ya abortada termina sin enviar la URL', () => {
    const controller = new AbortController();
    controller.abort();
    const worker = fakeWorker();
    connectOoxmlWorker(worker.port, {
      kind: 'pptx',
      url: URL,
      signal: controller.signal,
      onOpened: jest.fn(),
      onUnit: jest.fn(),
      onFailure: jest.fn(),
    });
    expect(worker.sent).toEqual([]);
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });
});
