import { Inject, Injectable } from '@nestjs/common';

import { TransactionContext } from '../../../../shared';
import type {
  IPublicLinkResolver,
  ResolvedPublicLink,
} from '../../application/ports/i-public-link-resolver.port';

const LINK_BY_TOKEN_SQL = 'SELECT enlace_id, archivo_id, propietario_id FROM enlace_por_token($1)';

interface ResolvedRow {
  readonly enlace_id: string;
  readonly archivo_id: string;
  readonly propietario_id: string;
}

/**
 * `IPublicLinkResolver` sobre la función `SECURITY DEFINER` `enlace_por_token` (ADR-0039 regla 1). Usa el
 * `EntityManager` vigente (el de `ITransactionRunner.run`, sin actor): la función filtra revocados y vencidos con el
 * reloj de la base y `nimbo_app` sigue sin ver `enlace_publico`.
 */
@Injectable()
export class SqlPublicLinkResolver implements IPublicLinkResolver {
  constructor(@Inject(TransactionContext) private readonly context: TransactionContext) {}

  async resolve(tokenHash: string): Promise<ResolvedPublicLink | null> {
    const [row] = (await this.context
      .manager()
      .query(LINK_BY_TOKEN_SQL, [tokenHash])) as ResolvedRow[];
    if (row === undefined) return null;
    return { linkId: row.enlace_id, fileId: row.archivo_id, ownerId: row.propietario_id };
  }
}
