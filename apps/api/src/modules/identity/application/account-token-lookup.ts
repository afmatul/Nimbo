import { OpaqueToken } from '../domain/opaque-token.vo';
import type { VerificationToken, VerificationTokenType } from '../domain/verification-token.entity';

import type { IVerificationTokenRepository } from './ports/i-verification-token-repository.port';

/**
 * Busca el token de un enlace de cuenta por el valor recibido. `null` si el valor está mal formado (sin consultar,
 * 001 CA-11 b), no existe o es de otro tipo (001 CA-12, 002 CA-20). Tras buscar por hash compara en tiempo constante
 * (D-19). La usan la verificación (001) y la recuperación (002).
 */
export const findAccountToken = async (
  tokens: IVerificationTokenRepository,
  value: string,
  type: VerificationTokenType,
): Promise<VerificationToken | null> => {
  if (!OpaqueToken.isWellFormed(value)) {
    return null;
  }
  const token = await tokens.findByHash(OpaqueToken.hashOf(value), type);
  return token !== null && OpaqueToken.matchesHash(value, token.tokenHash) ? token : null;
};
