'use client';

import type { PreviewUrlResponse } from '@nimbo/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, RefObject, SetStateAction } from 'react';

import type { PreviewUrlRequester } from '../api';
import { classifyPreviewFailure, type PreviewFailure } from '../preview-failure';

export type PreviewState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading'; readonly prolonged: boolean }
  | { readonly status: 'success'; readonly delivery: PreviewUrlResponse }
  | { readonly status: 'failure'; readonly failure: PreviewFailure };

type CurrentPreview = { readonly fileId: string; readonly state: PreviewState };
type Attempt = {
  readonly fileId: string;
  readonly controller: AbortController;
  readonly timer: ReturnType<typeof setTimeout>;
};
type Emission = {
  readonly fileId: string;
  readonly requestUrl: PreviewUrlRequester;
  readonly active: RefObject<Attempt | undefined>;
  readonly setCurrent: Dispatch<SetStateAction<CurrentPreview>>;
};
const LOADING: PreviewState = { status: 'loading', prolonged: false };
const WAIT_DELAY_MS = 2001;

function stopAttempt(active: Emission['active']): void {
  const previous = active.current;
  active.current = undefined;
  if (previous === undefined) return;
  clearTimeout(previous.timer);
  previous.controller.abort();
}

async function emitPreview(emission: Emission, attempt: Attempt): Promise<void> {
  const finish = (state: PreviewState): void => {
    if (emission.active.current !== attempt || attempt.controller.signal.aborted) return;
    clearTimeout(attempt.timer);
    emission.active.current = undefined;
    emission.setCurrent({ fileId: attempt.fileId, state });
  };
  try {
    const delivery = await emission.requestUrl(attempt.fileId, attempt.controller.signal);
    finish({ status: 'success', delivery });
  } catch (caught) {
    finish({ status: 'failure', failure: classifyPreviewFailure(caught) });
  }
}

function beginEmission(emission: Emission): void {
  stopAttempt(emission.active);
  emission.setCurrent({ fileId: emission.fileId, state: LOADING });
  const attempt: Attempt = {
    fileId: emission.fileId,
    controller: new AbortController(),
    timer: setTimeout(() => {
      if (emission.active.current !== attempt) return;
      emission.setCurrent({
        fileId: attempt.fileId,
        state: { status: 'loading', prolonged: true },
      });
    }, WAIT_DELAY_MS),
  };
  emission.active.current = attempt;
  void emitPreview(emission, attempt);
}

/** La identidad del intento, además de su señal, protege ante transportes que ignoren el aborto. */
export function usePreview(
  fileId: string,
  requestUrl: PreviewUrlRequester,
): {
  readonly state: PreviewState;
  readonly retry: () => void;
} {
  const [current, setCurrent] = useState<CurrentPreview>({ fileId, state: { status: 'idle' } });
  const active = useRef<Attempt | undefined>(undefined);
  const retry = useCallback(
    () => beginEmission({ fileId, requestUrl, active, setCurrent }),
    [fileId, requestUrl],
  );
  useEffect(() => {
    retry();
    return () => stopAttempt(active);
  }, [retry]);
  return { state: current.fileId === fileId ? current.state : LOADING, retry };
}
