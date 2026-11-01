import { Body, Controller, Header, Inject, Post } from '@nestjs/common';
import { createPublicLinkSchema } from '@nimbo/contracts';
import type {
  CreatedPublicLink,
  CreatePublicLinkRequest,
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

import { NO_STORE } from './sharing-http.constants';

/** Ruta de `web` de la página pública (la construye la 013b); el token va en el fragmento, que no viaja al servidor. */
const PUBLIC_LINK_WEB_PATH = '/enlace';
const TRAILING_SLASHES = /\/+$/;

/** CA-2: un vencimiento o una contraseña inválidos son `422` con `fields`. */
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
 * token `401` (CA-16). Mapea y delega; las reglas viven en `PublicLinkService`. La respuesta lleva el token: `no-store`.
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
}
