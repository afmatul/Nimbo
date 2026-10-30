'use client';

import * as React from 'react';

import { useLatestCallbacks } from '../hooks/use-latest-callbacks';
import { readerFailure, type PreviewFailure } from '../preview-failure';
import type { ReaderEvents } from '../reader-events';
import { detectImageMime } from '../readers/image-mime';
import { fetchObjectBytes } from '../readers/object-bytes';
import { concatenateChunks, discardStream, releaseHeldReader } from '../readers/stream-bytes';

type ImagePreviewProps = ReaderEvents & {
  readonly url: string;
  readonly onFailure: (failure: PreviewFailure) => void;
};

type ImageResource = {
  readonly attempt: ImageAttempt;
  readonly objectUrl: string;
};

type ImageAttempt = {
  readonly controller: AbortController;
  readonly onFailure: ImagePreviewProps['onFailure'];
  readonly publish: (image: ImageResource | null) => void;
  readonly onReady: () => void;
  active: boolean;
  reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  objectUrl: string | undefined;
  cleanup?: Promise<void>;
};

function revokeImageUrl(attempt: ImageAttempt): void {
  const objectUrl = attempt.objectUrl;
  attempt.objectUrl = undefined;
  if (objectUrl === undefined) return;
  try {
    URL.revokeObjectURL(objectUrl);
  } catch {
    // Una falla de liberación no debe exponer datos ni duplicar la notificación.
  }
}

function disposeAttempt(attempt: ImageAttempt): Promise<void> {
  if (!attempt.active) return attempt.cleanup ?? Promise.resolve();
  attempt.active = false;
  attempt.controller.abort();
  revokeImageUrl(attempt);
  attempt.cleanup = releaseHeldReader(attempt, true);
  return attempt.cleanup;
}

function failAttempt(attempt: ImageAttempt, reason: 'corrupt' | 'unavailable'): void {
  if (!attempt.active) return;
  void disposeAttempt(attempt);
  attempt.publish(null);
  attempt.onFailure(readerFailure(reason));
}

async function readImageBody(
  attempt: ImageAttempt,
  body: ReadableStream<Uint8Array>,
): Promise<Uint8Array<ArrayBuffer> | undefined> {
  const reader = body.getReader();
  attempt.reader = reader;
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const chunk = await reader.read();
      if (!attempt.active) return undefined;
      if (chunk.done) return concatenateChunks(chunks);
      chunks.push(chunk.value);
    }
  } finally {
    chunks.length = 0;
    await releaseHeldReader(attempt, false);
  }
}

async function loadImage(url: string, attempt: ImageAttempt): Promise<void> {
  try {
    const { body } = await fetchObjectBytes({ url, signal: attempt.controller.signal });
    if (!attempt.active) {
      await discardStream(body);
      return;
    }
    const bytes = await readImageBody(attempt, body);
    if (!attempt.active || bytes === undefined) return;
    const mime = detectImageMime(bytes);
    if (mime === null) {
      failAttempt(attempt, 'corrupt');
      return;
    }
    const blob = new Blob([bytes], { type: mime });
    attempt.objectUrl = URL.createObjectURL(blob);
    attempt.publish({ attempt, objectUrl: attempt.objectUrl });
  } catch {
    failAttempt(attempt, 'unavailable');
  }
}

function useImageReading({
  url,
  onFailure,
  onReady,
  registerCleanup,
}: ImagePreviewProps): ImageResource | null {
  const [image, setImage] = React.useState<ImageResource | null>(null);
  const callbacks = useLatestCallbacks({ onFailure, onReady });
  React.useEffect(() => {
    const attempt: ImageAttempt = {
      controller: new AbortController(),
      onFailure: (failure) => callbacks.current.onFailure(failure),
      onReady: () => callbacks.current.onReady?.(),
      publish: setImage,
      active: true,
      reader: undefined,
      objectUrl: undefined,
    };
    const unregister = registerCleanup?.(() => disposeAttempt(attempt));
    void loadImage(url, attempt);
    return () => {
      unregister?.();
      void disposeAttempt(attempt);
    };
  }, [url, registerCleanup, callbacks]);
  return image;
}

function ImageReading(props: ImagePreviewProps): React.JSX.Element | null {
  const image = useImageReading(props);
  if (image === null || !image.attempt.active) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- Preview usa blob: local y decoder nativo.
    <img
      key={image.objectUrl}
      src={image.objectUrl}
      alt="Vista previa de imagen"
      className="mx-auto block h-auto max-w-full"
      onLoad={() => {
        if (image.attempt.active) image.attempt.onReady();
      }}
      onError={() => failAttempt(image.attempt, 'corrupt')}
    />
  );
}

export function ImagePreview(props: ImagePreviewProps): React.JSX.Element {
  return <ImageReading key={props.url} {...props} />;
}
