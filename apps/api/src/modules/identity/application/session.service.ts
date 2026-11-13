import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import {
  REFRESH_ROTATION_GRACE_SECONDS,
  SESSION_IDLE_TIMEOUT_DAYS,
  SESSION_LIST_MAX_ITEMS,
  SESSION_MAX_LIFETIME_DAYS,
} from '@nimbo/contracts';
import type { SessionSummary } from '@nimbo/contracts';
import { PinoLogger } from 'nestjs-pino';

import { I_CLOCK, I_TRANSACTION_RUNNER } from '../../../shared';
import type { Actor, DomainError, IClock, ITransactionRunner, Role } from '../../../shared';
import { I_MAILER } from '../../notifications';
import type { IMailer, MailMessage } from '../../notifications';
import { AccountStatus } from '../domain/account-status.enum';
import { Device } from '../domain/device.entity';
import {
  RefreshInvalidError,
  SessionExpiredError,
  SessionNotFoundError,
  SessionRevokedError,
} from '../domain/errors';
import { OpaqueToken } from '../domain/opaque-token.vo';
import { RefreshToken } from '../domain/refresh-token.vo';
import { Session } from '../domain/session.entity';
import { UserAgentSummary } from '../domain/user-agent-summary.vo';
import type { User } from '../domain/user.entity';

import type { ClientContext } from './client-context';
import { IDENTITY_CONFIG } from './identity-config';
import type { IdentityConfig } from './identity-config';
import type { IdentityLogger } from './identity-logger';
import { newDeviceMail } from './mail/new-device-mail.template';
import { sessionRevokedMail } from './mail/session-revoked-mail.template';
import { I_DEVICE_REPOSITORY } from './ports/i-device-repository.port';
import type { IDeviceRepository } from './ports/i-device-repository.port';
import { I_SESSION_REPOSITORY } from './ports/i-session-repository.port';
import type { ActiveSessionRecord, ISessionRepository } from './ports/i-session-repository.port';
import { I_TOKEN_SERVICE } from './ports/i-token-service.port';
import type { IssuedAccessToken, ITokenService } from './ports/i-token-service.port';
import { I_USER_REPOSITORY } from './ports/i-user-repository.port';
import type { IUserRepository } from './ports/i-user-repository.port';
import { WEB_PATHS, webUrl } from './web-links';

const MS_PER_DAY = 86_400_000;
const MAX_LIFETIME_MS = SESSION_MAX_LIFETIME_DAYS * MS_PER_DAY;
const IDLE_TIMEOUT_MS = SESSION_IDLE_TIMEOUT_DAYS * MS_PER_DAY;
const GRACE_MS = REFRESH_ROTATION_GRACE_SECONDS * 1000;
const NEW_DEVICE_TAG = 'identity.new-device';
const SESSION_REVOKED_TAG = 'identity.session-revoked';

/** Quién abre la sesión: el inicio de sesión avisa de un dispositivo nuevo; la verificación no (D-4). */
export type SessionOrigin = 'login' | 'verification';

/** El usuario de `SessionResponse` (DT-11): el correo va en el cuerpo para su dueño, nunca en el token. */
export interface SessionUser {
  readonly id: string;
  readonly fullName: string;
  readonly email: string;
  readonly role: Role;
}

/** Credenciales de una sesión vigente; el controlador escribe las cookies. */
export interface IssuedSession {
  readonly sessionId: string;
  readonly access: IssuedAccessToken;
  /** Valor de la cookie `nimbo_rt`. */
  readonly refreshToken: string;
  /** Vida de la cookie de refresco en milisegundos (como `maxAge` de Express), nunca más que la sesión (RN-5). */
  readonly refreshMaxAge: number;
  readonly user: SessionUser;
}

export interface OpenedSession extends IssuedSession {
  /** El dispositivo no estaba registrado en la cuenta (para la bitácora de `AuthService`). */
  readonly newDevice: boolean;
  /** Valor nuevo de la cookie `nimbo_did`, solo si el navegador no traía una válida. */
  readonly deviceCookie?: string;
}

