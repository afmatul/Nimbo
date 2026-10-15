import { createActor, Role } from '../../../shared';
import type { Actor, ITransactionRunner } from '../../../shared';
import type { IObjectStorage } from '../../storage';

import { InvoiceIssuer } from './invoice-issuer';
import type { IInvoiceGenerator, InvoiceDocument } from './ports/i-invoice-generator.port';
import type { IInvoiceRepository, IssuableInvoice } from './ports/i-invoice-repository.port';

const ANA: Actor = createActor('11111111-1111-4111-8111-111111111111', Role.CLIENT);
const INVOICE_ID = '22222222-2222-4222-8222-222222222222';
const KEY = `invoices/${ANA.id}/${INVOICE_ID}.pdf`;
const DOCUMENT = { number: 'NB-2026-0001' } as InvoiceDocument;
const PDF = Buffer.from('%PDF-1.3');

const setup = (found: IssuableInvoice | null) => {
  const journal: string[] = [];
  const transactions: ITransactionRunner = {
    run: () => Promise.reject(new Error('la emisión corre con el dueño')),
    withActor: (actor, work) => {
      journal.push(`tx:${actor.id}`);
      return work();
    },
  };
  const invoices = {
    findForIssue: jest.fn(() => Promise.resolve(found)),
    markStored: jest.fn(() => {
      journal.push('markStored');
      return Promise.resolve();
    }),
  } as unknown as IInvoiceRepository;
  const generator: IInvoiceGenerator = {
    generate: jest.fn(() => {
      journal.push('generate');
      return Promise.resolve(PDF);
    }),
  };
  const storage = {
    putObject: jest.fn(() => {
      journal.push('putObject');
      return Promise.resolve();
    }),
  } as unknown as IObjectStorage;
  return {
    issuer: new InvoiceIssuer(transactions, invoices, generator, storage),
    journal,
    invoices,
    storage,
  };
};

describe('InvoiceIssuer.issue (spec 009 CA-6; revisión N-3)', () => {
  it('CA-6: genera el PDF, lo sube a invoices/{usuario}/{factura}.pdf y guarda la clave, como el dueño', async () => {
    const { issuer, journal, invoices, storage } = setup({
      id: INVOICE_ID,
      objectKey: null,
      document: DOCUMENT,
    });

    await issuer.issue(ANA, INVOICE_ID);

    expect(journal).toEqual([
      `tx:${ANA.id}`,
      'generate',
      'putObject',
      `tx:${ANA.id}`,
      'markStored',
    ]);
    expect(storage.putObject).toHaveBeenCalledWith({
      key: KEY,
      body: PDF,
      contentType: 'application/pdf',
    });
    expect(invoices.markStored).toHaveBeenCalledWith(ANA, INVOICE_ID, KEY);
  });

  it('CA-6: es idempotente: una factura que ya tiene PDF no se vuelve a generar ni subir', async () => {
    const { issuer, journal } = setup({ id: INVOICE_ID, objectKey: KEY, document: DOCUMENT });

    await issuer.issue(ANA, INVOICE_ID);

    expect(journal).toEqual([`tx:${ANA.id}`]);
  });

  it('CA-6: una factura que no existe (o no es del actor) no hace nada', async () => {
    const { issuer, journal } = setup(null);

    await issuer.issue(ANA, INVOICE_ID);

    expect(journal).toEqual([`tx:${ANA.id}`]);
  });
});
