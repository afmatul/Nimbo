import { Inject, Injectable } from '@nestjs/common';

import type { Actor } from '../../../shared';
import { EmailAddress } from '../domain/email-address.vo';
import { AccountNotFoundError } from '../domain/errors';

import { I_ACCOUNT_DIRECTORY_REPOSITORY } from './ports/i-account-directory.repository.port';
import type {
  AccountListQuery,
  AccountStatistics,
  AccountSummary,
  ClientIdentity,
  IAccountDirectoryRepository,
} from './ports/i-account-directory.repository.port';

/** Una cuenta vista por un Administrador: `isSelf` marca la suya (011 CA-4). */
export interface AccountView extends AccountSummary {
  readonly isSelf: boolean;
}

/**
 * Página pedida desde 1 (DF-66) con el tamaño que fija quien llama, como `INodeMetadataReader` (011 H-3);
 * `emailPrefix` ya recortado y en minúsculas por el contrato (Q-5). Es la misma forma que pide el repositorio.
 */
export type AccountListRequest = AccountListQuery;

/** Una página de cuentas con el total que coincide con la búsqueda (DF-66). */
export interface AccountViewPage {
  readonly items: readonly AccountView[];
  readonly total: number;
}

/**
 * Fachada de lectura de cuentas para el backoffice (011 plan §2; clase sin interfaz, Art. V.2). Recibe el `actor`
 * primero (DF-01); quién puede leer y si sigue activo lo decide `backoffice` antes de llamar. Lee dentro de la
 * transacción del llamador.
 */
@Injectable()
export class AccountDirectory {
  constructor(
    @Inject(I_ACCOUNT_DIRECTORY_REPOSITORY) private readonly accounts: IAccountDirectoryRepository,
  ) {}

  /** CA-1: de la más nueva a la más vieja, `request.pageSize` por página. */
  async list(actor: Actor, request: AccountListRequest): Promise<AccountViewPage> {
    const { items, total } = await this.accounts.list(request);
    return { items: items.map((item) => viewFor(actor, item)), total };
  }

  /** CA-2 a CA-4: la ficha, o `AccountNotFoundError`. */
  async get(actor: Actor, id: string): Promise<AccountView> {
    const account = await this.accounts.findById(id);
    if (account === null) {
      throw new AccountNotFoundError();
    }
    return viewFor(actor, account);
  }

  /**
   * CA-13: solo un cliente; una cuenta interna o un correo sin cuenta dan `null` (003 D-6).
   * `_actor` no se usa aquí: lo exige la regla «todo servicio que toca datos de un usuario recibe `actor`»;
   * autoriza `backoffice`.
   */
  findClientByEmail(_actor: Actor, email: string): Promise<ClientIdentity | null> {
    return this.accounts.findClientByEmail(EmailAddress.of(email));
  }

  /**
   * CA-12: totales agregados, nunca filas de una cuenta.
   * `_actor` no se usa aquí: lo exige la regla «todo servicio que toca datos de un usuario recibe `actor`»;
   * autoriza `backoffice`.
   */
  statistics(_actor: Actor): Promise<AccountStatistics> {
    return this.accounts.statistics();
  }
}

const viewFor = (actor: Actor, account: AccountSummary): AccountView => ({
  ...account,
  isSelf: account.id === actor.id,
});
