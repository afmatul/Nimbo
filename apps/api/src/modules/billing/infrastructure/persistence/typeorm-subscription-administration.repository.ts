import { Inject, Injectable } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';

import { InsufficientRoleError, TransactionContext } from '../../../../shared';
import type { Actor } from '../../../../shared';
import { AccountNotFoundError } from '../../../identity';
import type {
  ISubscriptionAdministrationRepository,
  QuotaChange,
  SubscriptionLimits,
  ValidityChange,
} from '../../application/ports/i-subscription-administration.repository.port';
import type { SubscriptionStatus } from '../../domain/entities/subscription.entity';
import { BillingInvariantError } from '../../domain/errors/billing-invariant.error';
import { QuotaBelowUsageError } from '../../domain/errors/quota-below-usage.error';
import { QuotaInvalidError } from '../../domain/errors/quota-invalid.error';
import { ValidityNotExtendedError } from '../../domain/errors/validity-not-extended.error';
import { PERSONAL_PLAN_SLUG } from '../../domain/plan-slug';

import { onlyRow } from './only-row';

const LIMITS_SQL = 'SELECT * FROM limites_de_cuenta($1::uuid)';
const ADJUST_QUOTA_SQL = 'SELECT * FROM ajustar_cuota_extra($1::uuid, $2::bigint, $3::timestamptz)';
const EXTEND_VALIDITY_SQL = 'SELECT * FROM extender_vigencia($1::uuid, $2::timestamptz)';

/** `RAISE` de las funciones (plan §4): rol distinto de `ADMIN` y conteo de filas que no cuadra. */
const INSUFFICIENT_PRIVILEGE = '42501';
const CARDINALITY_VIOLATION = '21000';

/** La vista de límites de las tres funciones (plan §3): `pg` entrega `bigint` como texto. */
interface LimitsRow {
  readonly plan_slug: string;
  readonly plan_nombre: string;
  readonly cuota_plan: string;
  readonly estado: SubscriptionStatus;
  readonly vence_en: Date | null;
  readonly extra: string;
  readonly hasta: Date | null;
  readonly espacio_usado: string;
  readonly cuota_total: string;
}

/** Fila de una función de escritura: el código y la vista (en `NULL` sin cuenta o sin suscripción). */
interface AdjustmentRow extends LimitsRow {
  readonly codigo: string;
}

/** Cómo se traduce cada código distinto de `ok` (plan §4); un código ausente es un invariante roto. */
type Rejections = Readonly<Partial<Record<string, (row: AdjustmentRow) => Error>>>;

const OK = 'ok';

const toLimits = (row: LimitsRow): SubscriptionLimits => ({
  planName: row.plan_nombre,
  isPersonal: row.plan_slug === PERSONAL_PLAN_SLUG,
  status: row.estado,
  expiresAt: row.vence_en,
  planQuotaBytes: BigInt(row.cuota_plan),
  extraQuotaBytes: BigInt(row.extra),
  extraQuotaUntil: row.hasta,
  usedBytes: BigInt(row.espacio_usado),
  totalQuotaBytes: BigInt(row.cuota_total),
});

/** El total resultante es el pedido, `plan + extra`, no el vigente (CA-2). */
const quotaRejections = (change: QuotaChange): Rejections => ({
  quota_invalid: () => new QuotaInvalidError('invalid'),
  no_subscription: () => new QuotaInvalidError('no_subscription'),
  quota_below_usage: (row) =>
    new QuotaBelowUsageError(BigInt(row.espacio_usado), BigInt(row.cuota_plan) + change.extraBytes),
  account_not_found: () => new AccountNotFoundError(),
});

const VALIDITY_REJECTIONS: Rejections = {
  validity_not_extended: () => new ValidityNotExtendedError('not_later'),
  personal: () => new ValidityNotExtendedError('personal'),
  no_subscription: () => new ValidityNotExtendedError('no_subscription'),
  account_not_found: () => new AccountNotFoundError(),
};

const outcomeOf = (row: AdjustmentRow, rejections: Rejections): SubscriptionLimits => {
  if (row.codigo === OK) return toLimits(row);
  const rejection = rejections[row.codigo];
  if (rejection === undefined) {
    throw new BillingInvariantError(`Código de ajuste desconocido: ${row.codigo}.`);
  }
  throw rejection(row);
};

const sqlStateOf = (error: unknown): unknown =>
  error instanceof QueryFailedError ? (error.driverError as { code?: unknown }).code : undefined;

/** Los `RAISE` de las funciones a su error; cualquier otro fallo de la base sigue igual. */
const translated = (error: unknown): unknown => {
  const state = sqlStateOf(error);
  if (state === INSUFFICIENT_PRIVILEGE) return new InsufficientRoleError();
  if (state === CARDINALITY_VIOLATION) {
    return new BillingInvariantError('Un ajuste de suscripción no afectó exactamente una fila.');
  }
  return error;
};

/**
 * `ISubscriptionAdministrationRepository` sobre las funciones `SECURITY DEFINER` de ADR-0035 (011b plan §3), con el
 * actor en la sesión. La función es la fuente de verdad de las reglas; aquí solo se traducen sus códigos (plan §4).
 */
@Injectable()
export class TypeOrmSubscriptionAdministrationRepository implements ISubscriptionAdministrationRepository {
  constructor(@Inject(TransactionContext) private readonly context: TransactionContext) {}

  async limitsOf(actor: Actor, clientId: string): Promise<SubscriptionLimits | null> {
    const [row] = await this.call<LimitsRow>(actor, LIMITS_SQL, [clientId]);
    return row === undefined ? null : toLimits(row);
  }

  async adjustQuota(actor: Actor, change: QuotaChange): Promise<SubscriptionLimits> {
    const params = [change.clientId, change.extraBytes.toString(), change.until];
    const rows = await this.call<AdjustmentRow>(actor, ADJUST_QUOTA_SQL, params);
    return outcomeOf(onlyRow(rows), quotaRejections(change));
  }

  async adjustValidity(actor: Actor, change: ValidityChange): Promise<SubscriptionLimits> {
    const params = [change.clientId, change.expiresAt];
    const rows = await this.call<AdjustmentRow>(actor, EXTEND_VALIDITY_SQL, params);
    return outcomeOf(onlyRow(rows), VALIDITY_REJECTIONS);
  }

  private async call<T>(actor: Actor, sql: string, params: readonly unknown[]): Promise<T[]> {
    try {
      return (await this.context.requireActorScope(actor).query(sql, [...params])) as T[];
    } catch (error: unknown) {
      throw translated(error);
    }
  }
}
