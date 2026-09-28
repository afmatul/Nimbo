import type {
  VerificationToken,
  VerificationTokenType,
} from '../../domain/verification-token.entity';
import type { IVerificationTokenRepository } from '../ports/i-verification-token-repository.port';

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

  invalidateActive(userId: string, type: VerificationTokenType, now: Date): Promise<void> {
    for (const token of this.all()) {
      if (token.userId === userId && token.type === type && token.isValid(now)) {
        this.tokens.set(token.id, token.invalidate(now));
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
