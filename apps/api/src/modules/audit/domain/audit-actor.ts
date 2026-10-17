import type { Actor } from '../../../shared/domain/actor';
import type { Role } from '../../../shared/domain/role.enum';

/** Rol del actor de sistema en `evento_auditoria.rol_actor` (011 plan §3). No es un `Role`: nadie inicia sesión con él. */
export const SYSTEM_ROLE = 'SYSTEM';

/** Rol guardado de un evento: el de una persona (`Role`) o el del sistema. */
export type AuditActorRole = Role | typeof SYSTEM_ROLE;

/**
 * Quien ejecuta una acción sin persona detrás: el comando de alta inicial (011 CA-7). Vive solo en `audit`: `withActor`
 * y `RolesGuard` nunca lo aceptan, y su evento no tiene `actor_id` ni afectado.
 */
export interface SystemActor {
  readonly role: typeof SYSTEM_ROLE;
}

export const SYSTEM_ACTOR: SystemActor = Object.freeze({ role: SYSTEM_ROLE });

/** Actor de un evento de auditoría: una persona autenticada o el sistema (011 plan §2). */
export type AuditActor = Actor | SystemActor;

export const isSystemActor = (actor: AuditActor): actor is SystemActor =>
  actor.role === SYSTEM_ROLE;
