import { Injectable } from '@nestjs/common';
import { formatGtq, SUPPORT_CONTACT_EMAIL } from '@nimbo/contracts';
import PDFDocument from 'pdfkit';

import { formatBillingDate } from '../../application/billing-date';
import type {
  IInvoiceGenerator,
  InvoiceDocument,
} from '../../application/ports/i-invoice-generator.port';

import { CIELO_SERENO as TOKEN, INVOICE_FONTS as FONT } from './invoice-pdf-theme';
import { drawNimboLogo } from './nimbo-logo';

/** A4 en puntos y márgenes de la página. */
const PAGE = { width: 595.28, height: 841.89, margin: 48 } as const;
const CONTENT_WIDTH = PAGE.width - 2 * PAGE.margin;
const RIGHT_EDGE = PAGE.width - PAGE.margin;
const CARD_PADDING = 14;
const CARD_RADIUS = 8;
const SECTION_GAP = 22;
const LOGO_SIZE = 40;
/** Columnas de la tabla de conceptos: [desde, ancho], relativas al margen izquierdo. */
const COLUMNS = {
  concept: [CARD_PADDING, 250],
  quantity: [270, 50],
  unitPrice: [330, 80],
  amount: [CONTENT_WIDTH - CARD_PADDING - 80, 80],
} as const;
const DETAIL_LABEL_WIDTH = 150;
const TOTALS_WIDTH = 230;
const FOOTER_TOP = PAGE.height - PAGE.margin - 46;

const FOOTER_LINES = [
  'Nimbo · Almacenamiento como servicio · Guatemala',
  `¿Dudas sobre tu factura? Escríbenos a ${SUPPORT_CONTACT_EMAIL} desde el correo de tu cuenta.`,
  'Pago simulado: documento de demostración, sin valor fiscal.',
] as const;

type Row = readonly [label: string, value: string];

/** Datos de la factura: etiqueta y valor, en el orden del mockup de suscripción. */
const detailRows = (document: InvoiceDocument): readonly Row[] => [
  ['Fecha del pago', formatBillingDate(document.issuedAt)],
  ['Plan', document.planName],
  ['Referencia del pago', document.paymentReference],
  ['NIT', document.nit],
  ['Correo del comprobante', document.receiptEmail],
];

/**
 * `IInvoiceGenerator` con `pdfkit` (spec 009 CA-6; ADR-0028): una página con la identidad de Nimbo (Cielo Sereno), sin
 * imágenes ni fuentes externas; el ícono se dibuja con primitivas. Es el único archivo que crea documentos `pdfkit`. La
 * fecha del documento es la del pago, nunca la del sistema: los mismos datos dan los mismos bytes, así el PDF que repone
 * `invoice-retry` y el que viaja adjunto en el comprobante son iguales al que se descarga.
 */
