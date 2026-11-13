'use client';

import type { ReactNode } from 'react';

import { useSpace } from '../../../../features/storage/components/space-provider';
import { SpaceSummaryView } from '../../../../features/storage/components/space-summary-view';
import { useClientSidebar } from '../../../../features/storage/components/use-client-sidebar';

/**
 * Espacio de almacenamiento (spec 007): cuánto usa el cliente, en qué se va y cuánto le queda. Lee el resumen compartido
 * del layout (`SpaceProvider`); «Reintentar» lo vuelve a pedir. Vive en `(cliente)`: los roles internos no llegan (CA-17).
 */
export default function EspacioPage(): ReactNode {
  const { state, refresh } = useSpace();
  const sidebar = useClientSidebar();
  return <SpaceSummaryView state={state} onRetry={refresh} sidebar={sidebar} />;
}
