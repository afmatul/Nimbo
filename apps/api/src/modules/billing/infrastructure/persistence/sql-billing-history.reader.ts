import { Inject, Injectable } from '@nestjs/common';

import { TransactionContext } from '../../../../shared';
import type { Actor } from '../../../../shared';
import type {
  BillingHistoryRows,
  CurrentSubscription,
  DownloadableInvoice,
  IBillingHistoryReader,
  PaymentMethod,
  PaymentRecord,
} from '../../application/ports/i-billing-history.reader.port';

const CURRENT_SUBSCRIPTION_SQL = 'SELECT plan_id, vence_en FROM suscripcion WHERE usuario_id = $1';
const PAYMENT_METHOD_SQL = `SELECT marca_tarjeta, tarjeta_ultimos4 FROM transaccion
  WHERE usuario_id = $1 AND estado = 'aprobada'
  ORDER BY creado_en DESC, id DESC LIMIT 1`;
const BILLING_DETAILS_SQL = `SELECT nit, correo_comprobante FROM factura
  WHERE usuario_id = $1 ORDER BY creado_en DESC, id DESC LIMIT 1`;
const PAYMENTS_SQL = `SELECT t.id, t.creado_en, t.referencia, p.nombre AS plan, t.monto_centavos, t.estado,
    f.id AS factura_id, f.numero, f.clave_objeto
  FROM transaccion t JOIN plan p ON p.id = t.plan_id LEFT JOIN factura f ON f.transaccion_id = t.id
  WHERE t.usuario_id = $1
  ORDER BY t.creado_en DESC, t.id DESC`;
const DOWNLOADABLE_SQL = `SELECT numero, clave_objeto FROM factura
  WHERE id = $1 AND usuario_id = $2 AND clave_objeto IS NOT NULL`;

interface CurrentSubscriptionRow {
  readonly plan_id: string;
  readonly vence_en: Date | null;
}

interface PaymentMethodRow {
  readonly marca_tarjeta: string;
  readonly tarjeta_ultimos4: string;
}

interface PaymentRow {
  readonly id: string;
  readonly creado_en: Date;
  readonly referencia: string;
  readonly plan: string;
  readonly monto_centavos: number;
  readonly estado: PaymentRecord['status'];
  readonly factura_id: string | null;
  readonly numero: string | null;
  readonly clave_objeto: string | null;
}

const toSubscription = (row: CurrentSubscriptionRow): CurrentSubscription => ({
  planId: row.plan_id,
  expiresAt: row.vence_en,
});

const toPaymentMethod = (row: PaymentMethodRow): PaymentMethod => ({
  brand: row.marca_tarjeta,
  last4: row.tarjeta_ultimos4,
});

const toPaymentRecord = (row: PaymentRow): PaymentRecord => ({
  id: row.id,
  createdAt: row.creado_en,
  reference: row.referencia,
  planName: row.plan,
  amountCents: row.monto_centavos,
  status: row.estado,
  invoice:
    row.factura_id === null || row.numero === null
      ? null
      : { id: row.factura_id, number: row.numero, objectKey: row.clave_objeto },
});

/**
 * `IBillingHistoryReader` sobre Postgres (spec 009 CA-7, CA-8). Usa `requireActorScope(actor)`: las políticas de
 * lectura de `suscripcion`, `transaccion` y `factura` ya limitan al dueño, y el `WHERE usuario_id` lo repite para que
 * el plan no dependa solo de RLS (defensa en profundidad, RNF-05).
 */
@Injectable()
export class SqlBillingHistoryReader implements IBillingHistoryReader {
  constructor(@Inject(TransactionContext) private readonly context: TransactionContext) {}

  async read(actor: Actor): Promise<BillingHistoryRows> {
    const manager = this.context.requireActorScope(actor);
    const first = async <T>(sql: string): Promise<T | undefined> =>
      ((await manager.query(sql, [actor.id])) as T[])[0];
    const subscription = await first<CurrentSubscriptionRow>(CURRENT_SUBSCRIPTION_SQL);
    const method = await first<PaymentMethodRow>(PAYMENT_METHOD_SQL);
    const details = await first<{ nit: string; correo_comprobante: string }>(BILLING_DETAILS_SQL);
    const payments = (await manager.query(PAYMENTS_SQL, [actor.id])) as PaymentRow[];
    return {
      subscription: subscription === undefined ? null : toSubscription(subscription),
      paymentMethod: method === undefined ? null : toPaymentMethod(method),
      billingDetails:
        details === undefined
          ? null
          : { nit: details.nit, receiptEmail: details.correo_comprobante },
      payments: payments.map(toPaymentRecord),
    };
  }

  async findDownloadable(actor: Actor, invoiceId: string): Promise<DownloadableInvoice | null> {
    const [row] = (await this.context
      .requireActorScope(actor)
      .query(DOWNLOADABLE_SQL, [invoiceId, actor.id])) as {
      numero: string;
      clave_objeto: string;
    }[];
    return row === undefined ? null : { number: row.numero, objectKey: row.clave_objeto };
  }
}
