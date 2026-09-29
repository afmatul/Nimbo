import { Injectable } from '@nestjs/common';
import { IsNull, MoreThan } from 'typeorm';
import type { Repository } from 'typeorm';

import { TransactionContext } from '../../../../shared';
import type { IVerificationTokenRepository } from '../../application/ports/i-verification-token-repository.port';
import type {
  VerificationToken,
  VerificationTokenType,
} from '../../domain/verification-token.entity';

import { TokenCuentaOrmEntity } from './token-cuenta.orm-entity';
import { toTokenCuentaRow, toVerificationTokenDomain } from './verification-token.mapper';

/**
 * `IVerificationTokenRepository` sobre `token_cuenta` (plan §6.4). Usa el `EntityManager` de `TransactionContext`:
 * el de la transacción de `ITransactionRunner.run` o, fuera de ella, el del `DataSource`.
 */
@Injectable()
export class TypeormVerificationTokenRepository implements IVerificationTokenRepository {
  constructor(private readonly context: TransactionContext) {}

  async findByHash(
    tokenHash: string,
    type: VerificationTokenType,
  ): Promise<VerificationToken | null> {
    const row = await this.rows().findOneBy({ tokenHash, tipo: type });
    return row === null ? null : toVerificationTokenDomain(row);
  }

  /**
   * Cierra los tokens sin usar ni invalidar, **también los vencidos**: `uq_token_cuenta_vigente` no mira el
   * vencimiento, así que un vencido abierto impediría insertar el enlace nuevo (RN-4, D-10).
   */
  async invalidateActive(userId: string, type: VerificationTokenType, now: Date): Promise<void> {
    await this.rows().update(
      { usuarioId: userId, tipo: type, usadoEn: IsNull(), invalidadoEn: IsNull() },
      { invalidadoEn: now },
    );
  }

  async insert(token: VerificationToken): Promise<void> {
    await this.rows().insert(toTokenCuentaRow(token));
  }

  /** Un solo `UPDATE` condicional: de dos consumos simultáneos solo uno afecta la fila (CA-29 d). */
  async consume(id: string, now: Date): Promise<boolean> {
    const result = await this.rows().update(
      { id, usadoEn: IsNull(), invalidadoEn: IsNull(), expiraEn: MoreThan(now) },
      { usadoEn: now },
    );
    return result.affected === 1;
  }

  private rows(): Repository<TokenCuentaOrmEntity> {
    return this.context.manager().getRepository(TokenCuentaOrmEntity);
  }
}
