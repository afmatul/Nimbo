'use client';

import type { FileKind } from '@nimbo/contracts';
import * as React from 'react';

import type { PreviewFailure } from '../preview-failure';
import type { ReaderEvents } from '../reader-events';

import { PREVIEW_WAIT_DELAY_MS, type PreviewState } from './use-preview';

type ReadingView =
  { readonly status: 'ready' } | Extract<PreviewState, { status: 'loading' | 'failure' }>;
type ReadingControl = {
  active: boolean;
  pending: boolean;
  timer?: ReturnType<typeof setTimeout>;
  dispose?: () => Promise<void>;
};
type ReadingSession = {
  readonly generation: number;
  readonly managedReader: boolean;
  /** Vencimiento de la entrega de esta sesión, en ms; no el de otra emisión. */
  readonly expiresAt: number | undefined;
  readonly control: React.RefObject<ReadingControl | null>;
};
const READER_REASONS: readonly PreviewFailure['reason'][] = [
  'protected',
  'corrupt',
  'unavailable',
  'memory',
  'expired',
];
type CurrentReading = { readonly session: ReadingSession; readonly view: ReadingView };
type PreviewContent = Required<ReaderEvents> & {
  readonly state: PreviewState;
  readonly onFailure: (failure: PreviewFailure) => void;
  readonly retire: () => Promise<boolean>;
};
const LOADING: ReadingView = { status: 'loading', prolonged: false };
const MANAGED_KINDS: readonly (FileKind | undefined)[] = ['imagen', 'texto', 'pdf', 'xlsx', 'pptx'];

function readingControl(ref: ReadingSession['control']): ReadingControl {
  if (ref.current === null) ref.current = { active: true, pending: true };
  return ref.current;
}

function stopWaiting(control: ReadingControl): void {
  control.pending = false;
  clearTimeout(control.timer);
}

function useReadingWait(session: ReadingSession, publish: (value: CurrentReading) => void): void {
  React.useEffect(() => {
    if (!session.managedReader) return;
    const control = readingControl(session.control);
    control.active = true;
    if (control.pending) {
      control.timer = setTimeout(() => {
        if (control.active && control.pending)
          publish({ session, view: { status: 'loading', prolonged: true } });
      }, PREVIEW_WAIT_DELAY_MS);
    }
    return () => {
      control.active = false;
      clearTimeout(control.timer);
    };
  }, [session, publish]);
}

function useRetireReading(session: ReadingSession): () => Promise<boolean> {
  const mounted = React.useRef(false);
  const retiring = React.useRef(false);
  React.useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  React.useEffect(() => {
    retiring.current = false;
  }, [session]);
  return React.useCallback(async () => {
    if (retiring.current) return false;
    retiring.current = true;
    const control = readingControl(session.control);
    control.active = false;
    stopWaiting(control);
    try {
      await control.dispose?.();
    } catch {
      /* Nunca transportar errores privados de cleanup. */
    }
    return mounted.current;
  }, [session]);
}

/**
 * El lector solo ve una lectura saneada: si falló sin causa propia cuando su URL ya había vencido,
 * la acción útil es reemitir. Las causas del documento (protegido, corrupto, memoria) se conservan.
 */
function readerReason(failure: PreviewFailure, expiresAt: number | undefined) {
  const reason = READER_REASONS.includes(failure.reason) ? failure.reason : 'unavailable';
  const expired = expiresAt !== undefined && Date.now() >= expiresAt;
  return reason === 'unavailable' && expired ? 'expired' : reason;
}

function useReaderCallbacks(session: ReadingSession, publish: (value: CurrentReading) => void) {
  const onReady = React.useCallback(() => {
    const control = readingControl(session.control);
    if (control.active && control.pending) {
      stopWaiting(control);
      publish({ session, view: { status: 'ready' } });
    }
  }, [session, publish]);
  const onFailure = React.useCallback(
    (failure: PreviewFailure) => {
      const control = readingControl(session.control);
      if (!control.active) return;
      stopWaiting(control);
      const reason = readerReason(failure, session.expiresAt);
      publish({ session, view: { status: 'failure', failure: { reason, correlationId: '' } } });
    },
    [session, publish],
  );
  return { onReady, onFailure };
}

function useReaderCleanup(session: ReadingSession): NonNullable<ReaderEvents['registerCleanup']> {
  return React.useCallback(
    (dispose) => {
      const control = readingControl(session.control);
      control.dispose = dispose;
      return () => {
        if (control.dispose === dispose) delete control.dispose;
      };
    },
    [session],
  );
}

export function usePreviewContent(state: PreviewState, generation: number): PreviewContent {
  const delivery = state.status === 'success' ? state.delivery : undefined;
  const kind = delivery?.file.kind;
  const managedReader = MANAGED_KINDS.includes(kind);
  const expiresAt = delivery === undefined ? undefined : Date.parse(delivery.expiresAt);
  const session = React.useMemo<ReadingSession>(
    () => ({
      generation,
      managedReader,
      expiresAt,
      control: React.createRef<ReadingControl>(),
    }),
    [generation, managedReader, expiresAt],
  );
  const [current, setCurrent] = React.useState<CurrentReading>();
  useReadingWait(session, setCurrent);
  const retire = useRetireReading(session);
  const callbacks = useReaderCallbacks(session, setCurrent);
  const registerCleanup = useReaderCleanup(session);
  const view = current?.session === session ? current.view : LOADING;
  return {
    state: !managedReader || view.status === 'ready' ? state : view,
    ...callbacks,
    registerCleanup,
    retire,
  };
}
