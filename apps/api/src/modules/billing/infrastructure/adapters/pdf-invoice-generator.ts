import { Injectable } from '@nestjs/common';
import { formatGtq } from '@nimbo/contracts';
import PDFDocument from 'pdfkit';

import { formatBillingDate } from '../../application/billing-date';
import type {
  IInvoiceGenerator,
  InvoiceDocument,
} from '../../application/ports/i-invoice-generator.port';

/** Fuentes estándar de PDF en WinAnsi: tildes, «ñ», «¿» y «¡» sin archivos de fuente (ADR-0028). */
const REGULAR = 'Helvetica';
const BOLD = 'Helvetica-Bold';
const MARGIN = 56;

/** Filas de la factura: etiqueta y valor, en el orden del mockup de suscripción. */
const detailRows = (document: InvoiceDocument): readonly (readonly [string, string])[] => [
  ['Fecha', formatBillingDate(document.issuedAt)],
  ['Plan', document.planName],
  ['Referencia del pago', document.paymentReference],
  ['NIT', document.nit],
  ['Correo', document.receiptEmail],
];

const amountRows = (document: InvoiceDocument): readonly (readonly [string, string])[] => [
  ['Subtotal', formatGtq(document.subtotalCents)],
  ['IVA (12 %)', formatGtq(document.vatCents)],
  ['Total', formatGtq(document.totalCents)],
];

/**
 * `IInvoiceGenerator` con `pdfkit` (spec 009 CA-6; ADR-0028): una página, sin imágenes ni fuentes externas. Es el único
 * archivo que importa `pdfkit`. La fecha del documento es la del pago, nunca la del sistema: los mismos datos dan los
 * mismos bytes, así el PDF que repone `invoice-retry` es igual al original.
 */
@Injectable()
export class PdfInvoiceGenerator implements IInvoiceGenerator {
  generate(document: InvoiceDocument): Promise<Buffer> {
    const pdf = new PDFDocument({
      size: 'A4',
      margin: MARGIN,
      info: {
        Title: `Factura ${document.number}`,
        Author: 'Nimbo',
        CreationDate: document.issuedAt,
      },
    });
    const done = collect(pdf);
    writeInvoice(pdf, document);
    pdf.end();
    return done;
  }
}

function collect(pdf: PDFKit.PDFDocument): Promise<Buffer> {
  const chunks: Buffer[] = [];
  return new Promise((resolve, reject) => {
    pdf.on('data', (chunk: Buffer) => chunks.push(chunk));
    pdf.on('end', () => resolve(Buffer.concat(chunks)));
    pdf.on('error', reject);
  });
}

function writeInvoice(pdf: PDFKit.PDFDocument, document: InvoiceDocument): void {
  pdf.font(BOLD).fontSize(20).text('Nimbo');
  pdf.font(REGULAR).fontSize(10).text('Almacenamiento en la nube · Guatemala');
  pdf.moveDown(1.5);
  pdf.font(BOLD).fontSize(14).text(`Factura ${document.number}`);
  pdf.moveDown();
  writeRows(pdf, detailRows(document));
  pdf.moveDown();
  writeRows(pdf, amountRows(document));
  pdf.moveDown(2);
  pdf.font(REGULAR).fontSize(8).text('Pago simulado: documento de demostración, sin valor fiscal.');
}

function writeRows(pdf: PDFKit.PDFDocument, rows: readonly (readonly [string, string])[]): void {
  for (const [label, value] of rows) {
    pdf.font(BOLD).fontSize(10).text(`${label}: `, { continued: true });
    pdf.font(REGULAR).text(value);
  }
}
