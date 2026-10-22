import { Inject, Injectable } from '@nestjs/common';

import { TransactionContext } from '../../../../shared';
import type { Actor } from '../../../../shared';
import type {
  BillingHistoryRows,
  DownloadableInvoice,
  IBillingHistoryReader,
  PaymentMethod,
  PaymentRecord,
} from '../../application/ports/i-billing-history.reader.port';

import { lastApprovedPaymentSql, latestInvoiceSql } from './latest-rows.sql';

/** Sin `referencia_instrumento` (ADR-0031): la vista nunca la lee. */
const PAYMENT_METHOD_SQL = lastApprovedPaymentSql('marca_tarjeta, tarjeta_ultimos4');
const BILLING_DETAILS_SQL = latestInvoiceSql('nit, correo_comprobante');
const PAYMENTS_SQL = `SELECT t.id, t.creado_en, t.referencia, p.nombre AS plan, t.monto_centavos, t.estado,
    f.id AS factura_id, f.numero, f.clave_objeto
  FROM transaccion t JOIN plan p ON p.id = t.plan_id LEFT JOIN factura f ON f.transaccion_id = t.id
  WHERE t.usuario_id = $1
  ORDER BY t.creado_en DESC, t.id DESC`;
const DOWNLOADABLE_SQL = `SELECT numero, clave_objeto FROM factura
  WHERE id = $1 AND usuario_id = $2 AND clave_objeto IS NOT NULL`;

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
    const details = await first<{ nit: string; correo_comprobante: string }>(BILLING_DETAILS_SQL);
    const payments = (await manager.query(PAYMENTS_SQL, [actor.id])) as PaymentRow[];
    return {
      paymentMethod: await this.findPaymentMethod(actor),
      billingDetails:
        details === undefined
          ? null
          : { nit: details.nit, receiptEmail: details.correo_comprobante },
      payments: payments.map(toPaymentRecord),
    };
  }

  async findPaymentMethod(actor: Actor): Promise<PaymentMethod | null> {
    const [row] = (await this.context
      .requireActorScope(actor)
      .query(PAYMENT_METHOD_SQL, [actor.id])) as PaymentMethodRow[];
    return row === undefined ? null : toPaymentMethod(row);
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
