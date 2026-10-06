'use client';

import type { ReactNode } from 'react';

import { useSpace } from '../../../../features/storage/components/space-provider';
import { SpaceSummaryView } from '../../../../features/storage/components/space-summary-view';

/**
 * Espacio de almacenamiento (spec 007): cuánto usa el cliente, en qué se va y cuánto le queda. Lee el resumen compartido
 * del layout (`SpaceProvider`); «Reintentar» lo vuelve a pedir. Vive en `(cliente)`: los roles internos no llegan (CA-17).
 */
export default function EspacioPage(): ReactNode {
  const { state, refresh } = useSpace();
  return <SpaceSummaryView state={state} onRetry={refresh} />;
}
