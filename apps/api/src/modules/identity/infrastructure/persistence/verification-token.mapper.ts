import { VerificationToken } from '../../domain/verification-token.entity';

import type { TokenCuentaOrmEntity } from './token-cuenta.orm-entity';

export function toVerificationTokenDomain(row: TokenCuentaOrmEntity): VerificationToken {
  return VerificationToken.rehydrate({
    id: row.id,
    userId: row.usuarioId,
    type: row.tipo,
    tokenHash: row.tokenHash,
    createdAt: row.creadoEn,
    expiresAt: row.expiraEn,
    usedAt: row.usadoEn,
    invalidatedAt: row.invalidadoEn,
  });
}

export function toTokenCuentaRow(token: VerificationToken): TokenCuentaOrmEntity {
  return {
    id: token.id,
    usuarioId: token.userId,
    tipo: token.type,
    tokenHash: token.tokenHash,
    expiraEn: token.expiresAt,
    usadoEn: token.usedAt,
    invalidadoEn: token.invalidatedAt,
    creadoEn: token.createdAt,
  };
}
