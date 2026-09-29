import { Injectable } from '@nestjs/common';
import { argon2id, hash, verify } from 'argon2';

import type { IPasswordHasher } from '../application/ports/i-password-hasher.port';
import { PasswordHash } from '../domain/password-hash.vo';

/** 19 MiB: mínimo de OWASP que fija RN-3. Se sube solo con la medición de staging a la vista (ADR-0017). */
export const ARGON2ID_MEMORY_COST_KIB = 19_456;
export const ARGON2ID_TIME_COST = 2;
export const ARGON2ID_PARALLELISM = 1;

/**
 * `IPasswordHasher` con Argon2id (ADR-0017, plan §6.4). Cada PHC lleva sus parámetros y su sal, así que subir los
 * parámetros no invalida los hashes existentes. La librería corre en los hilos de libuv y no bloquea el bucle.
 */
@Injectable()
export class Argon2idHasher implements IPasswordHasher {
  async hash(plain: string): Promise<PasswordHash> {
    const phc = await hash(plain, {
      type: argon2id,
      memoryCost: ARGON2ID_MEMORY_COST_KIB,
      timeCost: ARGON2ID_TIME_COST,
      parallelism: ARGON2ID_PARALLELISM,
    });
    return PasswordHash.fromPhc(phc);
  }

  verify(passwordHash: PasswordHash, plain: string): Promise<boolean> {
    return verify(passwordHash.reveal(), plain);
  }
}
