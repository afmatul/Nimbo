import { randomUUID } from 'node:crypto';

import { HeadObjectCommand } from '@aws-sdk/client-s3';
import { TEST_CARDS } from '@nimbo/contracts';
import request from 'supertest';
import type { DataSource } from 'typeorm';

import { BillingWorkerModule } from '../../../src/modules/billing';
import { InvoiceRetrier } from '../../../src/modules/billing/application/invoice-retrier';
import { I_INVOICE_GENERATOR } from '../../../src/modules/billing/application/ports/i-invoice-generator.port';
import { StorageWorkerModule } from '../../../src/modules/storage';
import { PlanLimitsBindingModule } from '../../../src/plan-limits-binding.module';
import { FixedClock, Role } from '../../../src/shared';
import { connectAsOwner, requiredEnv } from '../../support/database-urls';
import { PROBE_CLOCK_START } from '../../support/probe.module';
import { TestAccessTokens } from '../../support/test-access-tokens';
import { buildTestEnv, createTestApp } from '../setup/test-app';
import type { TestApp } from '../setup/test-app';
import { harnessS3 } from '../storage/storage-http';
import { insertAccount } from '../storage/storage-test-db';

import { createBillingHttpApp } from './billing-http';
import { removeBillingAccounts } from './billing-test-db';

/** Un día: el programa repetible no corre por su cuenta durante la suite; la pasada la pide la prueba. */
const RETRY_INTERVAL_MINUTES = '1440';

/**
 * Reintento de facturas sin PDF de punta a punta (spec 009 CA-6, T-07): el `api` cobra con un generador que falla, así
 * la factura queda sin PDF; el `worker` (`BillingWorkerModule` con la misma instancia de `StorageWorkerModule`) la
 * repone con `facturas_pendientes_de_emitir` y la sube a MinIO.
 */
describe('reintento de facturas sin PDF ni aviso (spec 009 CA-6, T-07 y T-08)', () => {
  let api: TestApp;
  let worker: TestApp;
  let owner: DataSource;
  const tokens = new TestAccessTokens(new FixedClock(PROBE_CLOCK_START));
  const accounts: string[] = [];

  beforeAll(async () => {
    api = await createBillingHttpApp([
      {
        provide: I_INVOICE_GENERATOR,
        useValue: { generate: () => Promise.reject(new TypeError('pdf caído')) },
      },
    ]);
    const env = buildTestEnv(
      { INVOICE_RETRY_INTERVAL_MINUTES: RETRY_INTERVAL_MINUTES },
      { withWorkerEnv: true },
    );
    worker = await createTestApp({
      validatedEnv: env,
      modules: [
        PlanLimitsBindingModule,
        BillingWorkerModule.forRoot(env, StorageWorkerModule.forRoot(env)),
      ],
      prefix: '',
    });
    owner = await connectAsOwner();
  });

  afterAll(async () => {
    await removeBillingAccounts(owner, accounts);
    await owner?.destroy();
    await worker?.close();
    await api?.close();
  });

  /** Cobra Equipo como un cliente nuevo; el PDF falla después del commit y la factura queda pendiente. */
  const subscribeWithoutPdf = async (): Promise<string> => {
    const id = await insertAccount(owner);
    accounts.push(id);
    const token = tokens.valid({ userId: id, role: Role.CLIENT, sessionId: randomUUID() });
    const response = await request(api.app.getHttpServer())
      .post('/api/v1/billing/subscribe')
      .set({ Authorization: `Bearer ${token}` })
      .send({
        planSlug: 'equipo',
        card: { number: TEST_CARDS.approved, expMonth: 12, expYear: 2030, cvc: '123' },
        nit: 'CF',
      });
    expect(response.status).toBe(201);
    return id;
  };

  const objectKeyOf = async (userId: string): Promise<string | null> => {
    const [row] = (await owner.query('SELECT clave_objeto FROM factura WHERE usuario_id = $1', [
      userId,
    ])) as {
      clave_objeto: string | null;
    }[];
    return row?.clave_objeto ?? null;
  };

  it('CA-6, RN-8: si el PDF falla tras el cobro, el pago responde 201 y la factura queda sin PDF', async () => {
    const ana = await subscribeWithoutPdf();

    await expect(objectKeyOf(ana)).resolves.toBeNull();
  });

  it('CA-6: el reintento emite las facturas sin PDF de más de un minuto y las sube a MinIO; repetirlo no cambia nada', async () => {
    const bruno = await subscribeWithoutPdf();
    await owner.query(
      `UPDATE factura SET creado_en = now() - interval '2 minutes' WHERE usuario_id = $1`,
      [bruno],
    );
    const retrier = worker.app.get(InvoiceRetrier);

    await retrier.retryPending();
    const key = await objectKeyOf(bruno);
    await retrier.retryPending();

    expect(key).toMatch(new RegExp(`^invoices/${bruno}/[0-9a-f-]{36}\\.pdf$`));
    await expect(objectKeyOf(bruno)).resolves.toBe(key);
    const s3 = harnessS3();
    const head = await s3.send(
      new HeadObjectCommand({ Bucket: requiredEnv('MINIO_BUCKET'), Key: key ?? '' }),
    );
    expect(head.ContentType).toBe('application/pdf');
    s3.destroy();
  });

  it('CA-6: una factura de menos de un minuto no se reintenta todavía (no compite con la emisión tras el cobro)', async () => {
    const carla = await subscribeWithoutPdf();

    await worker.app.get(InvoiceRetrier).retryPending();

    await expect(objectKeyOf(carla)).resolves.toBeNull();
  });

  it('CA-6, T-08: el reintento también entrega el aviso pendiente, una sola vez', async () => {
    const dana = await subscribeWithoutPdf();
    await owner.query(
      `UPDATE factura SET creado_en = now() - interval '2 minutes' WHERE usuario_id = $1`,
      [dana],
    );
    const retrier = worker.app.get(InvoiceRetrier);
    const noticeOf = async (): Promise<Date | null> => {
      const [row] = (await owner.query(
        'SELECT aviso_encolado_en FROM factura WHERE usuario_id = $1',
        [dana],
      )) as {
        aviso_encolado_en: Date | null;
      }[];
      return row?.aviso_encolado_en ?? null;
    };

    await retrier.retryPending();
    const first = await noticeOf();
    await retrier.retryPending();

    expect(first).toBeInstanceOf(Date);
    await expect(noticeOf()).resolves.toEqual(first);
  });
});
