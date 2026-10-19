import { OoxmlError, openZipPackage, type ZipPackage } from '../readers/ooxml-package-reader';
import { openOoxmlDocument } from '../readers/ooxml-relations';
import type { PptxPresentation, SlideReading } from '../readers/pptx-model';
import { openPptxPresentation } from '../readers/pptx-reader';
import { openXlsxWorkbook, type XlsxWorkbook } from '../readers/xlsx-reader';

import {
  parseWorkerRequest,
  type OpenRequest,
  type OoxmlProjection,
  type UnitRequest,
  type WorkerMessage,
} from './ooxml-protocol';

/** Lo único que la sesión necesita del ámbito del worker; permite probarla sin un Worker real. */
export type WorkerScope = {
  readonly postMessage: (message: WorkerMessage) => void;
  readonly addEventListener: (
    type: 'message',
    listener: (event: MessageEvent<unknown>) => void,
  ) => void;
};

/** Una sola sesión: su paquete sigue abierto mientras se piden unidades, hasta reabrir o fallar. */
type Session = {
  readonly id: number;
  readonly controller: AbortController;
  pkg?: ZipPackage;
  workbook?: XlsxWorkbook;
  presentation?: PptxPresentation;
  unit?: AbortController;
  latest: number;
  queue: Promise<void>;
};

const reasonOf = (error: unknown) => (error instanceof OoxmlError ? error.reason : 'unavailable');

function closeSession(session: Session | undefined): void {
  if (session === undefined) return;
  session.controller.abort();
  session.unit?.abort();
  void session.pkg?.close();
}

function fail(scope: WorkerScope, session: Session, error: unknown): void {
  scope.postMessage({ type: 'failure', session: session.id, reason: reasonOf(error) });
  closeSession(session);
}

async function openSession(scope: WorkerScope, request: OpenRequest, session: Session) {
  const { signal } = session.controller;
  try {
    const pkg = await openZipPackage({ url: request.url, signal });
    session.pkg = pkg;
    const document = await openOoxmlDocument(pkg, request.kind);
    if (request.kind === 'xlsx') session.workbook = await openXlsxWorkbook(pkg, document);
    else session.presentation = await openPptxPresentation(pkg, document);
    if (signal.aborted) return;
    const preview = session.workbook?.preview ?? session.presentation?.preview;
    scope.postMessage({ type: 'opened', session: session.id, ...(preview ? { preview } : {}) });
  } catch (error) {
    if (!signal.aborted) fail(scope, session, error);
  } finally {
    // Una sesión reemplazada mientras abría cierra aquí el paquete que llegó tarde.
    if (signal.aborted) await session.pkg?.close();
  }
}

async function readUnit(
  session: Session,
  request: UnitRequest,
  reading: SlideReading & { readonly offset: number; readonly signal: AbortSignal },
): Promise<OoxmlProjection> {
  if (session.workbook) return session.workbook.readSheet(request.index, reading);
  if (session.presentation) return session.presentation.readSlide(request.index, reading);
  throw new OoxmlError('unavailable');
}

async function runUnit(scope: WorkerScope, session: Session, request: UnitRequest) {
  const current = (): boolean =>
    session.latest === request.request && !session.controller.signal.aborted;
  if (!current()) return;
  const controller = new AbortController();
  session.unit = controller;
  try {
    const window = { offset: request.offset, current, signal: controller.signal };
    const projection = await readUnit(session, request, window);
    if (current())
      scope.postMessage({
        type: 'unit',
        session: session.id,
        request: request.request,
        projection,
      });
  } catch (error) {
    if (current()) fail(scope, session, error);
  }
}

/** Una petición `open` nueva cierra la sesión anterior; las unidades se atienden en orden y solo la última vale. */
export function serveOoxml(scope: WorkerScope): void {
  let active: Session | undefined;
  scope.addEventListener('message', (event) => {
    const request = parseWorkerRequest(event.data);
    if (request?.type === 'open') {
      closeSession(active);
      const session: Session = {
        id: request.session,
        controller: new AbortController(),
        latest: 0,
        queue: Promise.resolve(),
      };
      active = session;
      session.queue = openSession(scope, request, session);
    } else if (request?.type === 'unit' && active?.id === request.session) {
      const session = active;
      session.unit?.abort();
      session.latest = request.request;
      // Serializa el mismo paquete: ObjectRangeReader.withSignal sustituye temporalmente su señal.
      session.queue = session.queue.then(() => runUnit(scope, session, request));
    }
  });
}
