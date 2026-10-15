import { Inject, Injectable } from '@nestjs/common';

import type { Actor } from '../../../shared';

import { I_ACCOUNT_DIRECTORY_REPOSITORY } from './ports/i-account-directory.repository.port';
import type { IAccountDirectoryRepository } from './ports/i-account-directory.repository.port';

/**
 * Fachada de lectura para el comprobante de `billing` (spec 009 CA-6; clase sin interfaz, DF-04): el correo de la
 * **propia** cuenta del actor, metadatos propios que no devuelven nodos (`architecture.md` §6). `Actor` no trae el correo
 * y `notifications` no depende de `identity`. Lee dentro de la transacción del llamador.
 */
@Injectable()
export class AccountContactReader {
  constructor(
    @Inject(I_ACCOUNT_DIRECTORY_REPOSITORY) private readonly accounts: IAccountDirectoryRepository,
  ) {}

  async contactOf(actor: Actor): Promise<string> {
    const account = await this.accounts.findById(actor.id);
    if (account === null) throw new Error('La cuenta del actor no existe.');
    return account.email;
  }
}
