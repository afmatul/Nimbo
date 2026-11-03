import { Body, Controller, Header, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { publicLinkOpenSchema } from '@nimbo/contracts';
import type {
  PublicLinkDetails as PublicLinkDetailsResponse,
  PublicLinkOpenRequest,
} from '@nimbo/contracts';

import { Public, ZodValidationPipe } from '../../../shared';
import type { DomainError } from '../../../shared';
import { PublicLinkAccessService } from '../application/public-link-access.service';
import type { PublicLinkDetails } from '../application/public-link-access.service';
import { PublicLinkUnavailableError } from '../domain/errors';

import { NO_STORE } from './sharing-http.constants';

/** El visitante llega desde la página pública: el `Referer` nunca debe llevarse la URL con el token (spec §5). */
const NO_REFERRER = 'no-referrer';
/** Sin `req.ip` (conexión ya cerrada), todas esas peticiones comparten una sola red para el límite. */
const UNKNOWN_IP = '';

/** Lo único que se lee de la petición: la IP de Express, ya resuelta con `trust proxy` (001). */
interface VisitorRequest {
  readonly ip?: string | undefined;
}

/** Plan D-4: todo cuerpo que no cumple el esquema `.strict()`, también con un campo de más, es el 404 de CA-11. */
const unavailableBody = (): DomainError => new PublicLinkUnavailableError();

const toDetailsResponse = (details: PublicLinkDetails): PublicLinkDetailsResponse => ({
  name: details.name,
  sizeBytes: Number(details.sizeBytes),
  sharedBy: { displayName: details.sharedBy.displayName },
  expiresAt: details.expiresAt.toISOString(),
  requiresPassword: details.requiresPassword,
});

/**
 * Rutas del visitante de un enlace público (plan 013 §4): `@Public()`, no leen la sesión y responden igual con o sin
 * ella (CA-16). Mapean y delegan en `PublicLinkAccessService`; solo pasan el token y la IP, ningún id (ADR-0039).
 */
@Public()
@Controller('public-links')
export class PublicLinkAccessController {
  constructor(private readonly access: PublicLinkAccessService) {}

  /** CA-9, CA-11, CA-14: `200` con la ficha; cualquier motivo de no disponible, el mismo `404`. */
  @Post('open')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', NO_STORE)
  @Header('Referrer-Policy', NO_REFERRER)
  async open(
    @Req() req: VisitorRequest,
    @Body(new ZodValidationPipe(publicLinkOpenSchema, unavailableBody)) body: PublicLinkOpenRequest,
  ): Promise<PublicLinkDetailsResponse> {
    const details = await this.access.openLink({ token: body.token, ip: req.ip ?? UNKNOWN_IP });
    return toDetailsResponse(details);
  }
}
