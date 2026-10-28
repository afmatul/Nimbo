import type { Actor } from '../../../../shared';
import type { SubscriptionStatus } from '../../domain/entities/subscription.entity';

/**
 * Límites y vigencia de la suscripción de un cliente (011b HU-5, CA-1): el extra y su fecha son los vigentes, uno
 * vencido se ve como `0n` y `null` (RN-1); el total es `plan + extra`. Personal no vence (`expiresAt` nulo).
 */
export interface SubscriptionLimits {
  readonly planName: string;
  readonly isPersonal: boolean;
  readonly status: SubscriptionStatus;
  readonly expiresAt: Date | null;
  readonly planQuotaBytes: bigint;
  readonly extraQuotaBytes: bigint;
  readonly extraQuotaUntil: Date | null;
  readonly usedBytes: bigint;
  readonly totalQuotaBytes: bigint;
}

/** El extra que reemplaza al anterior y el instante en que deja de regir; `0n` y `null` lo quitan (RN-1). */
export interface QuotaChange {
  readonly clientId: string;
  readonly extraBytes: bigint;
  readonly until: Date | null;
}

/** El `vence_en` nuevo de la vigencia (RN-2). */
export interface ValidityChange {
  readonly clientId: string;
  readonly expiresAt: Date;
}

/**
 * La vista tras extender la vigencia y si la cuenta salió de solo lectura (`subscription.read_only_exited`, 010). Solo
 * se extiende un plan de pago (Personal se rechaza), así que `expiresAt` es el `vence_en` nuevo y nunca es nulo.
 */
export interface ValidityAdjustment {
  readonly limits: SubscriptionLimits & { readonly expiresAt: Date };
  readonly exitedReadOnly: boolean;
}

/**
 * Lectura y ajustes de `suscripcion` del Administrador (011b plan §2, §3; ADR-0035): llaman a `limites_de_cuenta`,
 * `ajustar_cuota_extra` y `extender_vigencia`, que comprueban el rol, bloquean y validan dentro; el repositorio traduce
 * sus códigos de resultado a errores de dominio (plan §4). Se llaman dentro de `withActor(actor, …)`.
 */
export interface ISubscriptionAdministrationRepository {
  /** `null` si la cuenta no tiene suscripción (o no es de un cliente: `AccountDirectory` ya dio el `404`). */
  limitsOf(actor: Actor, clientId: string): Promise<SubscriptionLimits | null>;
  adjustQuota(actor: Actor, change: QuotaChange): Promise<SubscriptionLimits>;
  adjustValidity(actor: Actor, change: ValidityChange): Promise<ValidityAdjustment>;
}

export const I_SUBSCRIPTION_ADMINISTRATION_REPOSITORY = Symbol(
  'ISubscriptionAdministrationRepository',
);
