import { createActor, Role } from '../../../shared';
import type { Actor, ITransactionRunner } from '../../../shared';
import type { IObjectStorage } from '../../storage';
import { InvoiceNotFoundError } from '../domain/errors/invoice-not-found.error';

import { BillingHistoryService, INVOICE_DOWNLOAD_TTL_SECONDS } from './billing-history.service';
import type { BillingHistory, IBillingHistoryReader } from './ports/i-billing-history.reader.port';

const ANA: Actor = createActor('11111111-1111-4111-8111-111111111111', Role.CLIENT);
const INVOICE_ID = '22222222-2222-4222-8222-222222222222';
const KEY = `invoices/${ANA.id}/${INVOICE_ID}.pdf`;
const HISTORY: BillingHistory = { subscription: null, payments: [] };

const setup = (downloadable: { number: string; objectKey: string } | null) => {
  const scopes: string[] = [];
  const transactions: ITransactionRunner = {
    run: () => Promise.reject(new Error('el historial corre con el dueño')),
    withActor: (actor, work) => {
      scopes.push(actor.id);
      return work();
    },
  };
  const reader: IBillingHistoryReader = {
    read: jest.fn().mockResolvedValue(HISTORY),
    findDownloadable: jest.fn().mockResolvedValue(downloadable),
  };
  const storage = {
    presignDownload: jest.fn().mockResolvedValue('https://minio.local/firmado'),
  } as unknown as IObjectStorage;
  return {
    service: new BillingHistoryService(transactions, reader, storage),
    scopes,
    reader,
    storage,
  };
};

describe('BillingHistoryService (spec 009 CA-7, CA-8)', () => {
  it('CA-7: lee el historial dentro de withActor del propio cliente', async () => {
    const { service, scopes, reader } = setup(null);

    await expect(service.history(ANA)).resolves.toBe(HISTORY);
    expect(scopes).toEqual([ANA.id]);
    expect(reader.read).toHaveBeenCalledWith(ANA);
  });

  it('CA-8: firma un enlace de 5 minutos al PDF con el número de factura como nombre', async () => {
    const { service, storage, scopes } = setup({ number: 'NB-2026-0042', objectKey: KEY });

    await expect(service.download(ANA, INVOICE_ID)).resolves.toEqual({
      url: 'https://minio.local/firmado',
      expiresInSeconds: 300,
    });
    expect(INVOICE_DOWNLOAD_TTL_SECONDS).toBe(300);
    expect(scopes).toEqual([ANA.id]);
    expect(storage.presignDownload).toHaveBeenCalledWith({
      key: KEY,
      fileName: 'factura-NB-2026-0042.pdf',
      expiresInSeconds: 300,
    });
  });

  it('CA-8: ajena, inexistente o sin PDF es el mismo 404 y no firma nada', async () => {
    const { service, storage } = setup(null);

    await expect(service.download(ANA, INVOICE_ID)).rejects.toBeInstanceOf(InvoiceNotFoundError);
    expect(storage.presignDownload).not.toHaveBeenCalled();
  });
});
