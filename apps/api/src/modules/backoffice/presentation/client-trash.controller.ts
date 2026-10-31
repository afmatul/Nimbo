import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { clientTrashQuerySchema, restoreClientNodeRequestSchema } from '@nimbo/contracts';
import type {
  ClientTrashQuery,
  ClientTrashResponse,
  RestoreClientNodeRequest,
  RestoreResponse,
} from '@nimbo/contracts';

import { CurrentActor, Role, Roles, ZodValidationPipe } from '../../../shared';
import type { Actor } from '../../../shared';
import { ClientTrashService } from '../application/client-trash.service';

import {
  backofficeInputValidationError,
  backofficeQueryValidationError,
  nodeIdPipe,
} from './backoffice-validation';
import { toClientRestoreResponse, toClientTrashResponse } from './client-trash.response';

/**
 * Papelera de un cliente (011b plan §4): solo Soporte (CA-13, CA-16; el Administrador no restaura). Valida con los
 * contratos, delega en `ClientTrashService` y responde por lista blanca. No hay rutas para purgar, vaciar, descargar ni
 * previsualizar.
 */
@Roles(Role.SUPPORT)
@Controller('backoffice/client-trash')
export class ClientTrashController {
  constructor(private readonly trash: ClientTrashService) {}

  @Get()
  async list(
    @CurrentActor() actor: Actor,
    @Query(new ZodValidationPipe(clientTrashQuerySchema, backofficeQueryValidationError))
    query: ClientTrashQuery,
  ): Promise<ClientTrashResponse> {
    return toClientTrashResponse(await this.trash.list(actor, query));
  }

  @Post(':nodeId/restore')
  @HttpCode(HttpStatus.OK)
  async restore(
    @CurrentActor() actor: Actor,
    @Param('nodeId', nodeIdPipe()) nodeId: string,
    @Body(new ZodValidationPipe(restoreClientNodeRequestSchema, backofficeInputValidationError))
    body: RestoreClientNodeRequest,
  ): Promise<RestoreResponse> {
    const cmd = { email: body.email, note: body.note, item: { type: body.type, id: nodeId } };
    return toClientRestoreResponse(await this.trash.restore(actor, cmd));
  }
}
