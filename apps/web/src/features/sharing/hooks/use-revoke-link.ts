'use client';

import { usePendingConfirm, type PendingConfirm } from '../../storage/hooks/use-pending-confirm';
import { publicLinkMessageOf, type ShareMessage } from '../share-messages';

import type { LinkSectionActions } from './use-link-section-state';
import type { PublicLinkState } from './use-public-link';

/** Al terminar no hay más que cerrar: `revoked` ya cierra la confirmación y, si falla, sigue abierta. */
/** Lo que la revocación cambia en la sección. */
export type RevokeLinkActions = Pick<
  LinkSectionActions,
  'startWork' | 'endWork' | 'revoked' | 'linkGone'
>;

const ALREADY_CLOSED = (): void => undefined;

/**
 * Revoca el enlace `linkId` con su progreso y su error por `code` (013c CA-9, CA-13, CA-14). Solo lo usa la
 * confirmación, que existe mientras hay enlace. Si el enlace ya no existe, la sección muestra «Actualizar» (I-2); al
 * salir bien, el aviso y el foco en «Crear enlace público» (R-2).
 */
export function useRevokeLink(
  linkId: string,
  revoke: PublicLinkState['revoke'],
  actions: RevokeLinkActions,
): PendingConfirm<ShareMessage> {
  const run = async (): Promise<void> => {
    actions.startWork();
    try {
      await revoke(linkId);
      actions.revoked();
    } catch (error) {
      const message = publicLinkMessageOf(error);
      if (message.fix === 'reload') actions.linkGone(message);
      throw error;
    } finally {
      actions.endWork();
    }
  };
  return usePendingConfirm(run, ALREADY_CLOSED, publicLinkMessageOf);
}
