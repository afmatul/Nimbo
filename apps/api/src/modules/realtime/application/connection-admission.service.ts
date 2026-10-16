import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

import {
  createActor,
  I_ACCESS_TOKEN_VERIFIER,
  I_RATE_LIMITER,
  InsufficientRoleError,
  Role,
  UnauthenticatedError,
  type AccessTokenVerification,
  type Actor,
  type DomainError,
  type IAccessTokenVerifier,
  type IRateLimiter,
  type RateLimitDecision,
} from '../../../shared';
import { RealtimeTooManyRequestsError } from '../domain/errors';

import { errorClassOf } from './error-class';
import { REALTIME_CONFIG, type RealtimeConfig } from './realtime-config';

/** Ventana del límite de intentos de conexión: la variable de entorno los fija «por minuto» (CA-14). */
const CONNECT_ATTEMPT_WINDOW_SECONDS = 60;

/** Lo que llega del *handshake*: el origen del intento (clave del límite) y el token de `auth`, si vino. */
export interface ConnectionAttempt {
  readonly origin: string;
  readonly token: string | undefined;
}

/** Conexión admitida: quién es y cuándo vence su token (el canal se cierra a esa hora, CA-4). */
export interface AdmittedConnection {
  readonly actor: Actor;
  readonly expiresAt: Date;
}

/** Motivo de `realtime.rejected` decidido aquí (plan §5); `origin` lo registra el adaptador. */
export type AdmissionRejectionReason =
  | 'missing_token'
  | 'invalid_token'
  | 'expired_token'
  | 'forbidden_role'
  | 'rate_limited'
  | 'limiter_failed';

/** Lo mínimo que necesita del logger (se inyecta `PinoLogger`). Nunca token ni origen (RN-5, CA-13). */
export interface AdmissionLogger {
  warn(payload: Record<string, unknown>): void;
}

const EXPIRED_OR_INVALID: Record<'expired' | 'invalid', AdmissionRejectionReason> = {
  expired: 'expired_token',
  invalid: 'invalid_token',
};

/**
 * Decide si un intento abre el canal (CA-2, CA-3, CA-14): límite por origen → token → rol. Sin Socket.IO: el gateway
 * le pasa el intento y convierte el error en el rechazo del *handshake*. Registra cada rechazo con su motivo; el
 * `correlationId` lo pone el contexto en que la llama el gateway.
 */
@Injectable()
export class ConnectionAdmission {
  constructor(
    @Inject(I_ACCESS_TOKEN_VERIFIER) private readonly verifier: IAccessTokenVerifier,
    @Inject(I_RATE_LIMITER) private readonly rateLimiter: IRateLimiter,
    @Inject(REALTIME_CONFIG) private readonly config: RealtimeConfig,
    @Inject(PinoLogger) private readonly logger: AdmissionLogger,
  ) {}

  async admit(attempt: ConnectionAttempt): Promise<AdmittedConnection> {
    await this.enforceAttemptLimit(attempt.origin);
    const verification = await this.verify(attempt.token);
    return this.admitClient(verification);
  }

  /** Cuenta todo intento antes de leer el token (CA-14). Si el limitador falla, se rechaza sin detalle. */
  private async enforceAttemptLimit(origin: string): Promise<void> {
    const decision = await this.consumeAttempt(origin);
    if (!decision.allowed) {
      throw this.reject(
        'rate_limited',
        new RealtimeTooManyRequestsError(decision.retryAfterSeconds),
      );
    }
  }

  private async consumeAttempt(origin: string): Promise<RateLimitDecision> {
    try {
      return await this.rateLimiter.consume(`ws:connect:${origin}`, [
        {
          limit: this.config.connectAttemptsPerMinute,
          windowSeconds: CONNECT_ATTEMPT_WINDOW_SECONDS,
        },
      ]);
    } catch (error) {
      throw this.reject('limiter_failed', new UnauthenticatedError(), {
        errorClass: errorClassOf(error),
      });
    }
  }

  private async verify(token: string | undefined): Promise<AccessTokenVerification> {
    if (token === undefined || token === '') {
      throw this.reject('missing_token', new UnauthenticatedError());
    }
    return this.verifier.verify(token);
  }

  /** Solo el cliente se conecta: ningún rol interno llega a una sala (CA-3, Art. IX.1). */
  private admitClient(verification: AccessTokenVerification): AdmittedConnection {
    if (!verification.valid) {
      throw this.reject(EXPIRED_OR_INVALID[verification.reason], new UnauthenticatedError());
    }
    const { userId, role } = verification.claims;
    if (role !== Role.CLIENT) {
      throw this.reject('forbidden_role', new InsufficientRoleError());
    }
    return { actor: createActor(userId, role), expiresAt: verification.expiresAt };
  }

  private reject(
    reason: AdmissionRejectionReason,
    error: DomainError,
    details: Record<string, string> = {},
  ): DomainError {
    this.logger.warn({ event: 'realtime.rejected', reason, ...details });
    return error;
  }
}
