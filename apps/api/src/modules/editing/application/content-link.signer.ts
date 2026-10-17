import type { JwtService } from '@nestjs/jwt';

import type { IClock } from '../../../shared';

import { CONTENT_LINK_TTL_SECONDS } from './editing-config';

/** Algoritmo fijo: nunca se acepta el que diga la cabecera del token (plan §5). */
const ALGORITHM = 'HS256';
/** `typ` propio: un JWT de ONLYOFFICE firmado con la misma clave no vale como enlace (plan §5). */
const SESSION_TYPE = 'nimbo.edit-content';
const VERSION_TYPE = 'nimbo.view-content';
/**
 * Enlace del aviso de guardado (`callbackUrl`): ONLYOFFICE lo usa durante toda la sesión, que no tiene plazo propio
 * (RN-4), así que no vence a los minutos. Vale solo junto con un aviso firmado por ONLYOFFICE de la misma sesión y
 * mientras la sesión siga abierta (plan §4).
 */
const CALLBACK_TYPE = 'nimbo.edit-callback';
const MS_PER_SECOND = 1000;

export type ContentLink =
  | { readonly kind: 'session'; readonly sessionId: string; readonly ownerId: string }
  | {
      readonly kind: 'version';
      readonly fileId: string;
      readonly versionId: string;
      readonly ownerId: string;
    };

/** La sesión y la cuenta propietaria del aviso de guardado. */
export interface CallbackLink {
  readonly sessionId: string;
  readonly ownerId: string;
}

interface ContentClaims {
  readonly typ?: unknown;
  readonly sid?: unknown;
  readonly fid?: unknown;
  readonly vid?: unknown;
  readonly oid?: unknown;
}

const isText = (value: unknown): value is string => typeof value === 'string' && value !== '';

const toLink = (claims: ContentClaims): ContentLink | null => {
  if (!isText(claims.oid)) return null;
  if (claims.typ === SESSION_TYPE && isText(claims.sid)) {
    return { kind: 'session', sessionId: claims.sid, ownerId: claims.oid };
  }
  if (claims.typ === VERSION_TYPE && isText(claims.fid) && isText(claims.vid)) {
    return { kind: 'version', fileId: claims.fid, versionId: claims.vid, ownerId: claims.oid };
  }
  return null;
};

/**
 * Enlaces con que ONLYOFFICE lee el documento (plan 016 §4): sin token de usuario, así que llevan la cuenta
 * propietaria (`oid`) para actuar con `withActor(createActor(oid))` y la sesión (edición) o la versión (solo lectura).
 * Viven minutos (RNF-06). El reloj es el del dominio: un enlace se puede probar vencido sin esperar.
 */
export class ContentLinkSigner {
  constructor(
    private readonly jwt: JwtService,
    private readonly clock: IClock,
    private readonly secret: string,
  ) {}

  forSession(link: { sessionId: string; ownerId: string }): string {
    return this.sign({ typ: SESSION_TYPE, sid: link.sessionId, oid: link.ownerId });
  }

  forVersion(link: { fileId: string; versionId: string; ownerId: string }): string {
    return this.sign({
      typ: VERSION_TYPE,
      fid: link.fileId,
      vid: link.versionId,
      oid: link.ownerId,
    });
  }

  forCallback(link: CallbackLink): string {
    return this.jwt.sign(
      { typ: CALLBACK_TYPE, sid: link.sessionId, oid: link.ownerId },
      { secret: this.secret, algorithm: ALGORITHM },
    );
  }

  /** El enlace que el token describe; `null` si la firma, el tipo, el algoritmo o el plazo no valen. */
  verify(token: string): ContentLink | null {
    const claims = this.claimsOf(token);
    return claims === null ? null : toLink(claims);
  }

  /** La sesión del enlace de `callbackUrl`; `null` si la firma, el tipo o el algoritmo no valen. */
  verifyCallback(token: string): CallbackLink | null {
    const claims = this.claimsOf(token);
    if (claims?.typ !== CALLBACK_TYPE || !isText(claims.sid) || !isText(claims.oid)) return null;
    return { sessionId: claims.sid, ownerId: claims.oid };
  }

  private claimsOf(token: string): ContentClaims | null {
    try {
      return this.jwt.verify<ContentClaims & object>(token, {
        secret: this.secret,
        algorithms: [ALGORITHM],
        clockTimestamp: this.nowSeconds(),
      });
    } catch {
      return null;
    }
  }

  private sign(claims: Record<string, string>): string {
    const iat = this.nowSeconds();
    return this.jwt.sign(
      { ...claims, iat, exp: iat + CONTENT_LINK_TTL_SECONDS },
      { secret: this.secret, algorithm: ALGORITHM },
    );
  }

  private nowSeconds(): number {
    return Math.floor(this.clock.now().getTime() / MS_PER_SECOND);
  }
}

/** El firmante del `api`; `null` si ONLYOFFICE no está configurado (sin clave no hay enlaces, CA-15). */
export const CONTENT_LINK_SIGNER = Symbol('ContentLinkSigner');
