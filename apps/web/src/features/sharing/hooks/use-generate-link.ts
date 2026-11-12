'use client';

import * as React from 'react';

import type { LinkSectionActions } from './use-link-section-state';
import type { PublicLinkChoice, PublicLinkState } from './use-public-link';

/** Lo que generar cambia en la sección. */
export type GenerateLinkActions = Pick<LinkSectionActions, 'startWork' | 'endWork' | 'generated'>;

/**
 * Genera o reemplaza el enlace con lo elegido (013c CA-3, CA-8) e informa la acción en curso para que el diálogo no se
 * cierre (CA-11). Devuelve siempre la misma función mientras no cambien `create` ni las acciones.
 */
export function useGenerateLink(
  create: PublicLinkState['create'],
  actions: GenerateLinkActions,
): (choice: PublicLinkChoice) => Promise<void> {
  return React.useCallback(
    async (choice: PublicLinkChoice): Promise<void> => {
      actions.startWork();
      try {
        await create(choice);
        actions.generated();
      } finally {
        actions.endWork();
      }
    },
    [create, actions],
  );
}
