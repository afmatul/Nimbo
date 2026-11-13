'use client';

import type { FileSummary } from '@nimbo/contracts';
import * as React from 'react';

/** Cómo dibujar la insignia de estado de un archivo en su tarjeta; la da quien compone, así `storage` no la conoce. */
export type FileBadgeRenderer = (file: FileSummary) => React.ReactNode;

const FileBadgeContext = React.createContext<FileBadgeRenderer | null>(null);

export const FileBadgeProvider = FileBadgeContext.Provider;

/** El renderizador de insignias, o `null` si nadie lo dio (la tarjeta no muestra insignia). */
export function useFileBadgeRenderer(): FileBadgeRenderer | null {
  return React.useContext(FileBadgeContext);
}
