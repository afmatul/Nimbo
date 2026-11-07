import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

import { I_ATTEMPT_LOCKOUT, I_PASSWORD_HASHER, RateLimitExceededError } from '../../../shared';
import type { IAttemptLockout, IPasswordHasher } from '../../../shared';
import { networkHashOf } from '../domain/limit-network';
import type { PublicLink } from '../domain/public-link';

import { SHARING_CONFIG } from './sharing-config';
import type { SharingConfig } from './sharing-config';
import type { SharingLogger } from './sharing-logger';

/** Clave del bloqueo por contraseñas fallidas (plan §5, RN-7): por enlace y por el hash de la red. */
const FAILURE_KEY_PREFIX = 'sharing:link-fail:';
/** Clave del techo global (013b plan §5, RN-3; PD-175): solo el id del enlace, sin red ni IP. */
const CEILING_KEY_PREFIX = 'sharing:link-fail-all:';

/** Lo que el visitante aporta a la verificación (CA-10): la contraseña, si la envía, y su IP; nunca el token. */
export interface PasswordAttempt {
  readonly password?: string | undefined;
  /** `req.ip`; solo cuenta su red (con hash) para el bloqueo y no se registra. */
  readonly ip: string;
}

/**
 * Resultado de `check`: pasa (el enlace no pide contraseña o es la correcta) o no pasa, y en ese caso si este intento
 * es el que activó el bloqueo (CA-13), para que `PublicLinkAccessService` lo audite con el actor derivado.
 */
export type PasswordCheck =
  { readonly passed: true } | { readonly passed: false; readonly engagedLock: boolean };

const PASSED: PasswordCheck = { passed: true };
/** CA-12: la contraseña ausente o vacía no cuenta, así que nunca activa el bloqueo. */
const MISSING: PasswordCheck = { passed: false, engagedLock: false };

const failureKeyOf = (link: PublicLink, ip: string): string =>
  `${FAILURE_KEY_PREFIX}${link.id}:${networkHashOf(ip)}`;

const ceilingKeyOf = (link: PublicLink): string => `${CEILING_KEY_PREFIX}${link.id}`;

/** CA-12: una contraseña ausente o vacía (`""`, el campo vacío del formulario) no es un intento. */
const isMissing = (password: string | undefined): password is undefined | '' =>
  password === undefined || password === '';

/**
 * Política de contraseña y bloqueo de un enlace público (M3b, plan 013 §5; SRP, PD-177). Solo ve el enlace y el
 * intento: no recibe el actor derivado ni audita (ADR-0039, condición de Adrián: el actor derivado no sale de
 * `PublicLinkAccessService`, que es quien audita el bloqueo).
 */
@Injectable()
export class PublicLinkPasswordGate {
  constructor(
    @Inject(I_PASSWORD_HASHER) private readonly hasher: IPasswordHasher,
    @Inject(I_ATTEMPT_LOCKOUT) private readonly lockout: IAttemptLockout,
    @Inject(SHARING_CONFIG)
    private readonly config: Pick<SharingConfig, 'publicLinkLockout' | 'publicLinkCeiling'>,
    @Inject(PinoLogger) private readonly logger: SharingLogger,
  ) {}

  /**
   * CA-10, CA-12, CA-13 (013b plan §1): sin contraseña en el enlace no se verifica nada ni cuenta el techo. Si la pide,
   * primero el techo global del enlace: activo, `429` para todos (013b CA-12). Si falta (ausente o `""`), no pasa sin
   * contar ni registrar. Con una, el intento se reserva por enlace + red **antes** de Argon2id (fuera de toda
   * transacción), así el bloqueo vigente da `429` aunque sea la correcta. Un acierto libera solo la reserva por red (el
   * techo no se reinicia, 013b RN-3); un fallo cuenta para el techo y va solo a la bitácora técnica, sin IP ni
   * contraseña (CA-18). `engagedLock` es el de la red o el del techo (013b CA-14).
   */
  async check(link: PublicLink, { password, ip }: PasswordAttempt): Promise<PasswordCheck> {
    const { passwordHash } = link.toSnapshot();
    if (passwordHash === null) return PASSED;
    const ceilingKey = ceilingKeyOf(link);
    await this.assertBelowCeiling(ceilingKey);
    if (isMissing(password)) return MISSING;
    const key = failureKeyOf(link, ip);
    const networkEngaged = await this.reserveAttempt(key);
    if (await this.hasher.verify(passwordHash, password)) {
      await this.lockout.clear(key);
      return PASSED;
    }
    this.logger.info({ event: 'public_link.password_failed', linkId: link.id });
    const ceilingEngaged = await this.recordCeilingFailure(ceilingKey);
    return { passed: false, engagedLock: networkEngaged || ceilingEngaged };
  }

  /** 013b CA-12: con el techo activo, `429` con su espera, sin Argon2id ni reserva por red. */
  private async assertBelowCeiling(ceilingKey: string): Promise<void> {
    const ceiling = await this.lockout.check(ceilingKey);
    if (ceiling.locked) throw new RateLimitExceededError(ceiling.retryAfterSeconds);
  }

  /** 013b CA-14: si este fallo es el que activó el techo; el script atómico lo da a uno solo. */
  private async recordCeilingFailure(ceilingKey: string): Promise<boolean> {
    const record = await this.lockout.recordFailure(ceilingKey, this.config.publicLinkCeiling);
    return record.locked && record.engagedLock;
  }

  /** CA-13: con el bloqueo vigente, `429` con la espera sin verificar; si no, si este intento es el que lo activa. */
  private async reserveAttempt(key: string): Promise<boolean> {
    const reservation = await this.lockout.reserveAttempt(key, this.config.publicLinkLockout);
    if (!reservation.allowed) throw new RateLimitExceededError(reservation.retryAfterSeconds);
    return reservation.engagedLock;
  }
}
