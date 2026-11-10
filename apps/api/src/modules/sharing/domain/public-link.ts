import type { PasswordHash } from '../../../shared/domain/password-hash.vo';

import { SharingInvalidRequestError } from './errors';
import { LinkToken } from './link-token';

/**
 * Vencimientos que se aceptan, en días (013 RN-2). Los mismos de `PUBLIC_LINK_EXPIRY_OPTIONS` de `@nimbo/contracts`,
 * que el dominio no importa (ADR-0008); la prueba los ata.
 */
export const PUBLIC_LINK_EXPIRY_DAYS = [1, 7, 30] as const;
export type PublicLinkExpiryDays = (typeof PUBLIC_LINK_EXPIRY_DAYS)[number];

/** Estado de un enlace sin revocar que ve su propietario (013 CA-7); los de `PUBLIC_LINK_STATUSES` del contrato. */
export const PUBLIC_LINK_STATUSES = ['active', 'expired'] as const;
export type PublicLinkStatus = (typeof PUBLIC_LINK_STATUSES)[number];

const DAY_MS = 24 * 60 * 60 * 1000;
const INVALID_EXPIRY = {
  field: 'expiresInDays',
  reason: 'INVALID_EXPIRY',
  message: 'Elige un vencimiento de 1, 7 o 30 días.',
} as const;

export interface PublicLinkSnapshot {
  readonly id: string;
  readonly fileId: string;
  readonly ownerId: string;
  /** `sha256` del token (`token_hash`); el token no se guarda (RN-3, DF-09). */
  readonly tokenHash: string;
  /** Argon2id en PHC, o `null` si el enlace no pide contraseña (RN-8, DF-10). */
  readonly passwordHash: PasswordHash | null;
  readonly expiresAt: Date;
  readonly createdAt: Date;
}

/** Datos para generar; `expiresInDays` llega sin validar contra RN-2. */
export interface CreatePublicLinkInput {
  readonly id: string;
  readonly fileId: string;
  readonly ownerId: string;
  readonly expiresInDays: number;
  readonly passwordHash: PasswordHash | null;
  readonly now: Date;
}

/** El enlace recién generado y su token, que solo se entrega esta vez (CA-1). */
export interface CreatedPublicLink {
  readonly link: PublicLink;
  readonly token: LinkToken;
}

const isExpiryDays = (days: number): days is PublicLinkExpiryDays =>
  (PUBLIC_LINK_EXPIRY_DAYS as readonly number[]).includes(days);

const expiryFrom = (now: Date, days: number): Date => {
  if (!isExpiryDays(days)) throw new SharingInvalidRequestError([INVALID_EXPIRY]);
  return new Date(now.getTime() + days * DAY_MS);
};

/** Enlace público a un archivo (`enlace_publico`, M3b, DF-86). Uno sin revocar por archivo (RN-3). */
export class PublicLink {
  private constructor(private readonly snapshot: PublicLinkSnapshot) {}

  /** CA-1, CA-2, CA-4, S-4: vence 1, 7 o 30 × 24 h después de `now`, con un token nuevo cada vez. */
  static create(input: CreatePublicLinkInput): CreatedPublicLink {
    const { expiresInDays, now, ...rest } = input;
    const expiresAt = expiryFrom(now, expiresInDays);
    const token = LinkToken.generate();
    const link = new PublicLink({ ...rest, tokenHash: token.hash(), expiresAt, createdAt: now });
    return { link, token };
  }

  static rehydrate(snapshot: PublicLinkSnapshot): PublicLink {
    return new PublicLink(snapshot);
  }

  get id(): string {
    return this.snapshot.id;
  }

  get requiresPassword(): boolean {
    return this.snapshot.passwordHash !== null;
  }

  /** CA-7: vencido desde el instante de `expiresAt`, igual que `vence_en > now()` de `enlace_por_token()`. */
  statusAt(now: Date): PublicLinkStatus {
    return now.getTime() < this.snapshot.expiresAt.getTime() ? 'active' : 'expired';
  }

  toSnapshot(): PublicLinkSnapshot {
    return { ...this.snapshot };
  }
}
