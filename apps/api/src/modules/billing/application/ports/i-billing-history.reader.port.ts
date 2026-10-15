import type { Actor } from '../../../../shared';

/** Plan actual del cliente (CA-7): `expiresAt` nulo en Personal. */
export interface CurrentPlan {
  readonly planName: string;
  readonly expiresAt: Date | null;
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

export interface BillingHistory {
  readonly subscription: CurrentPlan | null;
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
  /** Plan actual y pagos del actor, del más reciente al más antiguo. */
  read(actor: Actor): Promise<BillingHistory>;
  /** La factura del actor con PDF; `null` si no existe, es ajena o aún no tiene PDF. */
  findDownloadable(actor: Actor, invoiceId: string): Promise<DownloadableInvoice | null>;
}

export const I_BILLING_HISTORY_READER = Symbol('IBillingHistoryReader');
