import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
} from '@nestjs/common';
import type { RevokeOthersResponse, SessionListResponse } from '@nimbo/contracts';
import type { Response } from 'express';

import { ALL_ROLES, CurrentActor, CurrentSessionId, Roles } from '../../../shared';
import type { Actor } from '../../../shared';
import { IDENTITY_CONFIG } from '../application/identity-config';
import type { IdentityConfig } from '../application/identity-config';
import { SessionService } from '../application/session.service';
import { SessionNotFoundError } from '../domain/errors';

import { SessionCookies } from './session-cookies';

/** Un `:id` que no es UUID es el mismo 404 que una sesión ajena, inexistente o ya revocada (003 D-6). */
const sessionIdPipe = (): ParseUUIDPipe =>
  new ParseUUIDPipe({ exceptionFactory: () => new SessionNotFoundError() });

/**
 * Sesiones abiertas de la cuenta en «Seguridad» (plan 002 §5, §6.5): listar, cerrar una y cerrar las demás. Los cuatro
 * roles gestionan solo las suyas. Solo mapea y delega en `SessionService`; el actor y «esta sesión» salen de
 * `RequestPrincipal` con `@CurrentActor()` y `@CurrentSessionId()`, nunca de `req.user`.
 */
@Roles(...ALL_ROLES)
@Controller('sessions')
export class SessionsController {
  private readonly cookies: SessionCookies;

  constructor(
    private readonly sessions: SessionService,
    @Inject(IDENTITY_CONFIG) config: IdentityConfig,
  ) {
    this.cookies = new SessionCookies(config.cookieSecure);
  }

  /** CA-11: la actual primero y después por última actividad. */
  @Get()
  async list(
    @CurrentActor() actor: Actor,
    @CurrentSessionId() currentSessionId: string,
  ): Promise<SessionListResponse> {
    return { items: [...(await this.sessions.list(actor, currentSessionId))] };
  }

  /** CA-12, CA-14: cerrar la sesión actual también borra `nimbo_rt` de este navegador. */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revoke(
    @CurrentActor() actor: Actor,
    @Param('id', sessionIdPipe()) sessionId: string,
    @CurrentSessionId() currentSessionId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const { wasCurrent } = await this.sessions.revoke(actor, sessionId, currentSessionId);
    if (wasCurrent) {
      this.cookies.clearRefresh(res);
    }
  }

  /** CA-13: la sesión actual sigue abierta. */
  @Post('revoke-others')
  @HttpCode(HttpStatus.OK)
  async revokeOthers(
    @CurrentActor() actor: Actor,
    @CurrentSessionId() currentSessionId: string,
  ): Promise<RevokeOthersResponse> {
    return { revokedCount: await this.sessions.revokeOthers(actor, currentSessionId) };
  }
}
