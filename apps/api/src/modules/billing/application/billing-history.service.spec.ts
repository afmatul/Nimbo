import { createActor, Role } from '../../../shared';
import type { Actor, ITransactionRunner } from '../../../shared';
import type { IObjectStorage } from '../../storage';
import { InvoiceNotFoundError } from '../domain/errors/invoice-not-found.error';

import { BillingHistoryService, INVOICE_DOWNLOAD_TTL_SECONDS } from './billing-history.service';
import type {
  BillingHistoryRows,
  IBillingHistoryReader,
} from './ports/i-billing-history.reader.port';
import type { IPlanRepository } from './ports/i-plan-repository.port';
import { aPlan } from './testing/plans';

const ANA: Actor = createActor('11111111-1111-4111-8111-111111111111', Role.CLIENT);
const INVOICE_ID = '22222222-2222-4222-8222-222222222222';
const KEY = `invoices/${ANA.id}/${INVOICE_ID}.pdf`;
const TEAM = aPlan({ id: '10000000-0000-4000-8000-000000000003', name: 'Equipo' });
const ROWS: BillingHistoryRows = {
  subscription: { planId: TEAM.id, expiresAt: null },
  paymentMethod: { brand: 'visa', last4: '4242' },
  billingDetails: { nit: 'CF', receiptEmail: 'ana@ejemplo.com' },
  payments: [],
};

interface SetupOptions {
  readonly rows?: BillingHistoryRows;
  readonly downloadable?: { number: string; objectKey: string } | null;
}

const setup = ({ rows = ROWS, downloadable = null }: SetupOptions = {}) => {
  const journal: string[] = [];
  const transactions: ITransactionRunner = {
    run: () => Promise.reject(new Error('el historial corre con el dueño')),
    withActor: async (actor, work) => {
      journal.push(`tx:${actor.id}`);
      const result = await work();
      journal.push('commit');
      return result;
    },
  };
  const reader: IBillingHistoryReader = {
    read: jest.fn().mockResolvedValue(rows),
    findDownloadable: jest.fn().mockResolvedValue(downloadable),
  };
  const storage = {
    presignDownload: jest.fn().mockResolvedValue('https://minio.local/firmado'),
  } as unknown as IObjectStorage;
  const plans = {
    findById: jest.fn(() => {
      journal.push('findPlan');
      return Promise.resolve(TEAM);
    }),
  } as unknown as IPlanRepository;
  const service = new BillingHistoryService(transactions, reader, storage, plans);
  return { service, journal, reader, storage, plans };
};

describe('BillingHistoryService (spec 009 CA-7, CA-8)', () => {
  it('CA-7: lee el historial y el plan completo dentro de withActor del propio cliente', async () => {
    const { service, journal, reader } = setup();

    await expect(service.history(ANA)).resolves.toEqual({
      ...ROWS,
      subscription: { plan: TEAM, expiresAt: null },
    });
    expect(journal).toEqual([`tx:${ANA.id}`, 'findPlan', 'commit']);
    expect(reader.read).toHaveBeenCalledWith(ANA);
  });

  it('CA-7: sin fila de suscripción no busca plan', async () => {
    const { service, plans } = setup({ rows: { ...ROWS, subscription: null } });

    await expect(service.history(ANA)).resolves.toMatchObject({ subscription: null });
    expect(plans.findById).not.toHaveBeenCalled();
  });

  it('CA-8: firma un enlace de 5 minutos al PDF con el número de factura como nombre', async () => {
    const { service, storage } = setup({
      downloadable: { number: 'NB-2026-0042', objectKey: KEY },
    });

    await expect(service.download(ANA, INVOICE_ID)).resolves.toEqual({
      url: 'https://minio.local/firmado',
      expiresInSeconds: 300,
    });
    expect(INVOICE_DOWNLOAD_TTL_SECONDS).toBe(300);
    expect(storage.presignDownload).toHaveBeenCalledWith({
      key: KEY,
      fileName: 'factura-NB-2026-0042.pdf',
      expiresInSeconds: 300,
    });
  });

  it('CA-8: ajena, inexistente o sin PDF es el mismo 404 y no firma nada', async () => {
    const { service, storage } = setup();

    await expect(service.download(ANA, INVOICE_ID)).rejects.toBeInstanceOf(InvoiceNotFoundError);
    expect(storage.presignDownload).not.toHaveBeenCalled();
  });
});
