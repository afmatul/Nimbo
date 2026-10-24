import { createActor, Role } from '../../../shared';
import type { Actor, ITransactionRunner } from '../../../shared';
import type { INotifier } from '../../notifications';
import type { IObjectStorage } from '../../storage';

import type { BillingLogger } from './billing-logger';
import { InvoiceIssuer } from './invoice-issuer';
import type { IInvoiceGenerator, InvoiceDocument } from './ports/i-invoice-generator.port';
import type { IInvoiceRepository, IssuableInvoice } from './ports/i-invoice-repository.port';

const ANA: Actor = createActor('11111111-1111-4111-8111-111111111111', Role.CLIENT);
const INVOICE_ID = '22222222-2222-4222-8222-222222222222';
const PAYMENT_ID = '33333333-3333-4333-8333-333333333333';
const KEY = `invoices/${ANA.id}/${INVOICE_ID}.pdf`;
const DOCUMENT = { number: 'NB-2026-0001', receiptEmail: 'ana@ejemplo.com' } as InvoiceDocument;
const PDF = Buffer.from('%PDF-1.3');

const pending = (patch: Partial<IssuableInvoice> = {}): IssuableInvoice => ({
  id: INVOICE_ID,
  paymentId: PAYMENT_ID,
  objectKey: null,
  noticeQueuedAt: null,
  document: DOCUMENT,
  ...patch,
});

const setup = (found: IssuableInvoice | null) => {
  const journal: string[] = [];
  const step =
    (name: string, value: unknown = undefined) =>
    () => {
      journal.push(name);
      return Promise.resolve(value);
    };
  const transactions: ITransactionRunner = {
    run: () => Promise.reject(new Error('la emisión corre con el dueño')),
    withActor: (actor, work) => {
      journal.push(`tx:${actor.id}`);
      return work();
    },
  };
  const invoices = {
    findForIssue: jest.fn(() => Promise.resolve(found)),
    markStored: jest.fn(step('markStored')),
    markNoticeQueued: jest.fn(step('markNoticeQueued')),
  } as unknown as IInvoiceRepository;
  const generator: IInvoiceGenerator = {
    generate: jest.fn(step('generate', PDF)) as () => Promise<Buffer>,
  };
  const storage = { putObject: jest.fn(step('putObject')) } as unknown as IObjectStorage;
  const notifier: INotifier = { notify: jest.fn(step('notify')) as () => Promise<void> };
  const logger: BillingLogger = { info: jest.fn(), error: jest.fn() };
  const issuer = new InvoiceIssuer(transactions, invoices, generator, storage, notifier, logger);
  return { issuer, journal, invoices, storage, notifier, generator, logger };
};

describe('InvoiceIssuer.issue (spec 009 CA-6, T-07 y T-08; revisión N-3)', () => {
  it('CA-6: genera el PDF, lo sube a invoices/{usuario}/{factura}.pdf y guarda la clave, como el dueño', async () => {
    const { issuer, journal, invoices, storage } = setup(pending());

    await issuer.issue(ANA, INVOICE_ID);

    expect(journal.slice(0, 5)).toEqual([
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

  it('CA-6, T-08: después del PDF avisa con el comprobante y marca el aviso', async () => {
    const { issuer, journal, notifier } = setup(pending());

    await issuer.issue(ANA, INVOICE_ID);

    expect(journal.slice(5)).toEqual(['notify', `tx:${ANA.id}`, 'markNoticeQueued']);
    expect(notifier.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'ana@ejemplo.com',
        idempotencyKey: `billing.receipt.${PAYMENT_ID}`,
      }),
    );
  });

  it('CA-6, T-08: con el PDF ya guardado solo falta el aviso (el reintento no regenera el PDF)', async () => {
    const { issuer, journal } = setup(pending({ objectKey: KEY }));

    await issuer.issue(ANA, INVOICE_ID);

    expect(journal).toEqual([`tx:${ANA.id}`, 'notify', `tx:${ANA.id}`, 'markNoticeQueued']);
  });

  it('CA-6: es idempotente: una factura con PDF y aviso no hace nada', async () => {
    const { issuer, journal } = setup(pending({ objectKey: KEY, noticeQueuedAt: new Date() }));

    await issuer.issue(ANA, INVOICE_ID);

    expect(journal).toEqual([`tx:${ANA.id}`]);
  });

  it('CA-6: una factura que no existe (o no es del actor) no hace nada', async () => {
    const { issuer, journal } = setup(null);

    await issuer.issue(ANA, INVOICE_ID);

    expect(journal).toEqual([`tx:${ANA.id}`]);
  });
});

describe('InvoiceIssuer.issueAfterCommit (spec 009 RN-8; 010 plan §2)', () => {
  it('RN-8: emite como `issue`', async () => {
    const { issuer, journal } = setup(pending());

    await issuer.issueAfterCommit(ANA, INVOICE_ID);

    expect(journal).toContain('putObject');
  });

  it('RN-8: si el PDF falla, no lanza y deja solo el nombre del error para `invoice-retry`', async () => {
    const { issuer, generator, logger } = setup(pending());
    jest.mocked(generator.generate).mockRejectedValueOnce(new TypeError('minio caído'));

    await expect(issuer.issueAfterCommit(ANA, INVOICE_ID)).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalledWith({
      event: 'billing.invoice_issue_failed',
      invoiceId: INVOICE_ID,
      errorName: 'TypeError',
    });
  });
});
