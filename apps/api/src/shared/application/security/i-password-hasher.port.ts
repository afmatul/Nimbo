import type { PasswordHash } from '../../domain/password-hash.vo';

/** Hash de contraseñas (diagrama M1; Argon2id por ADR-0017). */
export interface IPasswordHasher {
  hash(plain: string): Promise<PasswordHash>;
  verify(hash: PasswordHash, plain: string): Promise<boolean>;
}

export const I_PASSWORD_HASHER = Symbol('IPasswordHasher');