interface OpenDecision {
  readonly session: Session;
  readonly refreshToken: string;
  readonly deviceId: string;
  readonly isNew: boolean;
  /** Sesiones previas del mismo navegador que la nueva reemplazó. */
  readonly replacedCount: number;
}

/** Rechazos de renovación sin escritura; `suspended` revoca y tiene su propia decisión. */
type RefreshRejection = 'unknown' | 'grace' | 'expired' | 'revoked';

/** Motivo de `identity.session.refresh_rejected` (plan §7). */
type RefreshRejectionReason = RefreshRejection | 'malformed' | 'suspended';

/** Lo que decide la transacción de renovación; el token, el correo y el error van después del commit. */
type RefreshDecision =
  | {
      readonly kind: 'rotated';
      readonly user: User;
      readonly session: Session;
      readonly refreshToken: string;
    }
  | { readonly kind: 'reuse'; readonly user: User | null; readonly session: Session }
  | { readonly kind: 'suspended'; readonly session: Session }
  | { readonly kind: 'rejected'; readonly reason: RefreshRejection; readonly sessionId?: string };

/** `grace` no revoca ni borra la cookie: en una carrera entre pestañas la del navegador ya es la nueva (CA-9). */
const REFRESH_REJECTION_ERRORS: Readonly<
  Record<RefreshRejection | 'malformed', () => DomainError>
> = {
  malformed: () => new RefreshInvalidError(),
  unknown: () => new RefreshInvalidError(),
  grace: () => new RefreshInvalidError(),
  expired: () => new SessionExpiredError(),
  revoked: () => new SessionRevokedError(),
};

/** Campos de `identity.session.revoked` (plan §7). */
interface Revocation {
  readonly reason: 'logout' | 'user' | 'others' | 'reuse' | 'suspended' | 'replaced';
  readonly count: number;
  readonly sessionId?: string;
}

/** CA-11: solo el resumen del agente y las fechas; sin IP, agente completo, hashes ni dispositivo. */
const toSessionSummary = (
  record: ActiveSessionRecord,
  currentSessionId: string,
): SessionSummary => {
  const { session } = record;
  const { browser, os, deviceKind } = UserAgentSummary.parse(record.agenteUsuario);
  return {
    id: session.id,
    browser,
    os,
    deviceKind,
    startedAt: session.creadaEn.toISOString(),
    lastActiveAt: session.ultimoUso.toISOString(),
    current: session.id === currentSessionId,
  };
};

/** D-9: la actual primero y después por última actividad descendente. */
const currentFirstThenRecent =
  (currentSessionId: string) =>
  (a: ActiveSessionRecord, b: ActiveSessionRecord): number =>
    Number(b.session.id === currentSessionId) - Number(a.session.id === currentSessionId) ||
    b.session.ultimoUso.getTime() - a.session.ultimoUso.getTime();

const sessionUser = (user: User): SessionUser => ({
  id: user.id,
  fullName: user.fullName,
  email: user.email.value,
  role: user.role,
});

/**
 * Sesiones de refresco y dispositivos (plan 002 §6.3, design-model M1). Los correos, las bitácoras y el token de
 * acceso salen después del commit; donde un rechazo también escribe, la transacción devuelve un resultado y el error
 * se lanza después de confirmar.
 */
@Injectable()
export class SessionService {
  constructor(
    @Inject(I_SESSION_REPOSITORY) private readonly sessions: ISessionRepository,
    @Inject(I_DEVICE_REPOSITORY) private readonly devices: IDeviceRepository,
    @Inject(I_USER_REPOSITORY) private readonly users: IUserRepository,
    @Inject(I_TOKEN_SERVICE) private readonly tokens: ITokenService,
    @Inject(I_MAILER) private readonly mailer: IMailer,
    @Inject(I_TRANSACTION_RUNNER) private readonly transactions: ITransactionRunner,
    @Inject(I_CLOCK) private readonly clock: IClock,
    @Inject(IDENTITY_CONFIG) private readonly config: IdentityConfig,
    @Inject(PinoLogger) private readonly logger: IdentityLogger,
  ) {}

