/** La fila de `enlace_por_token()`: solo los tres identificadores del enlace disponible (ADR-0039 regla 1). */
export interface ResolvedPublicLink {
  readonly linkId: string;
  readonly fileId: string;
  readonly ownerId: string;
}

/**
 * Único acceso a `enlace_publico` sin actor (plan 013 §2, ADR-0039; separado por ISP como `IExpiredUploadScanner`,
 * `architecture.md` §6 punto 6). Traduce el hash de un token a su enlace no revocado ni vencido, o `null`. Solo lo
 * inyecta `PublicLinkAccessService`: no se exporta desde `sharing/index.ts`.
 */
export interface IPublicLinkResolver {
  resolve(tokenHash: string): Promise<ResolvedPublicLink | null>;
}

export const I_PUBLIC_LINK_RESOLVER = Symbol('IPublicLinkResolver');
