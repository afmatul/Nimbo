import { Inject, Injectable } from '@nestjs/common';
import { In } from 'typeorm';

import { Role, TransactionContext } from '../../../../shared';
import type { IShareeDirectory, Sharee } from '../../../sharing';
import { AccountStatus } from '../../domain/account-status.enum';
import { EmailAddress } from '../../domain/email-address.vo';
import { UsuarioOrmEntity } from '../persistence/usuario.orm-entity';

import { UserDirectoryAdapter } from './user-directory.adapter';

/** 012 RN-3, 013 CA-11: solo un cliente verificado y activo recibe accesos o comparte un enlace público. */
const ACTIVE_CLIENT = {
  rol: Role.CLIENT,
  estado: AccountStatus.ACTIVE,
  correoVerificado: true,
} as const;

/**
 * `IShareeDirectory` de `sharing` (012 CA-3, RN-3, RN-8, DF-84). El destinatario es un cliente verificado y activo;
 * el filtro va en la consulta, así no existe, interna, sin verificar y suspendida dan el mismo `null`. Lee `usuario`
 * (sin RLS) dentro de la transacción del llamador. Los nombres visibles los da `UserDirectoryAdapter` (Art. VI).
 * `identity` importa el puerto de `sharing/index.ts` (arista `identity → sharing`), como `identity → editing`.
 */
@Injectable()
export class ShareeDirectoryAdapter implements IShareeDirectory {
  constructor(
    @Inject(TransactionContext) private readonly context: TransactionContext,
    @Inject(UserDirectoryAdapter) private readonly users: UserDirectoryAdapter,
  ) {}

  async findClientByEmail(email: string): Promise<Sharee | null> {
    const row = await this.context.manager().findOne(UsuarioOrmEntity, {
      select: { id: true, nombre: true, correo: true },
      where: { correo: EmailAddress.of(email).value, ...ACTIVE_CLIENT },
    });
    return row === null ? null : { id: row.id, displayName: row.nombre, email: row.correo };
  }

  /** CA-8: nombre y correo de cualquier cuenta pedida, sin filtrar estado; lo acota el llamador a sus accesos. */
  async profiles(userIds: readonly string[]): Promise<ReadonlyMap<string, Sharee>> {
    if (userIds.length === 0) return new Map();
    const rows = await this.context.manager().find(UsuarioOrmEntity, {
      select: { id: true, nombre: true, correo: true },
      where: { id: In([...new Set(userIds)]) },
    });
    return new Map(
      rows.map((row) => [row.id, { id: row.id, displayName: row.nombre, email: row.correo }]),
    );
  }

  displayNames(userIds: readonly string[]): Promise<ReadonlyMap<string, string>> {
    return this.users.displayNames(userIds);
  }

  /** 013 CA-9, CA-11: con el filtro de `findClientByEmail` en la consulta; suspendida o interna dan `null`. */
  async activeDisplayName(userId: string): Promise<string | null> {
    const row = await this.context.manager().findOne(UsuarioOrmEntity, {
      select: { nombre: true },
      where: { id: userId, ...ACTIVE_CLIENT },
    });
    return row?.nombre ?? null;
  }
}
