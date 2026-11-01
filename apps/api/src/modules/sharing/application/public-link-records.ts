import type { Actor } from '../../../shared';
import { AuditAction } from '../../audit';
import type { AuditRecord } from '../../audit';
import type { PublicLink, PublicLinkExpiryDays } from '../domain/public-link';

import type { SharingLogger } from './sharing-logger';

/** Por qué un enlace deja de servir antes de vencer (CA-8, CA-4). */
export type PublicLinkRevokeReason = 'revoked' | 'replaced';

/** CA-1, CA-15: en la actividad del propietario, el archivo, el vencimiento y si pide contraseña; nunca token ni clave. */
export const linkCreatedEvent = (
  actor: Actor,
  link: PublicLink,
  expiresInDays: PublicLinkExpiryDays,
): AuditRecord => {
  const { ownerId, fileId } = link.toSnapshot();
  return {
    action: AuditAction.PUBLIC_LINK_CREATED,
    actor,
    targetUserId: ownerId,
    resourceId: fileId,
    attributes: { expiresInDays, protection: link.requiresPassword ? 'password' : 'none' },
  };
};

/** CA-4, CA-8, CA-15: el enlace que dejó de servir y por qué. */
export const linkRevokedEvent = (
  actor: Actor,
  link: PublicLink,
  reason: PublicLinkRevokeReason,
): AuditRecord => {
  const { ownerId, fileId } = link.toSnapshot();
  return {
    action: AuditAction.PUBLIC_LINK_REVOKED,
    actor,
    targetUserId: ownerId,
    resourceId: fileId,
    attributes: { reason },
  };
};

/** Eventos de la bitácora técnica de los enlaces (plan §5). */
export type PublicLinkLogEvent = 'public_link.created' | 'public_link.revoked';

/** Lo único que la bitácora lleva de un enlace (plan §5, CA-15): ids, nunca token, contraseña, IP ni nombre. */
export const logLink = (
  logger: SharingLogger,
  event: PublicLinkLogEvent,
  link: PublicLink,
): void => {
  const { id, fileId } = link.toSnapshot();
  logger.info({ event, linkId: id, fileId });
};
