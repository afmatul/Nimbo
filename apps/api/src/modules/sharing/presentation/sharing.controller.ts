import { Body, Controller, Header, HttpStatus, Post, Res } from '@nestjs/common';
import { shareRequestSchema } from '@nimbo/contracts';
import type { AccessEntry, ShareRequest } from '@nimbo/contracts';
import type { Response } from 'express';

import { CurrentActor, Role, Roles, ZodValidationPipe } from '../../../shared';
import type { Actor, DomainError, FieldIssue } from '../../../shared';
import { SharingService } from '../application/sharing.service';
import { SharingInvalidLevelError, SharingInvalidRequestError } from '../domain/errors';

import { toAccessEntry } from './access-entry.response';

/** Las respuestas llevan correos y nombres (plan §4): ningún intermediario las guarda. */
const NO_STORE = 'no-store';
const INVALID_LEVEL_REASON = 'INVALID_LEVEL';

/** CA-2: un nivel inválido es `SHARING_INVALID_LEVEL`; el resto (p. ej. un correo mal formado, CA-3), con `fields`. */
const invalidShareRequest = (issues: readonly FieldIssue[]): DomainError =>
  issues.some((issue) => issue.reason === INVALID_LEVEL_REASON)
    ? new SharingInvalidLevelError()
    : new SharingInvalidRequestError(issues);

/**
 * Compartir con otro cliente (plan 012 §4). Solo `CLIENT`: un rol interno recibe `403 SHARED_FORBIDDEN` y sin token
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
}
