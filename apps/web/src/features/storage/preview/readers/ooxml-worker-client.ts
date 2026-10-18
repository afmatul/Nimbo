import { parseWorkerMessage } from '../workers/ooxml-protocol';

import type { OoxmlFailureReason } from './ooxml-package-reader';
import type { OoxmlKind } from './ooxml-relations';

export type OoxmlWorkerPort = Pick<
  Worker,
  'postMessage' | 'addEventListener' | 'removeEventListener' | 'terminate'
>;
export type OoxmlWorkerOptions = {
  readonly kind: OoxmlKind;
  readonly url: string;
  readonly signal: AbortSignal;
  readonly onOpened: () => void;
  readonly onFailure: (reason: OoxmlFailureReason) => void;
};
/** `dispose` termina el worker: es el cierre definitivo, también de un worker colgado. */
export type OoxmlWorkerReading = { readonly dispose: () => void };

type Connection = {
  readonly port: OoxmlWorkerPort;
  readonly options: OoxmlWorkerOptions;
  readonly session: number;
  active: boolean;
};

let lastSession = 0;
const FAILURE_EVENTS = ['error', 'messageerror'] as const;

function listenersOf(connection: Connection) {
  const { options } = connection;
  const fail = (reason: OoxmlFailureReason): void => {
    if (!connection.active) return;
    dispose();
    options.onFailure(reason);
  };
  const onMessage = (event: MessageEvent<unknown>): void => {
    const message = parseWorkerMessage(event.data);
    if (!connection.active || message?.session !== connection.session) return;
    if (message.type === 'opened') options.onOpened();
    else fail(message.reason);
  };
  const onError = (): void => fail('unavailable');
  const dispose = (): void => {
    if (!connection.active) return;
    connection.active = false;
    connection.port.removeEventListener('message', onMessage);
    for (const type of FAILURE_EVENTS) connection.port.removeEventListener(type, onError);
    options.signal.removeEventListener('abort', dispose);
    connection.port.terminate();
  };
  return { onMessage, onError, dispose };
}

/** Sesión numerada: un mensaje de otra sesión, inválido o posterior al cierre nunca se aplica. */
export function connectOoxmlWorker(
  port: OoxmlWorkerPort,
  options: OoxmlWorkerOptions,
): OoxmlWorkerReading {
  const connection: Connection = { port, options, session: ++lastSession, active: true };
  const { onMessage, onError, dispose } = listenersOf(connection);
  if (options.signal.aborted) {
    dispose();
    return { dispose };
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
  return { dispose };
}
