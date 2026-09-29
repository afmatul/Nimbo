// Los tipos del E-R (`token_cuenta.tipo`); `recuperacion` lo usa 002.
export type VerificationTokenType = 'verificacion' | 'recuperacion';

export type VerificationTokenState = 'valid' | 'used' | 'expired' | 'invalidated';

export interface IssueVerificationTokenInput {
  readonly id: string;
  readonly userId: string;
  readonly type: VerificationTokenType;
  readonly tokenHash: string;
  readonly createdAt: Date;
  readonly expiresAt: Date;
}

export interface VerificationTokenSnapshot extends IssueVerificationTokenInput {
  readonly usedAt: Date | null;
  readonly invalidatedAt: Date | null;
}

/**
 * La aplicación intentó consumir o invalidar un token que no es válido: debe consultar `stateAt`
 * antes y traducir el estado al error público (CA-9, CA-10, CA-11).
 */
export class InvalidTokenTransitionError extends Error {
  constructor(state: VerificationTokenState) {
    super(`El token no es válido para esta operación (estado: ${state}).`);
    this.name = new.target.name;
  }
}

function copyDate(date: Date | null): Date | null {
  return date === null ? null : new Date(date.getTime());
}

/** Token de un enlace de cuenta, inmutable. Recibe «ahora» como argumento: no lee el reloj. */
export class VerificationToken {
  readonly id: string;
  readonly userId: string;
  readonly type: VerificationTokenType;
  readonly tokenHash: string;
  private readonly createdAtMs: number;
  private readonly expiresAtMs: number;
  private readonly usedAtValue: Date | null;
  private readonly invalidatedAtValue: Date | null;

  private constructor(snapshot: VerificationTokenSnapshot) {
    this.id = snapshot.id;
    this.userId = snapshot.userId;
    this.type = snapshot.type;
    this.tokenHash = snapshot.tokenHash;
    this.createdAtMs = snapshot.createdAt.getTime();
    this.expiresAtMs = snapshot.expiresAt.getTime();
    this.usedAtValue = copyDate(snapshot.usedAt);
    this.invalidatedAtValue = copyDate(snapshot.invalidatedAt);
  }

  /** El vencimiento llega ya calculado por la aplicación (D-7); aquí solo se exige que sea posterior. */
  static issue(input: IssueVerificationTokenInput): VerificationToken {
    if (input.expiresAt.getTime() <= input.createdAt.getTime()) {
      throw new TypeError('El vencimiento del token debe ser posterior a su creación.');
    }
    return new VerificationToken({ ...input, usedAt: null, invalidatedAt: null });
  }

  static rehydrate(snapshot: VerificationTokenSnapshot): VerificationToken {
    return new VerificationToken(snapshot);
  }

  get createdAt(): Date {
    return new Date(this.createdAtMs);
  }

  get expiresAt(): Date {
    return new Date(this.expiresAtMs);
  }

  get usedAt(): Date | null {
    return copyDate(this.usedAtValue);
  }

  get invalidatedAt(): Date | null {
    return copyDate(this.invalidatedAtValue);
  }

  /** Invalidado gana a usado y usado gana a vencido: el estado más definitivo manda. */
  stateAt(now: Date): VerificationTokenState {
    if (this.invalidatedAtValue !== null) {
      return 'invalidated';
    }
    if (this.usedAtValue !== null) {
      return 'used';
    }
    if (now.getTime() >= this.expiresAtMs) {
      return 'expired';
    }
    return 'valid';
  }

  isValid(now: Date): boolean {
    return this.stateAt(now) === 'valid';
  }

  consume(now: Date): VerificationToken {
    this.assertValid(now);
    return new VerificationToken({ ...this.snapshot(), usedAt: now });
  }

  invalidate(now: Date): VerificationToken {
    this.assertValid(now);
    return new VerificationToken({ ...this.snapshot(), invalidatedAt: now });
  }

  private assertValid(now: Date): void {
    const state = this.stateAt(now);
    if (state !== 'valid') {
      throw new InvalidTokenTransitionError(state);
    }
  }

  private snapshot(): VerificationTokenSnapshot {
    return {
      id: this.id,
      userId: this.userId,
      type: this.type,
      tokenHash: this.tokenHash,
      createdAt: this.createdAt,
      expiresAt: this.expiresAt,
      usedAt: this.usedAt,
      invalidatedAt: this.invalidatedAt,
    };
  }
}
