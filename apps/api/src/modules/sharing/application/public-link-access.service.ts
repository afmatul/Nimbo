import { createHash } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

import {
  createActor,
  I_RATE_LIMITER,
  I_TRANSACTION_RUNNER,
  RateLimitExceededError,
  Role,
} from '../../../shared';
import type { Actor, IRateLimiter, ITransactionRunner } from '../../../shared';
import { LinkedFileGateway } from '../../storage';
import type { LinkedFile } from '../../storage';
import { PublicLinkUnavailableError } from '../domain/errors';
import { limitNetworkOf } from '../domain/limit-network';
import { LinkToken } from '../domain/link-token';
import type { PublicLink } from '../domain/public-link';

import { I_PUBLIC_LINK_RESOLVER } from './ports/i-public-link-resolver.port';
import type { IPublicLinkResolver, ResolvedPublicLink } from './ports/i-public-link-resolver.port';
import { I_PUBLIC_LINK_REPOSITORY } from './ports/i-public-link.repository.port';
import type { IPublicLinkRepository } from './ports/i-public-link.repository.port';
import { I_SHAREE_DIRECTORY } from './ports/i-sharee-directory.port';
import type { IShareeDirectory } from './ports/i-sharee-directory.port';
import { SHARING_CONFIG } from './sharing-config';
import type { SharingConfig } from './sharing-config';
import type { SharingLogger } from './sharing-logger';

const RATE_LIMIT_WINDOW_SECONDS = 60;
/** Clave del límite por red de las rutas del visitante (plan §5): el hash de la red, nunca la IP (S-3). */
const NETWORK_RATE_KEY_PREFIX = 'sharing:link-ip:';

/** Lo único que trae la petición del visitante (ADR-0039 regla 3): ningún id. */
export interface OpenPublicLinkCommand {
  readonly token: string;
  /** `req.ip`, ya resuelto con `trust proxy` (001); solo cuenta su red para el límite y no se registra. */
  readonly ip: string;
}

/** Ficha del archivo de un enlace (CA-9): sin ids, carpeta ni correo. */
export interface PublicLinkDetails {
  readonly name: string;
  readonly sizeBytes: bigint;
  readonly sharedBy: { readonly displayName: string };
  readonly expiresAt: Date;
  readonly requiresPassword: boolean;
}

/** El enlace disponible releído como el propietario, con su archivo y quien lo comparte. */
interface AvailableLink {
  readonly link: PublicLink;
  readonly file: LinkedFile;
  readonly sharedBy: string;
}

/** Lo que se resuelve sin actor: sin fila, el token no sirve; sin nombre, el propietario no está activo. */
type ResolvedOwner =
  | { readonly row: null; readonly sharedBy: null }
  | { readonly row: ResolvedPublicLink; readonly sharedBy: string | null };

const networkKeyOf = (ip: string): string =>
  `${NETWORK_RATE_KEY_PREFIX}${createHash('sha256').update(limitNetworkOf(ip)).digest('hex')}`;

const detailsOf = ({ link, file, sharedBy }: AvailableLink): PublicLinkDetails => ({
  name: file.name,
  sizeBytes: file.sizeBytes,
  sharedBy: { displayName: sharedBy },
  expiresAt: link.toSnapshot().expiresAt,
  requiresPassword: link.requiresPassword,
});

/**
 * Casos de uso del visitante de un enlace público, sin sesión (M3b, plan 013 §1; excepción nombrada de
 * `architecture.md` §6 punto 11, ADR-0039). No recibe `actor`: el enlace, el archivo y el propietario salen solo de la
 * fila de `enlace_por_token()`. El actor derivado del propietario existe solo aquí dentro, se crea después de confirmar
 * un cliente activo y no se devuelve ni se guarda. Todo motivo de CA-11 es el mismo `PublicLinkUnavailableError`.
 */
