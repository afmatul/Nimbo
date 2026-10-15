import { formatGtq } from '@nimbo/contracts';

import type { MailMessage } from '../../notifications';

import type { IssuableInvoice } from './ports/i-invoice-repository.port';

const RECEIPT_TAG = 'billing.receipt';
const HTML_ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char);

/** Líneas del comprobante: número de factura, plan, referencia del pago y total (CA-6). */
const receiptLines = ({ document }: IssuableInvoice): readonly string[] => [
  `Recibimos tu pago del plan ${document.planName}.`,
  `Factura: ${document.number}`,
  `Referencia del pago: ${document.paymentReference}`,
  `Total: ${formatGtq(document.totalCents)}`,
  'Puedes descargar la factura en PDF desde Mi suscripción.',
];

/**
 * Correo del comprobante (spec 009 CA-6, decisión 4): la clave `billing.receipt.<transaccion_id>` hace que el reintento
 * no duplique el correo (es el `jobId` de la cola `mail`). Va al correo guardado en la factura.
 */
export function receiptMessage(invoice: IssuableInvoice, userId: string): MailMessage {
  const lines = receiptLines(invoice);
  return {
    to: invoice.document.receiptEmail,
    subject: `Tu comprobante de pago ${invoice.document.number}`,
    text: lines.join('\n'),
    html: lines.map((line) => `<p>${escapeHtml(line)}</p>`).join(''),
    idempotencyKey: `${RECEIPT_TAG}.${invoice.paymentId}`,
    tag: RECEIPT_TAG,
    recipientId: userId,
  };
}
