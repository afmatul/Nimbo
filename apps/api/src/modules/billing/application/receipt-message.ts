import { formatGtq } from '@nimbo/contracts';

import type { MailAttachment, MailMessage } from '../../notifications';

import { billingMail } from './mail-message';
import { INVOICE_CONTENT_TYPE } from './ports/i-invoice-generator.port';
import type { IssuableInvoice } from './ports/i-invoice-repository.port';

const RECEIPT_TAG = 'billing.receipt';

/** Líneas del comprobante: número de factura, plan, referencia del pago y total (CA-6). */
const receiptLines = ({ document }: IssuableInvoice): readonly string[] => [
  `Recibimos tu pago del plan ${document.planName}.`,
  `Factura: ${document.number}`,
  `Referencia del pago: ${document.paymentReference}`,
  `Total: ${formatGtq(document.totalCents)}`,
  'Adjuntamos la factura en PDF; también puedes descargarla desde Plan y facturación.',
];

/**
 * Correo del comprobante (spec 009 CA-6, decisión 4) con la clave `billing.receipt.<transaccion_id>` (el `jobId` de la
 * cola `mail`). No se duplica aunque el reintento lo vuelva a encolar (p. ej. si se encoló y falló marcar el aviso):
 * `MailProcessor` guarda la marca `mail:sent:<jobId>` 7 días al entregar y salta un trabajo con la misma clave
 * (`mail.duplicate_skipped`; `test/int/notifications/mailer-contract.int-spec.ts`). Va al correo guardado en la factura
 * con la factura PDF adjunta: los mismos bytes que se suben para `GET /billing/invoices/:id/download`.
 */
export function receiptMessage(invoice: IssuableInvoice, userId: string, pdf: Buffer): MailMessage {
  const message = billingMail({
    to: invoice.document.receiptEmail,
    recipientId: userId,
    subject: `Tu comprobante de pago ${invoice.document.number}`,
    lines: receiptLines(invoice),
    tag: RECEIPT_TAG,
    key: invoice.paymentId,
  });
  return { ...message, attachment: invoiceAttachment(invoice.document.number, pdf) };
}

const invoiceAttachment = (invoiceNumber: string, pdf: Buffer): MailAttachment => ({
  filename: `factura-${invoiceNumber}.pdf`,
  contentType: INVOICE_CONTENT_TYPE,
  contentBase64: pdf.toString('base64'),
});