@Injectable()
export class PublicLinkAccessService {
  constructor(
    @Inject(I_TRANSACTION_RUNNER) private readonly transactions: ITransactionRunner,
    @Inject(I_PUBLIC_LINK_RESOLVER) private readonly resolver: IPublicLinkResolver,
    @Inject(I_SHAREE_DIRECTORY)
    private readonly directory: Pick<IShareeDirectory, 'activeDisplayName'>,
    @Inject(I_PUBLIC_LINK_REPOSITORY)
    private readonly links: Pick<IPublicLinkRepository, 'findAvailable'>,
    @Inject(LinkedFileGateway) private readonly files: Pick<LinkedFileGateway, 'findOwnedFile'>,
    @Inject(I_RATE_LIMITER) private readonly rateLimiter: IRateLimiter,
    @Inject(SHARING_CONFIG)
    private readonly config: Pick<SharingConfig, 'publicLinkRequestsPerMinute'>,
    @Inject(PinoLogger) private readonly logger: SharingLogger,
  ) {}

  /** CA-9, CA-11, CA-14: la ficha del archivo del enlace; con el propietario en solo lectura sigue sirviendo. */
  async openLink(command: OpenPublicLinkCommand): Promise<PublicLinkDetails> {
    return detailsOf(await this.resolveAvailable(command));
  }

  /**
   * Plan §2 y §5: límite por red → token bien formado → `enlace_por_token(hash)` → propietario activo → actor derivado
   * → enlace (`findAvailable`) y archivo (`findOwnedFile`) con los ids de la fila, con RLS. Cualquier `null` es el 404.
   */
  private async resolveAvailable({ token, ip }: OpenPublicLinkCommand): Promise<AvailableLink> {
    await this.assertWithinRate(ip);
    if (!LinkToken.isWellFormed(token)) throw this.unavailable();
    const { row, sharedBy } = await this.transactions.run(() => this.resolveOwner(token));
    if (row === null) throw this.unavailable();
    if (sharedBy === null) throw this.unavailable(row);
    const owner = createActor(row.ownerId, Role.CLIENT);
    const found = await this.transactions.withActor(owner, () => this.readAsOwner(owner, row));
    if (found === null) throw this.unavailable(row);
    return { ...found, sharedBy };
  }

  /** Lo único sin actor (ADR-0039 reglas 1 y 2): la fila de la función y el nombre del propietario si está activo. */
  private async resolveOwner(token: string): Promise<ResolvedOwner> {
    const row = await this.resolver.resolve(LinkToken.hashOf(token));
    if (row === null) return { row, sharedBy: null };
    return { row, sharedBy: await this.directory.activeDisplayName(row.ownerId) };
  }

  /** ADR-0039 regla 3: el enlace (clave y vencimiento) y el archivo vivo, releídos con RLS como el propietario. */
  private async readAsOwner(
    owner: Actor,
    row: ResolvedPublicLink,
  ): Promise<Omit<AvailableLink, 'sharedBy'> | null> {
    const link = await this.links.findAvailable(owner, row.linkId);
    if (link === null) return null;
    const file = await this.files.findOwnedFile(owner, row.fileId);
    return file === null ? null : { link, file };
  }

  /** CA-14: antes de mirar el token, así el `429` no revela nada; nunca dice cuántos quedan. */
  private async assertWithinRate(ip: string): Promise<void> {
    const decision = await this.rateLimiter.consume(networkKeyOf(ip), [
      { limit: this.config.publicLinkRequestsPerMinute, windowSeconds: RATE_LIMIT_WINDOW_SECONDS },
    ]);
    if (decision.allowed) return;
    this.logger.warn({ event: 'sharing.rate_limited' });
    throw new RateLimitExceededError(decision.retryAfterSeconds);
  }

  /** CA-11: el mismo error para todos los motivos; la bitácora solo lleva los ids si hubo fila (CA-15). */
  private unavailable(row?: ResolvedPublicLink): PublicLinkUnavailableError {
    const ids = row === undefined ? {} : { linkId: row.linkId, fileId: row.fileId };
    this.logger.info({ event: 'public_link.unavailable', ...ids });
    return new PublicLinkUnavailableError();
  }
}
