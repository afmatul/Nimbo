import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import {
  REFRESH_ROTATION_GRACE_SECONDS,
  SESSION_IDLE_TIMEOUT_DAYS,
  SESSION_MAX_LIFETIME_DAYS,
} from '@nimbo/contracts';
import { PinoLogger } from 'nestjs-pino';

import { I_CLOCK, I_TRANSACTION_RUNNER } from '../../../shared';
import type { DomainError, IClock, ITransactionRunner, Role } from '../../../shared';
import { I_MAILER } from '../../notifications';
import type { IMailer, MailMessage } from '../../notifications';
import { Device } from '../domain/device.entity';
import { RefreshInvalidError, SessionExpiredError, SessionRevokedError } from '../domain/errors';
import { OpaqueToken } from '../domain/opaque-token.vo';
import { RefreshToken } from '../domain/refresh-token.vo';
import type { ParsedRefreshToken } from '../domain/refresh-token.vo';
import { Session } from '../domain/session.entity';
import { UserAgentSummary } from '../domain/user-agent-summary.vo';
import type { User } from '../domain/user.entity';

import type { ClientContext } from './client-context';
import { IDENTITY_CONFIG } from './identity-config';
import type { IdentityConfig } from './identity-config';
import type { IdentityLogger } from './identity-logger';
import { newDeviceMail } from './mail/new-device-mail.template';
import { I_DEVICE_REPOSITORY } from './ports/i-device-repository.port';
import type { IDeviceRepository } from './ports/i-device-repository.port';
import { I_SESSION_REPOSITORY } from './ports/i-session-repository.port';
import type { ISessionRepository } from './ports/i-session-repository.port';
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
}

/** Motivo de un rechazo de renovación (plan §7, `identity.session.refresh_rejected`). */
type RefreshRejection = 'unknown' | 'grace' | 'expired' | 'revoked' | 'suspended';

/** Lo que decide la transacción de renovación; el token, el correo y el error van después del commit. */
type RefreshDecision = {
  readonly kind: 'rejected';
  readonly reason: RefreshRejection;
  readonly sessionId?: string;
};

/** `grace` no revoca ni borra la cookie: en una carrera entre pestañas la del navegador ya es la nueva (CA-9). */
const REFRESH_REJECTION_ERRORS: Readonly<
  Record<RefreshRejection | 'malformed', () => DomainError>
> = {
  malformed: () => new RefreshInvalidError(),
  unknown: () => new RefreshInvalidError(),
  grace: () => new RefreshInvalidError(),
  expired: () => new SessionExpiredError(),
  revoked: () => new SessionRevokedError(),
  suspended: () => new SessionRevokedError(),
};

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

  private async refreshInTransaction(
    parsed: ParsedRefreshToken,
    now: Date,
  ): Promise<RefreshDecision> {
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
    throw new Error(`Renovación con el secreto ${match}: pendiente de T-32.`);
  }

  /** Después del commit: bitácora y token nuevo, o el error público del rechazo. */
  private completeRefresh(
    decision: RefreshDecision,
    _client: ClientContext,
    _now: Date,
  ): Promise<IssuedSession> {
    this.logRejection(decision.reason, decision.sessionId);
    throw REFRESH_REJECTION_ERRORS[decision.reason]();
  }

  private logRejection(reason: RefreshRejection | 'malformed', sessionId?: string): void {
    this.logger.info({
      event: 'identity.session.refresh_rejected',
      reason,
      ...(sessionId === undefined ? {} : { sessionId }),
    });
  }

  private wellFormedDeviceSecret(value: string | undefined): string | undefined {
    return value !== undefined && OpaqueToken.isWellFormed(value) ? value : undefined;
  }

  private async openInTransaction(
    user: User,
    client: ClientContext,
    deviceSecretHash: string,
    now: Date,
  ): Promise<OpenDecision> {
    const { deviceId, isNew } = await this.devices.upsertSeen(
      Device.register({
        id: randomUUID(),
        userId: user.id,
        secretHash: deviceSecretHash,
        userAgent: client.userAgent,
        ip: client.ip,
        now,
      }),
    );
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
    return { session, refreshToken: refresh.value, deviceId, isNew };
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