  /** CA-1, CA-15 a CA-17: sesión nueva ligada al dispositivo; aviso solo si el inicio de sesión es desde uno nuevo. */
  async open(user: User, client: ClientContext, origin: SessionOrigin): Promise<OpenedSession> {
    const deviceSecret = this.wellFormedDeviceSecret(client.deviceSecret);
    const secret = deviceSecret ?? OpaqueToken.generate().toString();
    const now = this.clock.now();
    const decision = await this.transactions.run(() =>
      this.openInTransaction(user, client, OpaqueToken.hashOf(secret), now),
    );
    const issued = await this.issue(user, decision.session, decision.refreshToken, now);
    if (decision.replacedCount > 0) {
      this.logRevoked(user.id, { reason: 'replaced', count: decision.replacedCount });
    }
    if (origin === 'login' && decision.isNew) {
      await this.notifyNewDevice(user, decision, client);
    }
    return {
      ...issued,
      newDevice: decision.isNew,
      ...(deviceSecret === undefined ? { deviceCookie: secret } : {}),
    };
  }

  /**
   * CA-7 a CA-10: rota el token de refresco. `findByIdForUpdate` serializa dos renovaciones simultáneas; los rechazos
   * que escriben (reúso, cuenta suspendida) se confirman antes de lanzar.
   */
  async refresh(rawToken: string, client: ClientContext): Promise<IssuedSession> {
    const parsed = RefreshToken.parse(rawToken);
    if (parsed === null) {
      this.logRejection('malformed');
      throw new RefreshInvalidError();
    }
    const now = this.clock.now();
    const decision = await this.transactions.run(() => this.refreshInTransaction(parsed, now));
    return this.completeRefresh(decision, client, now);
  }

  /**
   * CA-14: revoca la sesión si el token es el vigente o el anterior dentro de la gracia. En cualquier otro caso no
   * hace nada ni avisa: la respuesta siempre es `204`.
   */
  async logout(rawToken: string): Promise<void> {
    const parsed = RefreshToken.parse(rawToken);
    if (parsed === null) {
      return;
    }
    const now = this.clock.now();
    const revoked = await this.transactions.run(() => this.logoutInTransaction(parsed, now));
    if (revoked !== null) {
      this.logRevoked(revoked.userId, { sessionId: revoked.id, reason: 'logout', count: 1 });
    }
  }

  /** CA-11: sesiones activas del actor, como máximo `SESSION_LIST_MAX_ITEMS` (DT-13). */
  async list(actor: Actor, currentSessionId: string): Promise<readonly SessionSummary[]> {
    const now = this.clock.now();
    const idleCutoff = new Date(now.getTime() - IDLE_TIMEOUT_MS);
    const records = await this.sessions.listActive(
      actor.id,
      now,
      idleCutoff,
      SESSION_LIST_MAX_ITEMS,
    );
    return [...records]
      .sort(currentFirstThenRecent(currentSessionId))
      .map((record) => toSessionSummary(record, currentSessionId));
  }

  /**
   * CA-12, CA-14: el `UPDATE` filtra por dueño y por no revocada. Ajena, inexistente o ya revocada dan el mismo error
   * (003 D-6). `wasCurrent` le dice al controlador que borre la cookie de refresco.
   */
  async revoke(
    actor: Actor,
    sessionId: string,
    currentSessionId: string,
  ): Promise<{ readonly wasCurrent: boolean }> {
    const revoked = await this.sessions.revokeIfActive(sessionId, actor.id, this.clock.now());
    if (!revoked) {
      throw new SessionNotFoundError();
    }
    this.logRevoked(actor.id, { sessionId, reason: 'user', count: 1 });
    return { wasCurrent: sessionId === currentSessionId };
  }

  /** CA-13: cierra todas las demás sesiones del actor y conserva la actual. */
  async revokeOthers(actor: Actor, currentSessionId: string): Promise<number> {
    const revokedCount = await this.sessions.revokeAllExcept(
      actor.id,
      currentSessionId,
      this.clock.now(),
    );
    this.logRevoked(actor.id, { reason: 'others', count: revokedCount });
    return revokedCount;
  }

  private logRevoked(userId: string, revocation: Revocation): void {
    this.logger.info({ event: 'identity.session.revoked', userId, ...revocation });
  }

