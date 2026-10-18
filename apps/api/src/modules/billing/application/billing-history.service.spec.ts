import type { Actor, ITransactionRunner } from '../../../shared';
import { createActor, Role, FixedClock  } from '../../../shared';
import type { IObjectStorage } from '../../storage';
import type { Subscription } from '../domain/entities/subscription.entity';
import { InvoiceNotFoundError } from '../domain/errors/invoice-not-found.error';

import { BillingHistoryService, INVOICE_DOWNLOAD_TTL_SECONDS } from './billing-history.service';
import type {
  BillingHistoryRows,
  IBillingHistoryReader,
} from './ports/i-billing-history.reader.port';
import type { IPlanRepository } from './ports/i-plan-repository.port';
import type { ISubscriptionRepository } from './ports/i-subscription-repository.port';
import { aPlan } from './testing/plans';
import { aSubscription } from './testing/subscriptions';

const ANA: Actor = createActor('11111111-1111-4111-8111-111111111111', Role.CLIENT);
const INVOICE_ID = '22222222-2222-4222-8222-222222222222';
const KEY = `invoices/${ANA.id}/${INVOICE_ID}.pdf`;
const TEAM = aPlan({
  id: '10000000-0000-4000-8000-000000000003',
  name: 'Equipo',
  priceCents: 11_000,
});
const EXPIRES = new Date('2026-11-13T12:00:00.000Z');
const NOW = new Date('2026-11-01T12:00:00.000Z');
const TEAM_SUBSCRIPTION = aSubscription({
  userId: ANA.id,
  planId: TEAM.id,
  planSlug: 'equipo',
  expiresAt: EXPIRES,
});
const ROWS: BillingHistoryRows = {
  paymentMethod: { brand: 'visa', last4: '4242' },
  billingDetails: { nit: 'CF', receiptEmail: 'ana@ejemplo.com' },
  payments: [],
};

interface SetupOptions {
  readonly rows?: BillingHistoryRows;
  readonly subscription?: Subscription | null;
  readonly downloadable?: { number: string; objectKey: string } | null;
}

const setup = ({
  rows = ROWS,
  subscription = TEAM_SUBSCRIPTION,
  downloadable = null,
}: SetupOptions = {}) => {
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
    findPaymentMethod: jest.fn().mockResolvedValue(ROWS.paymentMethod),
  };
  const subscriptions = {
    findCurrent: jest.fn(() => {
      journal.push('findSubscription');
      return Promise.resolve(subscription);
    }),
  } as unknown as ISubscriptionRepository;
  const storage = {
    presignDownload: jest.fn().mockResolvedValue('https://minio.local/firmado'),
  } as unknown as IObjectStorage;
  const plans = {
    findById: jest.fn(() => {
      journal.push('findPlan');
      return Promise.resolve(TEAM);
    }),
  } as unknown as IPlanRepository;
  const service = new BillingHistoryService(
    transactions,
    reader,
    storage,
    plans,
    subscriptions,
    new FixedClock(NOW),
    3,
  );
  return { service, journal, reader, storage, plans };
};

describe('BillingHistoryService (spec 009 CA-7, CA-8; 010 CA-25)', () => {
  it('CA-7, CA-25: lee el historial y resume la suscripción con su plan dentro de withActor del cliente', async () => {
    const { service, journal, reader } = setup();

    await expect(service.history(ANA)).resolves.toEqual({
      ...ROWS,
      subscription: expect.objectContaining({
        plan: TEAM,
        expiresAt: EXPIRES,
        standing: 'active',
        nextCharge: { date: EXPIRES, plan: TEAM, card: ROWS.paymentMethod },
      }) as unknown,
    });
    expect(journal).toEqual([`tx:${ANA.id}`, 'findSubscription', 'findPlan', 'commit']);
    expect(reader.read).toHaveBeenCalledWith(ANA);
  });

  it('010 CA-6: la vista sola, con la tarjeta del último pago y sin leer los pagos', async () => {
    const { service, reader } = setup();

    await expect(service.subscription(ANA)).resolves.toMatchObject({ plan: TEAM });
    expect(reader.findPaymentMethod).toHaveBeenCalledWith(ANA);
    expect(reader.read).not.toHaveBeenCalled();
  });

  it('CA-7: sin fila de suscripción no busca plan', async () => {
    const { service, plans } = setup({ subscription: null });

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
