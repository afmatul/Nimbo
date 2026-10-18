import { createActor, Role } from '../../../shared';
import type { Actor, ITransactionRunner } from '../../../shared';

import type { BillingLogger } from './billing-logger';
import type { InvoiceIssuer } from './invoice-issuer';
import { InvoiceRetryIncompleteError, InvoiceRetrier } from './invoice-retrier';
import type {
  IPendingInvoiceScanner,
  PendingInvoice,
} from './ports/i-pending-invoice.scanner.port';

const PENDING: PendingInvoice[] = [
  { invoiceId: 'factura-1', userId: '11111111-1111-4111-8111-111111111111' },
  { invoiceId: 'factura-2', userId: '22222222-2222-4222-8222-222222222222' },
];

const setup = (failing: readonly string[] = []) => {
  let insideRun = false;
  const scans: string[] = [];
  const transactions: ITransactionRunner = {
    run: async (work) => {
      insideRun = true;
      try {
        return await work();
      } finally {
        insideRun = false;
      }
    },
    withActor: () => Promise.reject(new Error('la lista se lee sin actor')),
  };
  const scanner: IPendingInvoiceScanner = {
    listPending: jest.fn((limit: number) => {
      scans.push(`${String(insideRun)}:${String(limit)}`);
      return Promise.resolve(PENDING);
    }),
  };
  const issue = jest.fn((_actor: Actor, invoiceId: string) =>
    failing.includes(invoiceId) ? Promise.reject(new TypeError('minio caído')) : Promise.resolve(),
  );
  const logger: BillingLogger = { info: jest.fn(), error: jest.fn() };
  const retrier = new InvoiceRetrier(
    transactions,
    scanner,
    { issue } as unknown as InvoiceIssuer,
    { intervalMinutes: 1, batchSize: 100 },
    logger,
  );
  return { retrier, scans, issue, logger };
};

describe('InvoiceRetrier.retryPending (spec 009 CA-6; revisión N-3)', () => {
  it('CA-6: lista las pendientes sin actor (con el lote) y emite cada una como su dueño', async () => {
    const { retrier, scans, issue, logger } = setup();

    await retrier.retryPending();

    expect(scans).toEqual(['true:100']);
    expect(issue.mock.calls).toEqual(
      PENDING.map((p) => [createActor(p.userId, Role.CLIENT), p.invoiceId]),
    );
    expect(logger.info).toHaveBeenCalledWith({
      event: 'billing.invoice_retry_run',
      scanned: 2,
      failed: 0,
    });
  });

  it('CA-6: una factura que falla se registra (solo UUID y nombre del error), no frena las demás y la pasada falla al final', async () => {
    const { retrier, issue, logger } = setup(['factura-1']);

    await expect(retrier.retryPending()).rejects.toBeInstanceOf(InvoiceRetryIncompleteError);

    expect(issue).toHaveBeenCalledTimes(2);
    expect(logger.error).toHaveBeenCalledWith({
      event: 'billing.invoice_retry_failed',
      invoiceId: 'factura-1',
      errorName: 'TypeError',
    });
  });
});
