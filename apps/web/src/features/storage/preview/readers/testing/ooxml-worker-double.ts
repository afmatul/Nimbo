import {
  connectOoxmlWorker,
  type OoxmlWorkerOptions,
  type OoxmlWorkerPort,
  type OoxmlWorkerReading,
} from '../ooxml-worker-client';

type UnitRequest = { readonly request: number; readonly index: number; readonly offset: number };
type Posted = { readonly type: string; readonly session: number } & Partial<UnitRequest>;
export type OoxmlWorkerDouble = {
  readonly posted: readonly Posted[];
  readonly state: { terminated: number; options: OoxmlWorkerOptions | undefined };
  readonly session: () => number;
  readonly requests: () => UnitRequest[];
  readonly start: (options: OoxmlWorkerOptions) => OoxmlWorkerReading;
  readonly opened: (preview: object) => void;
  readonly unit: (projection: object, request?: number) => void;
  readonly failure: (reason: string) => void;
};

/**
 * Puerto de worker controlado: la UI usa el cliente real (sesión, validación y descarte de
 * obsoletos) y la prueba responde como la sesión del worker, sin motor ni red.
 */
export function ooxmlWorkerDouble(): OoxmlWorkerDouble {
  const target = new EventTarget();
  const posted: Posted[] = [];
  const state: OoxmlWorkerDouble['state'] = { terminated: 0, options: undefined };
  const port = {
    postMessage: (message: Posted) => posted.push(message),
    addEventListener: target.addEventListener.bind(target),
    removeEventListener: target.removeEventListener.bind(target),
    terminate: () => {
      state.terminated++;
    },
  } as unknown as OoxmlWorkerPort;
  const session = (): number => posted[0]?.session ?? 0;
  const requests = (): UnitRequest[] =>
    posted.filter((message) => message.type === 'unit') as UnitRequest[];
  const emit = (data: object): void => {
    target.dispatchEvent(Object.assign(new Event('message'), { data }));
  };
  return {
    posted,
    state,
    session,
    requests,
    start: (options: OoxmlWorkerOptions): OoxmlWorkerReading => {
      state.options = options;
      return connectOoxmlWorker(port, options);
    },
    opened: (preview: object) => emit({ type: 'opened', session: session(), preview }),
    /** Responde la petición indicada (por defecto, la última) con la proyección dada. */
    unit: (projection: object, request = requests().at(-1)?.request ?? 0) =>
      emit({ type: 'unit', session: session(), request, projection }),
    failure: (reason: string) => emit({ type: 'failure', session: session(), reason }),
  };
}