  private async logoutInTransaction(parsed: RefreshToken, now: Date): Promise<Session | null> {
    const session = await this.sessions.findByIdForUpdate(parsed.sessionId);
    if (session === null || session.revocadaEn !== null) {
      return null;
    }
    if (session.matchSecret(parsed.secretHash, now, GRACE_MS) === 'reuse') {
      return null;
    }
    return this.revokeLocked(session, now);
  }

  private async refreshInTransaction(parsed: RefreshToken, now: Date): Promise<RefreshDecision> {
    const session = await this.sessions.findByIdForUpdate(parsed.sessionId);
    if (session === null) {
      return { kind: 'rejected', reason: 'unknown' };
    }
    const state = session.stateAt(now, IDLE_TIMEOUT_MS);
    if (state !== 'active') {
      return { kind: 'rejected', reason: state, sessionId: session.id };
    }
    const match = session.matchSecret(parsed.secretHash, now, GRACE_MS);
    if (match === 'previousWithinGrace') {
      return { kind: 'rejected', reason: 'grace', sessionId: session.id };
    }
    const user = await this.users.findByIdForUpdate(session.userId);
    if (match === 'reuse') {
      // D-3: un token más viejo, el anterior fuera de la gracia o un secreto falsificado revocan la sesión.
      return { kind: 'reuse', user, session: await this.revokeLocked(session, now) };
    }
    return this.rotateOrRevoke(session, user, now);
  }

  /** CA-7, CA-10: la cuenta suspendida después de iniciar sesión pierde la sesión al renovar (D-10). */
  private async rotateOrRevoke(
    session: Session,
    user: User | null,
    now: Date,
  ): Promise<RefreshDecision> {
    if (user === null) {
      return { kind: 'rejected', reason: 'unknown', sessionId: session.id };
    }
    if (user.status === AccountStatus.SUSPENDED) {
      return { kind: 'suspended', session: await this.revokeLocked(session, now) };
    }
    const next = RefreshToken.issue(session.id);
    const rotated = session.rotate(next.secretHash, now);
    await this.sessions.update(rotated);
    return { kind: 'rotated', user, session: rotated, refreshToken: next.value };
  }

  /** Revoca una sesión ya leída con `findByIdForUpdate` dentro de la transacción en curso. */
  private async revokeLocked(session: Session, now: Date): Promise<Session> {
    const revoked = session.revoke(now);
    await this.sessions.update(revoked);
    return revoked;
  }

  /** Después del commit: bitácora y token nuevo, o el error público del rechazo. */
  private async completeRefresh(
    decision: RefreshDecision,
    client: ClientContext,
    now: Date,
  ): Promise<IssuedSession> {
    if (decision.kind === 'rotated') {
      const { user, session } = decision;
      this.logger.info({
        event: 'identity.session.refreshed',
        userId: user.id,
        sessionId: session.id,
      });
      return this.issue(user, session, decision.refreshToken, now);
    }
    if (decision.kind === 'reuse') {
      await this.notifyReuse(decision.session, decision.user, client);
      throw new SessionRevokedError();
    }
    if (decision.kind === 'suspended') {
      this.logSuspendedRevocation(decision.session);
      throw new SessionRevokedError();
    }
    this.logRejection(decision.reason, decision.sessionId);
    throw REFRESH_REJECTION_ERRORS[decision.reason]();
  }

  /**
   * CA-9: aviso al dueño. Nombra el navegador que presentó el token reusado: el puerto no expone el agente de usuario
   * del dispositivo de la sesión (ver informe de T-32).
   */
  private async notifyReuse(
    session: Session,
    user: User | null,
    client: ClientContext,
  ): Promise<void> {
    this.logger.warn({
      event: 'identity.session.reuse_detected',
      userId: session.userId,
      sessionId: session.id,
    });
    this.logRevoked(session.userId, { sessionId: session.id, reason: 'reuse', count: 1 });
    if (user === null) {
      return;
    }
    const { browser, os } = UserAgentSummary.parse(client.userAgent);
    await this.mailer.send(
      this.mailTo(
        user,
        `${SESSION_REVOKED_TAG}.${session.id}`,
        SESSION_REVOKED_TAG,
        sessionRevokedMail({
          revokedAt: session.revocadaEn ?? this.clock.now(),
          browser,
          os,
          securityUrl: webUrl(this.config, WEB_PATHS.security),
          passwordRecoveryUrl: webUrl(this.config, WEB_PATHS.passwordRecovery),
        }),
      ),
    );
  }