@Injectable()
export class PdfInvoiceGenerator implements IInvoiceGenerator {
  generate(document: InvoiceDocument): Promise<Buffer> {
    const pdf = new PDFDocument({
      size: 'A4',
      margin: PAGE.margin,
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
  pdf.rect(0, 0, PAGE.width, PAGE.height).fill(TOKEN.background);
  const afterHeader = writeHeader(pdf, document, PAGE.margin);
  const afterDetails = writeDetails(pdf, document, afterHeader + SECTION_GAP);
  const afterConcepts = writeConcepts(pdf, document, afterDetails + SECTION_GAP);
  writeTotals(pdf, document, afterConcepts + SECTION_GAP);
  writeFooter(pdf);
}

/** Marca a la izquierda, número y fecha a la derecha y la franja de la marca debajo. Devuelve dónde termina. */
function writeHeader(pdf: PDFKit.PDFDocument, document: InvoiceDocument, top: number): number {
  drawNimboLogo(pdf, { x: PAGE.margin, y: top, size: LOGO_SIZE });
  const brandX = PAGE.margin + LOGO_SIZE + 10;
  pdf.font(FONT.bold).fontSize(20).fillColor(TOKEN.foreground);
  pdf.text('NIMBO', brandX, top + 5, { characterSpacing: 2, lineBreak: false });
  pdf.font(FONT.regular).fontSize(9).fillColor(TOKEN.mutedForeground);
  pdf.text('Almacenamiento en la nube', brandX, top + 28, { lineBreak: false });
  const right = { width: CONTENT_WIDTH, align: 'right' } as const;
  pdf.font(FONT.bold).fontSize(9).fillColor(TOKEN.mutedForeground);
  pdf.text('FACTURA', PAGE.margin, top, right);
  pdf.font(FONT.bold).fontSize(16).fillColor(TOKEN.foreground);
  pdf.text(document.number, PAGE.margin, top + 13, right);
  pdf.font(FONT.regular).fontSize(9).fillColor(TOKEN.secondaryForeground);
  pdf.text(`Emitida el ${formatBillingDate(document.issuedAt)}`, PAGE.margin, top + 34, right);
  const ruleTop = top + LOGO_SIZE + 16;
  pdf.rect(PAGE.margin, ruleTop, CONTENT_WIDTH, 2).fill(TOKEN.brand);
  return ruleTop + 2;
}

/** Tarjeta con los datos del pago y la insignia «Pagada». Las filas crecen si un valor largo ocupa más de una línea. */
function writeDetails(pdf: PDFKit.PDFDocument, document: InvoiceDocument, top: number): number {
  const rows = detailRows(document);
  pdf.font(FONT.regular).fontSize(10);
  const valueWidth = CONTENT_WIDTH - 2 * CARD_PADDING - DETAIL_LABEL_WIDTH;
  const heights = rows.map(([, value]) => pdf.heightOfString(value, { width: valueWidth }) + 8);
  const titleHeight = 28;
  const height =
    titleHeight + heights.reduce((sum, rowHeight) => sum + rowHeight, 0) + CARD_PADDING;
  drawCard(pdf, top, height);
  writeSectionTitle(pdf, 'Datos de la factura', top + CARD_PADDING);
  drawPaidBadge(pdf, top + CARD_PADDING - 3);
  let y = top + titleHeight + 6;
  rows.forEach(([label, value], index) => {
    pdf.font(FONT.regular).fontSize(9).fillColor(TOKEN.mutedForeground);
    pdf.text(label, PAGE.margin + CARD_PADDING, y + 1, { width: DETAIL_LABEL_WIDTH - 8 });
    pdf.font(FONT.regular).fontSize(10).fillColor(TOKEN.foreground);
    pdf.text(value, PAGE.margin + CARD_PADDING + DETAIL_LABEL_WIDTH, y, { width: valueWidth });
    y += heights[index] ?? 0;
  });
  return top + height;
}

function drawCard(pdf: PDFKit.PDFDocument, top: number, height: number): void {
  pdf.roundedRect(PAGE.margin, top, CONTENT_WIDTH, height, CARD_RADIUS);
  pdf.lineWidth(1).fillAndStroke(TOKEN.card, TOKEN.border);
}

function writeSectionTitle(pdf: PDFKit.PDFDocument, title: string, y: number): void {
  pdf.font(FONT.bold).fontSize(11).fillColor(TOKEN.foreground);
  pdf.text(title, PAGE.margin + CARD_PADDING, y, { lineBreak: false });
}

/** «Pagada» con texto y fondo tenue: el color no es el único diferenciador (Art. XIII.4). */
function drawPaidBadge(pdf: PDFKit.PDFDocument, y: number): void {
  const width = 62;
  const x = RIGHT_EDGE - CARD_PADDING - width;
  pdf.save();
  pdf.fillOpacity(0.18).roundedRect(x, y, width, 18, 9).fill(TOKEN.success);
  pdf.restore();
  pdf.font(FONT.bold).fontSize(9).fillColor(TOKEN.successForeground);
  pdf.text('PAGADA', x, y + 5, { width, align: 'center' });
}

/** Tabla de conceptos: cabecera en `primary` (blanco sobre `primary`: 5.11, AA) y una fila por la suscripción. */
function writeConcepts(pdf: PDFKit.PDFDocument, document: InvoiceDocument, top: number): number {
  const headerHeight = 24;
  pdf.roundedRect(PAGE.margin, top, CONTENT_WIDTH, headerHeight, 6).fill(TOKEN.primary);
  pdf.font(FONT.bold).fontSize(9).fillColor(TOKEN.primaryForeground);
  writeConceptRow(pdf, top + 8, ['Concepto', 'Cant.', 'Precio unitario', 'Importe']);
  const concept = `Suscripción al plan ${document.planName}`;
  pdf.font(FONT.regular).fontSize(10);
  const rowHeight = pdf.heightOfString(concept, { width: COLUMNS.concept[1] }) + 18;
  const rowTop = top + headerHeight;
  pdf.rect(PAGE.margin, rowTop, CONTENT_WIDTH, rowHeight).fill(TOKEN.card);
  pdf.fillColor(TOKEN.foreground);
  const subtotal = formatGtq(document.subtotalCents);
  writeConceptRow(pdf, rowTop + 9, [concept, '1', subtotal, subtotal]);
  const bottom = rowTop + rowHeight;
  pdf.moveTo(PAGE.margin, bottom).lineTo(RIGHT_EDGE, bottom).lineWidth(1).stroke(TOKEN.border);
  return bottom;
}

function writeConceptRow(
  pdf: PDFKit.PDFDocument,
  y: number,
  [concept, quantity, unitPrice, amount]: readonly [string, string, string, string],
): void {
  const at = ([offset, width]: readonly [number, number]) => ({ x: PAGE.margin + offset, width });
  const cell = (text: string, column: readonly [number, number], align: 'left' | 'right') => {
    const { x, width } = at(column);
    pdf.text(text, x, y, { width, align });
  };
  cell(concept, COLUMNS.concept, 'left');
  cell(quantity, COLUMNS.quantity, 'right');
  cell(unitPrice, COLUMNS.unitPrice, 'right');
  cell(amount, COLUMNS.amount, 'right');
}

/** Subtotal, IVA de RN-2 y el total destacado, alineados a la derecha; la nota de moneda a la izquierda. */
function writeTotals(pdf: PDFKit.PDFDocument, document: InvoiceDocument, top: number): void {
  const x = RIGHT_EDGE - TOTALS_WIDTH;
  const amountRows: readonly Row[] = [
    ['Subtotal', formatGtq(document.subtotalCents)],
    ['IVA (12 %)', formatGtq(document.vatCents)],
  ];
  amountRows.forEach(([label, value], index) => {
    const y = top + index * 18;
    pdf.font(FONT.regular).fontSize(10).fillColor(TOKEN.secondaryForeground);
    pdf.text(label, x + CARD_PADDING, y, { lineBreak: false });
    pdf
      .fillColor(TOKEN.foreground)
      .text(value, x, y, { width: TOTALS_WIDTH - CARD_PADDING, align: 'right' });
  });
  const totalTop = top + amountRows.length * 18 + 6;
  pdf.roundedRect(x, totalTop, TOTALS_WIDTH, 34, CARD_RADIUS).fill(TOKEN.muted);
  pdf.font(FONT.bold).fontSize(12).fillColor(TOKEN.foreground);
  pdf.text('Total', x + CARD_PADDING, totalTop + 11, { lineBreak: false });
  pdf.fontSize(15).fillColor(TOKEN.primary);
  pdf.text(formatGtq(document.totalCents), x, totalTop + 9, {
    width: TOTALS_WIDTH - CARD_PADDING,
    align: 'right',
  });
  pdf.font(FONT.regular).fontSize(8.5).fillColor(TOKEN.mutedForeground);
  pdf.text('Montos en quetzales (GTQ), IVA incluido.', PAGE.margin, top, {
    width: CONTENT_WIDTH - TOTALS_WIDTH - 16,
  });
}

/** Pie con la marca, el contacto de soporte y la nota de la simulación (sin valor fiscal). */
function writeFooter(pdf: PDFKit.PDFDocument): void {
  pdf
    .moveTo(PAGE.margin, FOOTER_TOP)
    .lineTo(RIGHT_EDGE, FOOTER_TOP)
    .lineWidth(1)
    .stroke(TOKEN.border);
  pdf.font(FONT.regular).fontSize(8.5).fillColor(TOKEN.mutedForeground);
  FOOTER_LINES.forEach((line, index) => {
    pdf.text(line, PAGE.margin, FOOTER_TOP + 10 + index * 12, {
      width: CONTENT_WIDTH,
      align: 'center',
    });
  });
}
