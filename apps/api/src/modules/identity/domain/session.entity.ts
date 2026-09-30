import * as crypto from 'node:crypto';

export type SessionState = 'active' | 'expired' | 'revoked';
export type SecretMatch = 'current' | 'previousWithinGrace' | 'reuse';

export interface OpenSessionInput {
  readonly id: string;
  readonly userId: string;
  readonly deviceId: string;
  readonly secretHash: string;
  readonly now: Date;
  readonly maxLifetime: number;
}

interface SessionProps {
  readonly id: string;
  readonly userId: string;
  readonly deviceId: string;
  readonly refreshHash: string;
  readonly refreshAnteriorHash: string | null;
  readonly rotadoEn: Date | null;
  readonly creadaEn: Date;
  readonly ultimoUso: Date;
  readonly expiraEn: Date;
  readonly revocadaEn: Date | null;
}

/** La vigencia máxima tiene que dejar `expira_en` estrictamente después de `creada_en`. */
export class InvalidSessionLifetimeError extends Error {
  constructor() {
    super('La vigencia máxima de la sesión tiene que ser mayor que cero.');
    this.name = 'InvalidSessionLifetimeError';
  }
}

const copyDate = (date: Date): Date => new Date(date.getTime());

const hashesEqual = (left: string, right: string): boolean => {
  const actual = Buffer.from(left, 'utf8');
  const expected = Buffer.from(right, 'utf8');
  if (actual.length !== expected.length) {
    return false;
  }
  return crypto.timingSafeEqual(actual, expected);
};

/** Sesión de refresco. Inmutable; las duraciones llegan ya calculadas (el dominio no importa `contracts`). */
export class Session {
  readonly id: string;
  readonly userId: string;
  readonly deviceId: string;
  readonly refreshHash: string;
  readonly refreshAnteriorHash: string | null;
  readonly rotadoEn: Date | null;
  readonly creadaEn: Date;
  readonly ultimoUso: Date;
  readonly expiraEn: Date;
  readonly revocadaEn: Date | null;

  private constructor(props: SessionProps) {
    this.id = props.id;
    this.userId = props.userId;
    this.deviceId = props.deviceId;
    this.refreshHash = props.refreshHash;
    this.refreshAnteriorHash = props.refreshAnteriorHash;
    this.rotadoEn = props.rotadoEn === null ? null : copyDate(props.rotadoEn);
    this.creadaEn = copyDate(props.creadaEn);
    this.ultimoUso = copyDate(props.ultimoUso);
    this.expiraEn = copyDate(props.expiraEn);
    this.revocadaEn = props.revocadaEn === null ? null : copyDate(props.revocadaEn);
  }

  static open(input: OpenSessionInput): Session {
    if (input.maxLifetime <= 0) {
      throw new InvalidSessionLifetimeError();
    }
    const now = copyDate(input.now);
    return new Session({
      id: input.id,
      userId: input.userId,
      deviceId: input.deviceId,
      refreshHash: input.secretHash,
      refreshAnteriorHash: null,
      rotadoEn: null,
      creadaEn: now,
      ultimoUso: copyDate(now),
      expiraEn: new Date(now.getTime() + input.maxLifetime),
      revocadaEn: null,
    });
  }

  /** Reconstruye una fila ya persistida sin aplicar las reglas de `open`. */
  static rehydrate(props: SessionProps): Session {
    return new Session(props);
  }

  stateAt(now: Date, idleMs: number): SessionState {
    if (this.revocadaEn !== null) {
      return 'revoked';
    }
    if (now.getTime() >= this.expiraEn.getTime()) {
      return 'expired';
    }
    if (now.getTime() >= this.ultimoUso.getTime() + idleMs) {
      return 'expired';
    }
    return 'active';
  }

  matchSecret(hash: string, now: Date, graceMs: number): SecretMatch {
    if (hashesEqual(hash, this.refreshHash)) {
      return 'current';
    }
    const withinGrace =
      this.refreshAnteriorHash !== null &&
      this.rotadoEn !== null &&
      hashesEqual(hash, this.refreshAnteriorHash) &&
      now.getTime() - this.rotadoEn.getTime() <= graceMs;
    if (withinGrace) {
      return 'previousWithinGrace';
    }
    return 'reuse';
  }

  rotate(newHash: string, now: Date): Session {
    const at = copyDate(now);
    return new Session({
      ...this.snapshot(),
      refreshHash: newHash,
      refreshAnteriorHash: this.refreshHash,
      rotadoEn: at,
      ultimoUso: copyDate(at),
    });
  }

  /** La segunda revocación conserva la primera fecha. */
  revoke(now: Date): Session {
    if (this.revocadaEn !== null) {
      return new Session(this.snapshot());
    }
    return new Session({ ...this.snapshot(), revocadaEn: copyDate(now) });
  }

  /** La cookie nunca dura más que lo que le queda a la sesión (RN-5). */
  refreshCookieMaxAge(now: Date, idleMs: number): number {
    return Math.min(idleMs, this.expiraEn.getTime() - now.getTime());
  }

  private snapshot(): SessionProps {
    return {
      id: this.id,
      userId: this.userId,
      deviceId: this.deviceId,
      refreshHash: this.refreshHash,
      refreshAnteriorHash: this.refreshAnteriorHash,
      rotadoEn: this.rotadoEn,
      creadaEn: this.creadaEn,
      ultimoUso: this.ultimoUso,
      expiraEn: this.expiraEn,
      revocadaEn: this.revocadaEn,
    };
  }
}
