'use client';

import * as React from 'react';

import type { PreviewFailure } from '../preview-failure';

type ReaderCallbacks = {
  readonly onFailure: (failure: PreviewFailure) => void;
  readonly onReady: (() => void) | undefined;
};

/** Los lectores viven más que un render: leen siempre la última versión de los callbacks del shell, sin reiniciar la lectura. */
export function useLatestCallbacks({
  onFailure,
  onReady,
}: ReaderCallbacks): React.RefObject<ReaderCallbacks> {
  const callbacks = React.useRef<ReaderCallbacks>({ onFailure, onReady });
  React.useEffect(() => {
    callbacks.current = { onFailure, onReady };
  }, [onFailure, onReady]);
  return callbacks;
}
