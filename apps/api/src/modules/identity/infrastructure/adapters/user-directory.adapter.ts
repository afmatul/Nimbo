import { Inject, Injectable } from '@nestjs/common';
import { In } from 'typeorm';

import { TransactionContext } from '../../../../shared';
import type { IUserDirectory } from '../../../editing';
import { UsuarioOrmEntity } from '../persistence/usuario.orm-entity';

/**
 * `IUserDirectory` de `editing` (016 RN-12, DF-74): nombre visible de las cuentas que `editing` ya autorizó como
 * participantes. Lee solo `id` y `nombre` de `usuario` (sin RLS, plan 016 §7 punto 8); nunca correo, rol ni estado.
 * `identity` importa el puerto de `editing/index.ts` (arista `identity → editing`), como `billing` con `storage`.
 */
@Injectable()
export class UserDirectoryAdapter implements IUserDirectory {
  constructor(@Inject(TransactionContext) private readonly context: TransactionContext) {}

  async displayNames(userIds: readonly string[]): Promise<ReadonlyMap<string, string>> {
    if (userIds.length === 0) return new Map();
    const rows = await this.context.manager().find(UsuarioOrmEntity, {
      select: { id: true, nombre: true },
      where: { id: In([...new Set(userIds)]) },
    });
    return new Map(rows.map((row) => [row.id, row.nombre]));
  }
}
