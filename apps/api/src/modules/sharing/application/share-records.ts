import type { Actor } from '../../../shared';
import type { AuditAction, AuditRecord } from '../../audit';
import type { UserShareSnapshot } from '../domain/user-share';

import type { SharingLogger } from './sharing-logger';

/** CA-19: en la actividad del propietario, el nodo con su tipo y el nivel; nunca correo ni nombre. */
export const shareEvent = (
  action: AuditAction,
  actor: Actor,
  share: UserShareSnapshot,
): AuditRecord => ({
  action,
  actor,
  targetUserId: share.ownerId,
  resourceId: share.node.id,
  attributes: { nodeType: share.node.type, level: share.level },
});

/** Bitácora de un acceso que deja de existir (revocar o Salir, CA-10, CA-23). */
export const REVOKED_LOG_EVENT = 'sharing.revoked';

/** Lo único que la bitácora lleva de un acceso (plan §5): ids y nivel, nunca correo ni nombre. */
export interface ShareLogEntry {
  readonly shareId: string;
  readonly nodeId: string;
  readonly level: string;
}

export const logShare = (logger: SharingLogger, event: string, entry: ShareLogEntry): void => {
  logger.info({ event, ...entry });
};

/** La entrada de bitácora de un acceso ya guardado o borrado. */
export const logEntryOf = (share: UserShareSnapshot): ShareLogEntry => ({
  shareId: share.id,
  nodeId: share.node.id,
  level: share.level,
});
