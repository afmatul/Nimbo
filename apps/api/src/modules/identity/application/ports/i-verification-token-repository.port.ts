import type {
  VerificationToken,
  VerificationTokenType,
} from '../../domain/verification-token.entity';

/** Tokens de enlace de cuenta (`token_cuenta`, plan §6.3). 002 lo reutiliza con `tipo = recuperacion`. */
export interface IVerificationTokenRepository {
  /** Un token de otro tipo no se encuentra (CA-12). */
  findByHash(tokenHash: string, type: VerificationTokenType): Promise<VerificationToken | null>;
  /** Marca como invalidados los tokens vigentes de la cuenta y el tipo (D-10, CA-4). */
  invalidateActive(userId: string, type: VerificationTokenType, now: Date): Promise<void>;
  insert(token: VerificationToken): Promise<void>;
  /** Consumo atómico: `false` si el token ya no estaba vigente al actualizarlo (CA-29 d). */
  consume(id: string, now: Date): Promise<boolean>;
}

export const I_VERIFICATION_TOKEN_REPOSITORY = Symbol('IVerificationTokenRepository');
