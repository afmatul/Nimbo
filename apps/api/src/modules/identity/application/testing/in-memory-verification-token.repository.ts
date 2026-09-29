import { VerificationToken } from '../../domain/verification-token.entity';
import type { VerificationTokenType } from '../../domain/verification-token.entity';
import type { IVerificationTokenRepository } from '../ports/i-verification-token-repository.port';

/** `invalidate(now)` del dominio rechaza un vencido; la fila, en cambio, sí se cierra (igual que el `UPDATE`). */
const withInvalidatedAt = (token: VerificationToken, now: Date): VerificationToken =>
  VerificationToken.rehydrate({
    id: token.id,
    userId: token.userId,
    type: token.type,
    tokenHash: token.tokenHash,
    createdAt: token.createdAt,
    expiresAt: token.expiresAt,
    usedAt: null,
    invalidatedAt: now,
  });

/** Doble en memoria de `IVerificationTokenRepository` para las pruebas de aplicación (misma semántica que plan §6.3). */
export class InMemoryVerificationTokenRepository implements IVerificationTokenRepository {
  private readonly tokens = new Map<string, VerificationToken>();

  all(): readonly VerificationToken[] {
    return [...this.tokens.values()];
  }

  findByHash(tokenHash: string, type: VerificationTokenType): Promise<VerificationToken | null> {
    const found = this.all().find((token) => token.tokenHash === tokenHash && token.type === type);
    return Promise.resolve(found ?? null);
  }

  /** Como el adaptador TypeORM: cierra los tokens sin usar ni invalidar, también los vencidos (`uq_token_cuenta_vigente`). */
  invalidateActive(userId: string, type: VerificationTokenType, now: Date): Promise<void> {
    for (const token of this.all()) {
      const open = token.usedAt === null && token.invalidatedAt === null;
      if (token.userId === userId && token.type === type && open) {
        this.tokens.set(token.id, withInvalidatedAt(token, now));
      }
    }
    return Promise.resolve();
  }

  insert(token: VerificationToken): Promise<void> {
    this.tokens.set(token.id, token);
    return Promise.resolve();
  }

  consume(id: string, now: Date): Promise<boolean> {
    const token = this.tokens.get(id);
    if (token === undefined || !token.isValid(now)) {
      return Promise.resolve(false);
    }
    this.tokens.set(id, token.consume(now));
    return Promise.resolve(true);
  }
}
