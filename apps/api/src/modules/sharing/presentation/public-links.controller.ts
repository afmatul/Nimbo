import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { createPublicLinkSchema, publicLinkQuerySchema } from '@nimbo/contracts';
import type {
  CreatedPublicLink,
  CreatePublicLinkRequest,
  CurrentPublicLink,
  PublicLinkQuery,
  PublicLinkSummary as PublicLinkSummaryResponse,
} from '@nimbo/contracts';

import { CurrentActor, Role, Roles, ZodValidationPipe } from '../../../shared';
import type { Actor, DomainError, FieldIssue } from '../../../shared';
import { PublicLinkService } from '../application/public-link.service';
import type { PublicLinkSummary } from '../application/public-link.service';
import { SHARING_CONFIG } from '../application/sharing-config';
import type { SharingConfig } from '../application/sharing-config';
import { SharingInvalidRequestError } from '../domain/errors';
import type { LinkToken } from '../domain/link-token';

import { linkIdPipe, NO_STORE } from './sharing-http.constants';

/** Ruta de `web` de la página pública (la construye la 013b); el token va en el fragmento, que no viaja al servidor. */
const PUBLIC_LINK_WEB_PATH = '/enlace';
const TRAILING_SLASHES = /\/+$/;

/** CA-2, plan §4: un vencimiento, una contraseña o un `fileId` inválidos son `422` con `fields`. */
const invalidRequest = (issues: readonly FieldIssue[]): DomainError =>
  new SharingInvalidRequestError(issues);

const toSummaryResponse = (link: PublicLinkSummary): PublicLinkSummaryResponse => ({
  id: link.id,
  fileId: link.fileId,
  expiresAt: link.expiresAt.toISOString(),
  hasPassword: link.hasPassword,
  status: link.status,
  createdAt: link.createdAt.toISOString(),
});

/** `{WEB_PUBLIC_URL}/enlace#<token>`, sin duplicar la barra si `WEB_PUBLIC_URL` termina en «/» (como `identity`). */
const linkUrl = (webPublicUrl: string, token: LinkToken): string =>
  `${webPublicUrl.replace(TRAILING_SLASHES, '')}${PUBLIC_LINK_WEB_PATH}#${token.toString()}`;

/**
 * Enlaces públicos del propietario (plan 013 §4). Solo `CLIENT`: un rol interno recibe `403 SHARED_FORBIDDEN` y sin
 * token `401` (CA-16). Mapea y delega; las reglas viven en `PublicLinkService`. Todas con `no-store`: la de generar lleva
 * el token.
 */
@Roles(Role.CLIENT)
@Controller('public-links')
export class PublicLinksController {
  constructor(
    private readonly links: PublicLinkService,
    @Inject(SHARING_CONFIG) private readonly config: SharingConfig,
  ) {}

  /** CA-1, CA-4: `201` con el resumen y la URL, la única vez que se entrega. */
  @Post()
  @Header('Cache-Control', NO_STORE)
  async create(
    @CurrentActor() actor: Actor,
    @Body(new ZodValidationPipe(createPublicLinkSchema, invalidRequest))
    body: CreatePublicLinkRequest,
  ): Promise<CreatedPublicLink> {
    const { link, token } = await this.links.createLink(actor, body);
    return { link: toSummaryResponse(link), url: linkUrl(this.config.webPublicUrl, token) };
  }

  /** CA-7: el enlace sin revocar del archivo, vigente o vencido, sin la URL; `null` si no tiene. */
  @Get()
  @Header('Cache-Control', NO_STORE)
  async current(
    @CurrentActor() actor: Actor,
    @Query(new ZodValidationPipe(publicLinkQuerySchema, invalidRequest)) query: PublicLinkQuery,
  ): Promise<CurrentPublicLink> {
    const link = await this.links.currentLink(actor, query.fileId);
    return { link: link === null ? null : toSummaryResponse(link) };
  }

  /** CA-8: `204`; desde la siguiente petición el enlace deja de servir. También en solo lectura y en la papelera. */
  @Delete(':linkId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Header('Cache-Control', NO_STORE)
  async revoke(
    @CurrentActor() actor: Actor,
    @Param('linkId', linkIdPipe()) linkId: string,
  ): Promise<void> {
    await this.links.revokeLink(actor, linkId);
  }
}
