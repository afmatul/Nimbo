'use client';

import type { ReactNode } from 'react';

import {
  SpaceSummaryView,
  type SpaceSummaryState,
} from '../../../../features/storage/components/space-summary-view';
import { SPACE_SUMMARY_FIXTURE } from '../../../../features/storage/space-fixtures';

/** Datos de ejemplo hasta T-10 (spec 007): siempre listos, así que «Reintentar» no tiene nada que volver a pedir. */
const EXAMPLE_STATE: SpaceSummaryState = { status: 'ready', summary: SPACE_SUMMARY_FIXTURE };

function retryExample(): void {
  // Con datos de ejemplo no hay petición que repetir; T-10 conecta `useSpace().reload`.
}

/**
 * Espacio de almacenamiento (spec 007): cuánto usa el cliente, en qué se va y cuánto le queda. Vive en `(cliente)`: los
 * roles internos no llegan (CA-17).
 */
export default function EspacioPage(): ReactNode {
  return <SpaceSummaryView state={EXAMPLE_STATE} onRetry={retryExample} />;
}
