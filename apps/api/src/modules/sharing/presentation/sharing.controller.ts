import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { accessListQuerySchema, shareRequestSchema } from '@nimbo/contracts';
import type {
  AccessEntry,
  AccessList as AccessListResponse,
  AccessListQuery,
  ShareRequest,
} from '@nimbo/contracts';
import type { Response } from 'express';

import { CurrentActor, Role, Roles, ZodValidationPipe } from '../../../shared';
import type { Actor, DomainError, FieldIssue } from '../../../shared';
import { SharingService } from '../application/sharing.service';
import {
  ShareNotFoundError,
  SharingInvalidLevelError,
  SharingInvalidRequestError,
} from '../domain/errors';

import { toAccessEntry } from './access-entry.response';

/** Las respuestas llevan correos y nombres (plan §4): ningún intermediario las guarda. */
const NO_STORE = 'no-store';
const INVALID_LEVEL_REASON = 'INVALID_LEVEL';

/** CA-2: un nivel inválido es `SHARING_INVALID_LEVEL`; el resto (p. ej. un correo mal formado, CA-3), con `fields`. */
const invalidShareRequest = (issues: readonly FieldIssue[]): DomainError =>
  issues.some((issue) => issue.reason === INVALID_LEVEL_REASON)
    ? new SharingInvalidLevelError()
    : new SharingInvalidRequestError(issues);

/** CA-9, plan §4: una consulta mal formada (tipo o id inválidos) es `422` con `fields`. */
const invalidQuery = (issues: readonly FieldIssue[]): DomainError =>
  new SharingInvalidRequestError(issues);

/** CA-11: un `:shareId` que no es UUID es el mismo 404 que uno ajeno, inexistente o ya revocado. */
const shareIdPipe = (): ParseUUIDPipe =>
  new ParseUUIDPipe({ exceptionFactory: () => new ShareNotFoundError() });

/**
 * Compartir con otro cliente, ver y revocar los accesos de un nodo (plan 012 §4). Solo `CLIENT`: un rol interno recibe `403 SHARED_FORBIDDEN` y sin token
 * `401` (CA-20). Mapea y delega; las reglas viven en `SharingService`.
 */
@Roles(Role.CLIENT)
@Controller('shares')
export class SharingController {
  constructor(private readonly sharing: SharingService) {}

  /** CA-1, CA-5: `201` con el acceso nuevo; `200` si cambió el nivel o ya era el mismo. */
  @Post()
  @Header('Cache-Control', NO_STORE)
  async share(
    @CurrentActor() actor: Actor,
    @Body(new ZodValidationPipe(shareRequestSchema, invalidShareRequest)) body: ShareRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AccessEntry> {
    const { access, change } = await this.sharing.share(actor, body);
    response.status(change === 'granted' ? HttpStatus.CREATED : HttpStatus.OK);
    return toAccessEntry({ ...access, origin: 'direct' });
  }

  /** CA-8: directos y heredados con su origen; `404` si el actor no es el propietario (CA-9). */
  @Get()
  @Header('Cache-Control', NO_STORE)
  async listAccess(
    @CurrentActor() actor: Actor,
    @Query(new ZodValidationPipe(accessListQuerySchema, invalidQuery)) query: AccessListQuery,
  ): Promise<AccessListResponse> {
    const list = await this.sharing.listAccess(actor, { type: query.nodeType, id: query.nodeId });
    return { entries: list.entries().map(toAccessEntry) };
  }

  /** CA-10: `204`; desde la siguiente petición la persona recibe `404` sobre el nodo (RN-6). */
  @Delete(':shareId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Header('Cache-Control', NO_STORE)
  async revoke(
    @CurrentActor() actor: Actor,
    @Param('shareId', shareIdPipe()) shareId: string,
  ): Promise<void> {
    await this.sharing.revoke(actor, shareId);
  }
}
