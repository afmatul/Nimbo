'use client';

import type { FileSummary } from '@nimbo/contracts';
import * as React from 'react';

/** Cómo dibujar la miniatura de un archivo; la da quien compone (017), así `storage` no depende de `preview`. */
export type ThumbnailRenderer = (file: FileSummary) => React.ReactNode;

const ThumbnailContext = React.createContext<ThumbnailRenderer | null>(null);

export const ThumbnailProvider = ThumbnailContext.Provider;

/** El renderizador de miniaturas, o `null` si nadie lo dio (las tarjetas conservan su ícono). */
export function useThumbnailRenderer(): ThumbnailRenderer | null {
  return React.useContext(ThumbnailContext);
}
