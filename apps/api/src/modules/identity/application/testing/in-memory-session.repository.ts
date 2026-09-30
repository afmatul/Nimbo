import type { Session } from '../../domain/session.entity';
import type { ActiveSessionRecord, ISessionRepository } from '../ports/i-session-repository.port';

/** Doble en memoria de `ISessionRepository` para las pruebas de aplicación (misma semántica que plan §6.3). */
export class InMemorySessionRepository implements ISessionRepository {
  private readonly sessions = new Map<string, Session>();
  /** Agente de usuario del dispositivo de cada sesión, como el `JOIN dispositivo` del adaptador. */
  private readonly userAgents = new Map<string, string>();
  findCalls = 0;

  all(): readonly Session[] {
    return [...this.sessions.values()];
  }

  get(id: string): Session | undefined {
    return this.sessions.get(id);
  }

  /** Deja una sesión ya persistida antes del caso de uso. */
  seed(session: Session, userAgent = ''): void {
    this.sessions.set(session.id, session);
    this.userAgents.set(session.id, userAgent);
  }

  insert(session: Session): Promise<void> {
    this.sessions.set(session.id, session);
    return Promise.resolve();
  }

  findByIdForUpdate(id: string): Promise<Session | null> {
    this.findCalls += 1;
    return Promise.resolve(this.sessions.get(id) ?? null);
  }

  update(session: Session): Promise<void> {
    this.sessions.set(session.id, session);
    return Promise.resolve();
  }

  listActive(
    userId: string,
    now: Date,
    idleCutoff: Date,
    limit: number,
  ): Promise<readonly ActiveSessionRecord[]> {
    const active = this.all().filter(
      (session) =>
        session.userId === userId &&
        session.revocadaEn === null &&
        session.expiraEn.getTime() > now.getTime() &&
        session.ultimoUso.getTime() > idleCutoff.getTime(),
    );
    return Promise.resolve(
      active
        .slice(0, limit)
        .map((session) => ({ session, agenteUsuario: this.userAgents.get(session.id) ?? '' })),
    );
  }

  revokeIfActive(id: string, userId: string, now: Date): Promise<boolean> {
    const session = this.sessions.get(id);
    if (session === undefined || session.userId !== userId || session.revocadaEn !== null) {
      return Promise.resolve(false);
    }
    this.sessions.set(id, session.revoke(now));
    return Promise.resolve(true);
  }

  revokeAllExcept(userId: string, exceptId: string | null, now: Date): Promise<number> {
    const targets = this.all().filter(
      (session) =>
        session.userId === userId && session.id !== exceptId && session.revocadaEn === null,
    );
    targets.forEach((session) => this.sessions.set(session.id, session.revoke(now)));
    return Promise.resolve(targets.length);
  }
}
