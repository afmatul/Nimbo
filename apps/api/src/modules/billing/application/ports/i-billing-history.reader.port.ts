import type { Actor } from '../../../../shared';

/** Tarjeta del último pago aprobado: solo marca y últimos 4 (RN-9). */
export interface PaymentMethod {
  readonly brand: string;
  readonly last4: string;
}

/** Un pago del historial con su factura, si se aprobó (CA-7). */
export interface PaymentRecord {
  readonly id: string;
  readonly createdAt: Date;
  readonly reference: string;
  readonly planName: string;
  readonly amountCents: number;
  readonly status: 'aprobada' | 'rechazada';
  readonly invoice: {
    readonly id: string;
    readonly number: string;
    readonly objectKey: string | null;
  } | null;
}

/** NIT y correo de la última factura (CA-7, «Datos de facturación» del mockup). */
export interface BillingDetails {
  readonly nit: string;
  readonly receiptEmail: string;
}

/**
 * Lo que lee el adaptador: la tarjeta, los datos de la última factura y los pagos. La suscripción la lee
 * `ISubscriptionRepository.findCurrent` (010, una sola lectura de la fila).
 */
export interface BillingHistoryRows {
  readonly paymentMethod: PaymentMethod | null;
  readonly billingDetails: BillingDetails | null;
  readonly payments: readonly PaymentRecord[];
}

/** Lo que hace falta para firmar la descarga (CA-8): la clave del PDF y el número para el nombre del archivo. */
export interface DownloadableInvoice {
  readonly number: string;
  readonly objectKey: string;
}

/**
 * Lecturas del historial bajo RLS forzado (spec 009 CA-7 y CA-8): toma el `EntityManager` de
 * `requireActorScope(actor)`, así que se llama dentro de `withActor` y solo ve lo del propio cliente.
 */
export interface IBillingHistoryReader {
  /** Tarjeta, datos de facturación y pagos del actor (los pagos del más reciente al más antiguo). */
  read(actor: Actor): Promise<BillingHistoryRows>;
  /** 010 CA-25: marca y últimos 4 del último pago aprobado, sin la referencia del instrumento (ADR-0031). */
  findPaymentMethod(actor: Actor): Promise<PaymentMethod | null>;
  /** La factura del actor con PDF; `null` si no existe, es ajena o aún no tiene PDF. */
  findDownloadable(actor: Actor, invoiceId: string): Promise<DownloadableInvoice | null>;
}

export const I_BILLING_HISTORY_READER = Symbol('IBillingHistoryReader');
