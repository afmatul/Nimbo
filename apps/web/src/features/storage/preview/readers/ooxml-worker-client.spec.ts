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

function connect(worker: ReturnType<typeof fakeWorker>, signal = new AbortController().signal) {
  const onOpened = jest.fn();
  const onFailure = jest.fn();
  const reading = connectOoxmlWorker(worker.port, {
    kind: 'xlsx',
    url: URL,
    signal,
    onOpened,
    onFailure,
  });
  const session = (worker.sent[0] as { session: number }).session;
  return { reading, onOpened, onFailure, session };
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
    worker.emit('message', { type: 'opened', session });
    expect(onOpened).toHaveBeenCalledTimes(1);
    expect(worker.terminate).not.toHaveBeenCalled();
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
      onFailure: jest.fn(),
    });
    expect(worker.sent).toEqual([]);
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });
});
