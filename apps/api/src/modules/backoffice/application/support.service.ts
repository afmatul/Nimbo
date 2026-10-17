import { Inject, Injectable } from '@nestjs/common';
import { BACKOFFICE_PAGE_SIZE } from '@nimbo/contracts';
import type { ClientFilesQuery } from '@nimbo/contracts';
import { PinoLogger } from 'nestjs-pino';

import type { Actor } from '../../../shared';
import { AuditAction } from '../../audit';
import type { AuditRecord } from '../../audit';
import { AccountDirectory } from '../../identity';
import type { ClientIdentity } from '../../identity';
import { I_NODE_METADATA_READER } from '../../storage';
import type { FileMetadata, INodeMetadataReader } from '../../storage';
import { ClientNotFoundError } from '../domain/errors/client-not-found.error';

import { InternalActionService } from './internal-action.service';

/** El cliente encontrado y una página de sus metadatos (011 CA-13); `BACKOFFICE_PAGE_SIZE` por página. */
export interface ClientFilesView {
  readonly client: ClientIdentity;
  readonly items: readonly FileMetadata[];
  readonly page: number;
  readonly total: number;
}

/** Lo que este servicio usa del logger (se inyecta `PinoLogger`; permite un doble en las pruebas). */
interface SupportLogger {
  info(payload: Record<string, unknown>): void;
}

/** La consulta queda en la auditoría del cliente, que la ve con el rol de quien la hizo (RN-2, CA-16). */
const filesViewedEvent = (actor: Actor, client: ClientIdentity): AuditRecord => ({
  action: AuditAction.CLIENT_FILES_VIEWED,
  actor,
  targetUserId: client.id,
  resourceId: client.id,
});

/**
 * Metadatos de los archivos de un cliente para Soporte y Administración (011 CA-13; plan §2). Compone fachadas: el
 * correo lo resuelve `identity` y los metadatos los lee `storage`; la transacción, el actor activo y el evento los
 * pone `InternalActionService`. Si el correo no es de un cliente, `ClientNotFoundError` revierte sin evento.
 */
@Injectable()
export class SupportService {
  constructor(
    @Inject(InternalActionService)
    private readonly internal: Pick<InternalActionService, 'run'>,
    @Inject(AccountDirectory)
    private readonly directory: Pick<AccountDirectory, 'findClientByEmail'>,
    @Inject(I_NODE_METADATA_READER) private readonly reader: INodeMetadataReader,
    @Inject(PinoLogger) private readonly logger: SupportLogger,
  ) {}

  async listClientFiles(actor: Actor, query: ClientFilesQuery): Promise<ClientFilesView> {
    const view = await this.internal.run(actor, {
      locksAdminRoster: false,
      work: () => this.readClientFiles(actor, query),
      event: (result) => filesViewedEvent(actor, result.client),
    });
    // Solo ids (RNF-17): nunca el correo buscado ni nombres de archivo.
    this.logger.info({
      event: 'backoffice.client_files.viewed',
      actorId: actor.id,
      clientId: view.client.id,
    });
    return view;
  }

  private async readClientFiles(actor: Actor, query: ClientFilesQuery): Promise<ClientFilesView> {
    const client = await this.directory.findClientByEmail(actor, query.email);
    if (client === null) {
      // Rastro de un posible sondeo de correos, sin el correo (RNF-17); sin evento: CA-13.
      this.logger.info({
        event: 'backoffice.client_files.not_found',
        actorId: actor.id,
        actorRole: actor.role,
      });
      throw new ClientNotFoundError();
    }
    const { items, total } = await this.reader.listForOwner(actor, client.id, {
      page: query.page,
      pageSize: BACKOFFICE_PAGE_SIZE,
    });
    return { client, items, page: query.page, total };
  }
}
