import type { Readable } from 'node:stream';

import { Inject, Injectable } from '@nestjs/common';

import { createActor, I_TRANSACTION_RUNNER, Role } from '../../../shared';
import type { Actor, ITransactionRunner } from '../../../shared';
import { EditableFileGateway, NodeNotFoundError } from '../../storage';

import { CONTENT_LINK_SIGNER } from './content-link.signer';
import type { ContentLink, ContentLinkSigner } from './content-link.signer';
import { I_EDIT_SESSION_REPOSITORY } from './ports/i-edit-session.repository.port';
import type { IEditSessionRepository } from './ports/i-edit-session.repository.port';

/**
 * Contenido que ONLYOFFICE lee con un enlace firmado (plan 016 §4): sin token de usuario, actúa con la cuenta
 * propietaria del enlace (`withActor(createActor(oid))`) y vuelve a resolver todo con `accessibleNodes`. Un token
 * inválido, vencido o de otro tipo, una sesión que ya no está abierta (CA-16) o una versión que ya no es la vigente
 * responden el mismo 404 (sin oráculo).
 */
@Injectable()
export class DocumentContentService {
  constructor(
    @Inject(I_TRANSACTION_RUNNER) private readonly transactions: ITransactionRunner,
    @Inject(EditableFileGateway) private readonly files: EditableFileGateway,
    @Inject(I_EDIT_SESSION_REPOSITORY) private readonly sessions: IEditSessionRepository,
    @Inject(CONTENT_LINK_SIGNER) private readonly links: ContentLinkSigner | null,
  ) {}

  async contentFor(token: string): Promise<Readable> {
    const link = this.links?.verify(token) ?? null;
    if (link === null) throw new NodeNotFoundError();
    const owner = createActor(link.ownerId, Role.CLIENT);
    const fileId = await this.fileOf(owner, link);
    const content = fileId === null ? null : await this.files.openContent(owner, fileId);
    if (content === null) throw new NodeNotFoundError();
    return content;
  }

  /** El archivo del enlace si sigue valiendo: la sesión abierta o la versión que aún es la vigente. */
  private async fileOf(owner: Actor, link: ContentLink): Promise<string | null> {
    if (link.kind === 'session') {
      const session = await this.transactions.withActor(owner, () =>
        this.sessions.findOpen(owner, link.sessionId),
      );
      return session?.fileId ?? null;
    }
    const file = await this.files.find(owner, link.fileId);
    return file?.currentVersionId === link.versionId ? file.id : null;
  }
}
