import { OoxmlError, openZipPackage, type ZipPackage } from '../readers/ooxml-package-reader';
import { openOoxmlDocument } from '../readers/ooxml-relations';

import { parseOpenRequest, type OpenRequest, type WorkerMessage } from './ooxml-protocol';

/** Lo único que la sesión necesita del ámbito del worker; permite probarla sin un Worker real. */
export type WorkerScope = {
  readonly postMessage: (message: WorkerMessage) => void;
  readonly addEventListener: (
    type: 'message',
    listener: (event: MessageEvent<unknown>) => void,
  ) => void;
};

async function openSession(
  scope: WorkerScope,
  request: OpenRequest,
  signal: AbortSignal,
): Promise<void> {
  let pkg: ZipPackage | undefined;
  try {
    pkg = await openZipPackage({ url: request.url, signal });
    await openOoxmlDocument(pkg, request.kind);
    if (!signal.aborted) scope.postMessage({ type: 'opened', session: request.session });
  } catch (error) {
    if (signal.aborted) return;
    const reason = error instanceof OoxmlError ? error.reason : 'unavailable';
    scope.postMessage({ type: 'failure', session: request.session, reason });
  } finally {
    // T-09a solo valida el paquete; T-09b conservará la sesión abierta para leer unidades.
    await pkg?.close();
  }
}

/** Una sola sesión activa: una petición nueva aborta la anterior, que ya no publica nada. */
export function serveOoxml(scope: WorkerScope): void {
  let active: AbortController | undefined;
  scope.addEventListener('message', (event) => {
    const request = parseOpenRequest(event.data);
    if (request === undefined) return;
    active?.abort();
    const controller = new AbortController();
    active = controller;
    void openSession(scope, request, controller.signal);
  });
}
