import { randomUUID } from 'node:crypto';

import { OpaqueToken } from '../domain/opaque-token.vo';
import { VerificationToken } from '../domain/verification-token.entity';
import type { VerificationTokenType } from '../domain/verification-token.entity';

import type { IVerificationTokenRepository } from './ports/i-verification-token-repository.port';

/** Qué enlace de cuenta emitir: para quién, de qué tipo, desde cuándo y por cuánto tiempo. */
export interface AccountTokenRequest {
  readonly userId: string;
  readonly type: VerificationTokenType;
  readonly issuedAt: Date;
  readonly ttlMs: number;
}

/** El id del token guardado y su valor en claro, que solo vive en memoria y en el correo. */
export interface IssuedAccountToken {
  readonly id: string;
  readonly value: OpaqueToken;
}

/**
 * Emite un token de enlace de cuenta (001 plan §6.3, 002 D-6, 011 CA-5): invalida los vigentes del mismo tipo y
 * guarda solo el hash del nuevo. Va dentro de la transacción del caso de uso. La usan la verificación, la
 * recuperación y el alta interna.
 */
export const issueAccountToken = async (
  tokens: IVerificationTokenRepository,
  request: AccountTokenRequest,
): Promise<IssuedAccountToken> => {
  const { userId, type, issuedAt, ttlMs } = request;
  await tokens.invalidateActive(userId, type, issuedAt);
  const value = OpaqueToken.generate();
  const token = VerificationToken.issue({
    id: randomUUID(),
    userId,
    type,
    tokenHash: value.hash(),
    createdAt: issuedAt,
    expiresAt: new Date(issuedAt.getTime() + ttlMs),
  });
  await tokens.insert(token);
  return { id: token.id, value };
};
