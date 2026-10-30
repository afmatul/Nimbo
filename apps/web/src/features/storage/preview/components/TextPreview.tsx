'use client';

import * as React from 'react';

import { readerFailure, type PreviewFailure } from '../preview-failure';
import type { ReaderEvents } from '../reader-events';
import { fetchObjectBytes } from '../readers/object-bytes';
import { discardStream, releaseStreamReader } from '../readers/stream-bytes';

type TextPreviewProps = ReaderEvents & {
  readonly url: string;
  readonly onFailure: (failure: PreviewFailure) => void;
};

/** Un texto grande llega en cientos de chunks: se pinta a lo sumo cada 100 ms en vez de reconstruir el `<pre>` por chunk. */
const PUBLISH_INTERVAL_MS = 100;

type TextAttempt = {
  readonly controller: AbortController;
  readonly onFailure: TextPreviewProps['onFailure'];
  readonly publish: (text: string) => void;
  readonly onReady: () => void;
  active: boolean;
  flush: ReturnType<typeof setTimeout> | undefined;
  pending: string;
  published: string;
  reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  cleanup?: Promise<void>;
};

async function releaseReader(attempt: TextAttempt, cancel: boolean): Promise<void> {
  const reader = attempt.reader;
  attempt.reader = undefined;
  if (reader !== undefined) await releaseStreamReader(reader, cancel);
}

function disposeAttempt(attempt: TextAttempt): Promise<void> {
  if (!attempt.active) return attempt.cleanup ?? Promise.resolve();
  attempt.active = false;
  clearTimeout(attempt.flush);
  attempt.controller.abort();
  attempt.cleanup = releaseReader(attempt, true);
  return attempt.cleanup;
}

function failAttempt(attempt: TextAttempt, reason: 'corrupt' | 'unavailable'): void {
  if (!attempt.active) return;
  void disposeAttempt(attempt);
  attempt.publish('');
  attempt.onFailure(readerFailure(reason));
}

function decodeFragment(
  attempt: TextAttempt,
  decoder: TextDecoder,
  chunk: ReadableStreamReadResult<Uint8Array>,
): string | undefined {
  try {
    return chunk.done ? decoder.decode() : decoder.decode(chunk.value, { stream: true });
  } catch {
    failAttempt(attempt, 'corrupt');
    return undefined;
  }
}

/** Primer fragmento al instante; los siguientes se agrupan y el último se publica siempre al terminar. */
function publishText(attempt: TextAttempt, text: string, done: boolean): void {
  attempt.pending = text;
  if (done || attempt.published === '') {
    clearTimeout(attempt.flush);
    attempt.flush = undefined;
    attempt.published = text;
    attempt.publish(text);
    return;
  }
  if (attempt.flush !== undefined) return;
  attempt.flush = setTimeout(() => {
    attempt.flush = undefined;
    if (!attempt.active) return;
    attempt.published = attempt.pending;
    attempt.publish(attempt.pending);
  }, PUBLISH_INTERVAL_MS);
}

async function readTextBody(attempt: TextAttempt, body: ReadableStream<Uint8Array>): Promise<void> {
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const reader = body.getReader();
  attempt.reader = reader;
  let text = '';
  try {
    for (;;) {
      const chunk = await reader.read();
      if (!attempt.active) return;
      const fragment = decodeFragment(attempt, decoder, chunk);
      if (fragment === undefined) return;
      text += fragment;
      if (chunk.done) {
        if (text.length > 0) publishText(attempt, text, true);
        return;
      }
      if (fragment.length > 0) publishText(attempt, text, false);
    }
  } catch {
    failAttempt(attempt, 'unavailable');
  } finally {
    await releaseReader(attempt, false);
  }
}

async function loadText(url: string, attempt: TextAttempt): Promise<void> {
  try {
    const { body } = await fetchObjectBytes({ url, signal: attempt.controller.signal });
    if (!attempt.active) {
      await discardStream(body);
      return;
    }
    await readTextBody(attempt, body);
    if (attempt.active) attempt.onReady();
  } catch {
    failAttempt(attempt, 'unavailable');
  }
}

function useTextReading({ url, onFailure, onReady, registerCleanup }: TextPreviewProps): string {
  const [text, setText] = React.useState('');
  const callbacks = React.useRef({ onFailure, onReady });
  React.useEffect(() => {
    callbacks.current = { onFailure, onReady };
  }, [onFailure, onReady]);
  React.useEffect(() => {
    const attempt: TextAttempt = {
      controller: new AbortController(),
      onFailure: (failure) => callbacks.current.onFailure(failure),
      onReady: () => callbacks.current.onReady?.(),
      publish: setText,
      active: true,
      pending: '',
      flush: undefined,
      published: '',
      reader: undefined,
    };
    const unregister = registerCleanup?.(() => disposeAttempt(attempt));
    void loadText(url, attempt);
    return () => {
      unregister?.();
      void disposeAttempt(attempt);
    };
  }, [url, registerCleanup]);
  return text;
}

function TextReading(props: TextPreviewProps): React.JSX.Element {
  const text = useTextReading(props);
  return <pre className="whitespace-pre-wrap break-words font-sans text-foreground">{text}</pre>;
}

export function TextPreview(props: TextPreviewProps): React.JSX.Element {
  return <TextReading key={props.url} {...props} />;
}
