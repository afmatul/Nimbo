import { InsufficientRoleError } from '../../../../shared/domain/errors';

/**
 * El actor interno ya no está `activa` aunque su token siga vigente (011 RN-7, CA-14; 002 D-10). Responde igual que un
 * rol sin permiso (`403 SHARED_FORBIDDEN`, mismo mensaje): la clase propia solo distingue el motivo en la bitácora.
 */
export class ActorNotActiveError extends InsufficientRoleError {}