  /** CA-10: la renovación se rechaza y, además, la sesión quedó revocada. */
  private logSuspendedRevocation(session: Session): void {
    this.logRejection('suspended', session.id);
    this.logRevoked(session.userId, { sessionId: session.id, reason: 'suspended', count: 1 });
  }

  private logRejection(reason: RefreshRejectionReason, sessionId?: string): void {
    this.logger.info({
      event: 'identity.session.refresh_rejected',
      reason,
      ...(sessionId === undefined ? {} : { sessionId }),
    });
  }

  private wellFormedDeviceSecret(value: string | undefined): string | undefined {
    return value !== undefined && OpaqueToken.isWellFormed(value) ? value : undefined;
  }

  /**
   * Una sesión por navegador: el dispositivo es la cookie `nimbo_did` (D-4), así que volver a iniciar sesión desde el
   * mismo navegador revoca sus sesiones anteriores en vez de sumar otra fila a «Seguridad». Solo se tocan las del
   * mismo usuario y dispositivo; las de otros navegadores siguen igual, y revocar o «cerrar las demás» no cambian.
   */
  private async openInTransaction(
    user: User,
    client: ClientContext,
    deviceSecretHash: string,
    now: Date,
  ): Promise<OpenDecision> {
    const seen = { secretHash: deviceSecretHash, now };
    const { deviceId, isNew } = await this.registerDevice(user, client, seen);
    const replacedCount = isNew ? 0 : await this.sessions.revokeAllOnDevice(user.id, deviceId, now);
    const refresh = RefreshToken.issue(randomUUID());
    const session = Session.open({
      id: refresh.sessionId,
      userId: user.id,
      deviceId,
      secretHash: refresh.secretHash,
      now,
      maxLifetime: MAX_LIFETIME_MS,
    });
    await this.sessions.insert(session);
    return { session, refreshToken: refresh.value, deviceId, isNew, replacedCount };
  }

  private registerDevice(
    user: User,
    client: ClientContext,
    seen: { readonly secretHash: string; readonly now: Date },
  ): Promise<{ readonly deviceId: string; readonly isNew: boolean }> {
    return this.devices.upsertSeen(
      Device.register({
        id: randomUUID(),
        userId: user.id,
        secretHash: seen.secretHash,
        userAgent: client.userAgent,
        ip: client.ip,
        now: seen.now,
      }),
    );
  }

  /** Después del commit: el token de acceso no retiene la transacción. */
  private async issue(
    user: User,
    session: Session,
    refreshToken: string,
    now: Date,
  ): Promise<IssuedSession> {
    const access = await this.tokens.issueAccessToken({
      userId: user.id,
      role: user.role,
      sessionId: session.id,
    });
    return {
      sessionId: session.id,
      access,
      refreshToken,
      refreshMaxAge: session.refreshCookieMaxAge(now, IDLE_TIMEOUT_MS),
      user: sessionUser(user),
    };
  }

  private async notifyNewDevice(
    user: User,
    decision: OpenDecision,
    client: ClientContext,
  ): Promise<void> {
    this.logger.info({
      event: 'identity.device.new',
      userId: user.id,
      deviceId: decision.deviceId,
    });
    const { browser, os } = UserAgentSummary.parse(client.userAgent);
    await this.mailer.send(
      this.mailTo(
        user,
        `${NEW_DEVICE_TAG}.${decision.session.id}`,
        NEW_DEVICE_TAG,
        newDeviceMail({
          signedInAt: decision.session.creadaEn,
          browser,
          os,
          securityUrl: webUrl(this.config, WEB_PATHS.security),
        }),
      ),
    );
  }

  private mailTo(
    user: User,
    idempotencyKey: string,
    tag: string,
    content: Pick<MailMessage, 'subject' | 'text' | 'html'>,
  ): MailMessage {
    return { to: user.email.value, ...content, idempotencyKey, tag, recipientId: user.id };
  }
}
