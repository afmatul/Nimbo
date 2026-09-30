import type { Session } from '../../domain/session.entity';

/** Sesión activa junto con el agente de usuario de su dispositivo. El hash y la IP no salen de aquí. */
export interface ActiveSessionRecord {
  readonly session: Session;
  readonly agenteUsuario: string;
}

export interface ISessionRepository {
  insert(session: Session): Promise<void>;
  findByIdForUpdate(id: string): Promise<Session | null>;
  update(session: Session): Promise<void>;
  listActive(
    userId: string,
    now: Date,
    idleCutoff: Date,
    limit: number,
  ): Promise<readonly ActiveSessionRecord[]>;
  revokeIfActive(id: string, userId: string, now: Date): Promise<boolean>;
  revokeAllExcept(userId: string, exceptId: string | null, now: Date): Promise<number>;
}

export const I_SESSION_REPOSITORY: unique symbol = Symbol('ISessionRepository');
