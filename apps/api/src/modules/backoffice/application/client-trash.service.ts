import { Inject, Injectable } from '@nestjs/common';
import { BACKOFFICE_FIELD_MESSAGES } from '@nimbo/contracts';
import type { ClientTrashQuery } from '@nimbo/contracts';
import { PinoLogger } from 'nestjs-pino';

import type { Actor } from '../../../shared';
import { AuditAction } from '../../audit';
import type { AuditRecord } from '../../audit';
import { AccountDirectory } from '../../identity';
import type { ClientIdentity } from '../../identity';
import { InvalidQueryError, SupportTrashService } from '../../storage';
import type { SupportRestoreCommand, SupportRestoreResult, TrashPage } from '../../storage';
import { ClientNotFoundError } from '../domain/errors/client-not-found.error';
import { InvalidBackofficeQueryError } from '../domain/errors/invalid-backoffice-query.error';

import type { BackofficeLogger } from './backoffice-logger';
import { InternalActionService } from './internal-action.service';
import { filesViewedEvent } from './support.service';

/** El cliente encontrado y una página de las raíces de su papelera (CA-10). */
export interface ClientTrashView {
  readonly client: ClientIdentity;
  readonly page: TrashPage;
}

/** CA-11: la raíz `item` de la papelera del cliente con ese correo y el motivo escrito de Soporte (ya recortado). */
export interface ClientRestoreCommand {
  readonly email: string;
  readonly note: string;
  readonly item: SupportRestoreCommand['item'];
}

/** CA-12: un cursor que la papelera no emitió es el mismo `400` del backoffice que cualquier otra consulta inválida. */
const cursorQueryError = (): InvalidBackofficeQueryError =>
  new InvalidBackofficeQueryError([
    {
      field: 'cursor',
      reason: 'INVALID_CURSOR',
      message: BACKOFFICE_FIELD_MESSAGES.INVALID_CURSOR,
    },
  ]);

/** RN-4, CA-14: la restauración contra el cliente, con el rol de Soporte y su motivo; sin nombres ni correo. */
const restoredEvent = (
  actor: Actor,
  cmd: ClientRestoreCommand & { readonly clientId: string },
  result: SupportRestoreResult,
): AuditRecord => ({
  action: AuditAction.NODE_RESTORED,
  actor,
  targetUserId: cmd.clientId,
  resourceId: cmd.item.id,
  attributes: {
    nodeType: cmd.item.type,
    itemCount: result.itemCount,
    sizeBytes: Number(result.sizeBytes),
    note: cmd.note,
  },
});

/**
 * Papelera de un cliente para Soporte (spec 011b CA-10 a CA-14; plan §2). Compone fachadas: el correo lo resuelve
 * `identity` antes de tocar `storage` (mismo `404` para inexistente o interna), las reglas de la restauración son de
 * `storage` y la transacción, el actor activo y el evento los pone `InternalActionService`. No autoriza por rol: eso es
 * `@Roles(SUPPORT)`.
 */
@Injectable()
export class ClientTrashService {
  constructor(
    @Inject(InternalActionService)
    private readonly internal: Pick<InternalActionService, 'run'>,
    @Inject(AccountDirectory)
    private readonly directory: Pick<AccountDirectory, 'findClientByEmail'>,
    @Inject(SupportTrashService)
    private readonly trash: Pick<SupportTrashService, 'list' | 'restore'>,
    @Inject(PinoLogger) private readonly logger: Pick<BackofficeLogger, 'info'>,
  ) {}

  /** CA-10: la consulta queda en la auditoría del cliente como la de sus metadatos (011 RN-2). */
  async list(actor: Actor, query: ClientTrashQuery): Promise<ClientTrashView> {
    const view = await this.internal.run(actor, {
      locksAdminRoster: false,
      work: () => this.readTrash(actor, query),
      event: (result) => filesViewedEvent(actor, result.client),
    });
    // Solo ids (RNF-17): nunca el correo buscado ni nombres de archivo.
    this.logger.info({
      event: 'backoffice.client_trash.viewed',
      actorId: actor.id,
      clientId: view.client.id,
    });
    return view;
  }

  /** CA-11, CA-12: la restauración y su evento en la misma transacción; un rechazo no cambia ni audita nada. */
  async restore(actor: Actor, cmd: ClientRestoreCommand): Promise<SupportRestoreResult> {
    const { clientId, result } = await this.internal.run(actor, {
      locksAdminRoster: false,
      work: async () => {
        const client = await this.requireClient(actor, cmd.email);
        const restored = await this.trash.restore(actor, { ownerId: client.id, item: cmd.item });
        return { clientId: client.id, result: restored };
      },
      event: (done) => restoredEvent(actor, { ...cmd, clientId: done.clientId }, done.result),
    });
    // Solo ids y el resultado (RNF-17, CA-14): nunca el motivo, el nombre ni el correo.
    this.logger.info({
      event: 'backoffice.client_trash.restored',
      actorId: actor.id,
      clientId,
      nodeId: cmd.item.id,
      outcome: result.outcome,
    });
    return result;
  }

  private async readTrash(actor: Actor, query: ClientTrashQuery): Promise<ClientTrashView> {
    const client = await this.requireClient(actor, query.email);
    const { cursor, limit } = query;
    try {
      const page = await this.trash.list(actor, {
        ownerId: client.id,
        limit,
        ...(cursor === undefined ? {} : { cursor }),
      });
      return { client, page };
    } catch (error: unknown) {
      throw error instanceof InvalidQueryError ? cursorQueryError() : error;
    }
  }

  /** CA-12: un correo que no es de un cliente es `404` sin evento; deja rastro de un posible sondeo, sin el correo. */
  private async requireClient(actor: Actor, email: string): Promise<ClientIdentity> {
    const client = await this.directory.findClientByEmail(actor, email);
    if (client !== null) return client;
    this.logger.info({
      event: 'backoffice.client_trash.not_found',
      actorId: actor.id,
      actorRole: actor.role,
    });
    throw new ClientNotFoundError();
  }
}
