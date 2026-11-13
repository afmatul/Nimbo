import { inflateSync } from 'node:zlib';

import { SUPPORT_CONTACT_EMAIL } from '@nimbo/contracts';

import type { InvoiceDocument } from '../../application/ports/i-invoice-generator.port';

import { PdfInvoiceGenerator } from './pdf-invoice-generator';

const DOCUMENT: InvoiceDocument = {
  number: 'NB-2026-0042',
  issuedAt: new Date('2026-10-14T18:00:00.000Z'),
  planName: 'Equipo',
  paymentReference: 'SIM-2026-000007',
  subtotalCents: 9821,
  vatCents: 1179,
  totalCents: 11_000,
  nit: 'CF',
  receiptEmail: 'lucía.núñez@ejemplo.com',
};

const STREAM = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
const HEX_TEXT = /<([0-9a-fA-F]+)>/g;

/** Texto de las páginas: descomprime cada flujo y decodifica las cadenas hexadecimales (WinAnsi ≈ latin1). */
const textOf = (pdf: Buffer): string => {
  const raw = pdf.toString('latin1');
  return [...raw.matchAll(STREAM)]
    .map(([, body]) => {
      try {
        return inflateSync(Buffer.from(body ?? '', 'latin1')).toString('latin1');
      } catch {
        return '';
      }
    })
    .flatMap((content) =>
      [...content.matchAll(HEX_TEXT)].map(([, hex]) =>
        Buffer.from(hex ?? '', 'hex').toString('latin1'),
      ),
    )
    .join('');
};

describe('PdfInvoiceGenerator (spec 009 CA-6; ADR-0028)', () => {
  const generator = new PdfInvoiceGenerator();

  it('CA-6: genera un PDF completo', async () => {
    const pdf = await generator.generate(DOCUMENT);

    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(pdf.toString('latin1').trimEnd().endsWith('%%EOF')).toBe(true);
  });

  it('CA-6: lleva la marca NIMBO, el concepto, la insignia de pagada y el contacto de soporte en el pie', async () => {
    const text = textOf(await generator.generate(DOCUMENT));

    for (const expected of [
      'NIMBO',
      'FACTURA',
      'PAGADA',
      'Suscripción al plan Equipo',
      SUPPORT_CONTACT_EMAIL,
      'sin valor fiscal',
    ]) {
      expect(text).toContain(expected);
    }
  });

  it('CA-6: cabe en una sola página aunque el plan y el correo sean largos', async () => {
    const pdf = await generator.generate({
      ...DOCUMENT,
      planName: 'Plan con un nombre muy largo '.repeat(4),
      receiptEmail: `${'a'.repeat(64)}@${'dominio-largo.'.repeat(10)}gt`,
    });

    expect(pdf.toString('latin1').match(/\/Type \/Page\b/g)).toHaveLength(1);
  });

  it('CA-6, RN-2: trae el número, el plan, la referencia, los tres montos, el NIT y el correo con tildes y «ñ»', async () => {
    const text = textOf(await generator.generate(DOCUMENT));

    for (const expected of [
      'NB-2026-0042',
      'Equipo',
      'SIM-2026-000007',
      'Q98.21',
      'Q11.79',
      'Q110.00',
      'CF',
      'lucía.núñez@ejemplo.com',
    ]) {
      expect(text).toContain(expected);
    }
  });

  it('ADR-0028: los mismos datos dan los mismos bytes (el reintento repone el mismo archivo)', async () => {
    const [first, second] = await Promise.all([
      generator.generate(DOCUMENT),
      generator.generate(DOCUMENT),
    ]);

    expect(first.equals(second)).toBe(true);
  });
});
