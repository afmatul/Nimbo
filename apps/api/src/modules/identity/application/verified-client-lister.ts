import { Inject, Injectable } from '@nestjs/common';

import { I_ACCOUNT_DIRECTORY_REPOSITORY } from './ports/i-account-directory.repository.port';
import type { IAccountDirectoryRepository } from './ports/i-account-directory.repository.port';

/**
 * Fachada de lectura para la conciliación de suscripciones de `billing` (009 CA-2, PD-40; clase sin interfaz, DF-04).
 * Solo ids de clientes verificados, sin actor: es mantenimiento, como el `IClientAccountScanner` de `storage`, y
 * `usuario` no tiene RLS. Lee dentro de la transacción del llamador.
 */
@Injectable()
export class VerifiedClientLister {
  constructor(
    @Inject(I_ACCOUNT_DIRECTORY_REPOSITORY) private readonly accounts: IAccountDirectoryRepository,
  ) {}

  listIds(afterId: string | null, limit: number): Promise<readonly string[]> {
    return this.accounts.listVerifiedClientIds(afterId, limit);
  }
}
