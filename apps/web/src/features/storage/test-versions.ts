import type { FileVersionSummary } from '@nimbo/contracts';
import { within } from '@testing-library/react';

import { sessionFixture } from '../identity/session/test-session';

/** Propietario de las versiones de prueba: el usuario de `sessionFixture`, así su autoría dice «Tú». */
export const VERSION_OWNER_ID = sessionFixture().user.id;

/** Versión de prueba (014): una carga del propietario, sin cambio de tamaño; el id sale del número. */
export function versionFixture(
  overrides: Partial<FileVersionSummary> & { readonly number: number },
): FileVersionSummary {
  return {
    id: `1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c${String(overrides.number).padStart(2, '0')}`,
    origin: 'carga',
    sizeBytes: 2_500_000,
    deltaBytes: null,
    restoredFromNumber: null,
    createdAt: '2026-10-08T16:42:00.000Z',
    createdById: VERSION_OWNER_ID,
    isCurrent: false,
    ...overrides,
  };
}

/** El aviso de poda del diálogo de restaurar (un `role="status"`; el diálogo tiene otro para «Restaurando…»). */
export function pruneWarning(dialog: HTMLElement): HTMLElement {
  const found = within(dialog)
    .getAllByRole('status')
    .find((element) => element.textContent?.startsWith('Se eliminará'));
  if (!found) throw new Error('Sin aviso de poda');
  return found;
}
