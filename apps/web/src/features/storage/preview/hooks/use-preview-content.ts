'use client';

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
  readonly native: boolean;
  readonly control: React.RefObject<ReadingControl | null>;
};
type CurrentReading = { readonly session: ReadingSession; readonly view: ReadingView };
type PreviewContent = Required<ReaderEvents> & {
  readonly state: PreviewState;
  readonly onFailure: (failure: PreviewFailure) => void;
  readonly retire: () => Promise<boolean>;
};
const LOADING: ReadingView = { status: 'loading', prolonged: false };

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
    if (!session.native) return;
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
      const reason = failure.reason === 'corrupt' ? 'corrupt' : 'unavailable';
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
  const kind = state.status === 'success' ? state.delivery.file.kind : undefined;
  const native = kind === 'imagen' || kind === 'texto';
  const session = React.useMemo<ReadingSession>(
    () => ({
      generation,
      native,
      control: React.createRef<ReadingControl>(),
    }),
    [generation, native],
  );
  const [current, setCurrent] = React.useState<CurrentReading>();
  useReadingWait(session, setCurrent);
  const retire = useRetireReading(session);
  const callbacks = useReaderCallbacks(session, setCurrent);
  const registerCleanup = useReaderCleanup(session);
  const view = current?.session === session ? current.view : LOADING;
  return {
    state: !native || view.status === 'ready' ? state : view,
    ...callbacks,
    registerCleanup,
    retire,
  };
}
