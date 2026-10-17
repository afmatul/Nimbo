import { Controller, Get, Query } from '@nestjs/common';
import { clientFilesQuerySchema } from '@nimbo/contracts';
import type { ClientFilesQuery, ClientFilesResponse } from '@nimbo/contracts';

import { CurrentActor, Role, Roles, ZodValidationPipe } from '../../../shared';
import type { Actor, DomainError, FieldIssue, InvalidInputFactory } from '../../../shared';
import { SupportService } from '../application/support.service';
import { InvalidBackofficeQueryError } from '../domain/errors/invalid-backoffice-query.error';

import { toClientFilesResponse } from './client-files-response';

/** Fábrica de `ZodValidationPipe`: 400 `BACKOFFICE_INVALID_QUERY` con los motivos por campo del contrato. */
const backofficeQueryValidationError: InvalidInputFactory = (
  issues: readonly FieldIssue[],
): DomainError => new InvalidBackofficeQueryError(issues);

/**
 * Metadatos de los archivos de un cliente (011 CA-13; plan §4): solo Administrador y Soporte (CA-14). Valida con el
 * contrato, delega en `SupportService` y responde por lista blanca, sin contenido, URL, clave de objeto ni versiones.
 */
@Roles(Role.ADMIN, Role.SUPPORT)
@Controller('backoffice/client-files')
export class ClientFilesController {
  constructor(private readonly support: SupportService) {}

  @Get()
  async list(
    @CurrentActor() actor: Actor,
    @Query(new ZodValidationPipe(clientFilesQuerySchema, backofficeQueryValidationError))
    query: ClientFilesQuery,
  ): Promise<ClientFilesResponse> {
    return toClientFilesResponse(await this.support.listClientFiles(actor, query));
  }
}
