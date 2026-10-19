import { parseWorkerMessage, type WorkerMessage } from '../workers/ooxml-protocol';

import type { OoxmlFailureReason } from './ooxml-package-reader';
import type { OoxmlKind } from './ooxml-relations';
import type { WorkbookPreview } from './xlsx-reader';
import type { SheetProjection } from './xlsx-sheet';

export type OoxmlWorkerPort = Pick<
  Worker,
  'postMessage' | 'addEventListener' | 'removeEventListener' | 'terminate'
>;
export type OoxmlWorkerOptions = {
  readonly kind: OoxmlKind;
  readonly url: string;
  readonly signal: AbortSignal;
  /** XLSX siempre recibe su libro; PPTX abre sin vista propia hasta que exista su lector. */
  readonly onOpened: (preview: WorkbookPreview | undefined) => void;
  readonly onUnit: (projection: SheetProjection) => void;
  readonly onFailure: (reason: OoxmlFailureReason) => void;
};
/** `dispose` termina el worker: es el cierre definitivo, también de un worker colgado. */
export type OoxmlWorkerReading = {
  readonly select: (index: number, offset: number) => void;
  readonly dispose: () => void;
};

type Connection = {
  readonly port: OoxmlWorkerPort;
  readonly options: OoxmlWorkerOptions;
  readonly session: number;
  active: boolean;
  opened: boolean;
  request: number;
};

let lastSession = 0;
const FAILURE_EVENTS = ['error', 'messageerror'] as const;

function deliver(
  connection: Connection,
  message: WorkerMessage,
  fail: (reason: OoxmlFailureReason) => void,
) {
  const { options } = connection;
  if (message.type === 'failure') fail(message.reason);
  else if (message.type === 'opened' && !connection.opened) {
    if (options.kind === 'xlsx' && message.preview === undefined) return fail('unavailable');
    connection.opened = true;
    options.onOpened(message.preview);
  } else if (message.type === 'unit' && message.request === connection.request) {
    options.onUnit(message.projection);
  }
}

function listenersOf(connection: Connection) {
  const fail = (reason: OoxmlFailureReason): void => {
    if (!connection.active) return;
    dispose();
    connection.options.onFailure(reason);
  };
  const onMessage = (event: MessageEvent<unknown>): void => {
    const message = parseWorkerMessage(event.data);
    if (connection.active && message?.session === connection.session)
      deliver(connection, message, fail);
  };
  const onError = (): void => fail('unavailable');
  const dispose = (): void => {
    if (!connection.active) return;
    connection.active = false;
    connection.port.removeEventListener('message', onMessage);
    for (const type of FAILURE_EVENTS) connection.port.removeEventListener(type, onError);
    connection.options.signal.removeEventListener('abort', dispose);
    connection.port.terminate();
  };
  return { onMessage, onError, dispose };
}

/** Pide una unidad solo tras abrir; una petición nueva deja obsoleta la anterior. */
function selectOf(connection: Connection) {
  return (index: number, offset: number): void => {
    if (!connection.active || !connection.opened) return;
    connection.request++;
    const { session, request } = connection;
    connection.port.postMessage({ type: 'unit', session, request, index, offset });
  };
}

/** Sesión numerada: un mensaje de otra sesión, inválido, obsoleto o posterior al cierre nunca se aplica. */
export function connectOoxmlWorker(
  port: OoxmlWorkerPort,
  options: OoxmlWorkerOptions,
): OoxmlWorkerReading {
  const connection: Connection = {
    port,
    options,
    session: ++lastSession,
    active: true,
    opened: false,
    request: 0,
  };
  const { onMessage, onError, dispose } = listenersOf(connection);
  const reading = { select: selectOf(connection), dispose };
  if (options.signal.aborted) {
    dispose();
    return reading;
  }
  options.signal.addEventListener('abort', dispose, { once: true });
  port.addEventListener('message', onMessage);
  for (const type of FAILURE_EVENTS) port.addEventListener(type, onError);
  port.postMessage({
    type: 'open',
    session: connection.session,
    kind: options.kind,
    url: options.url,
  });
  return reading;
}
