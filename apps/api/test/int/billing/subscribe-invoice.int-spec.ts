import { randomUUID } from 'node:crypto';

import { TEST_CARDS } from '@nimbo/contracts';
import request from 'supertest';
import type { DataSource } from 'typeorm';

import { BillingModule } from '../../../src/modules/billing';
import { createActor, FixedClock, Role } from '../../../src/shared';
import { connectAsOwner } from '../../support/database-urls';
import { PROBE_CLOCK_START } from '../../support/probe.module';
import { TestAccessTokens } from '../../support/test-access-tokens';
import { createTestApp } from '../setup/test-app';
import type { TestApp } from '../setup/test-app';
import type { AppDatabase } from '../storage/storage-test-db';
import {
  connectAsAppDatabase,
  inRolledBackTransaction,
  insertAccount,
} from '../storage/storage-test-db';

import {
  createFreshDatabase,
  removeBillingAccounts,
  revertFrom,
  rlsOf,
  tableExists,
} from './billing-test-db';
import type { FreshDatabase } from './billing-test-db';

const INVOICE_MIGRATION = 'CrearFactura20261014170000';

/** Factura como la ve el dueño de las tablas (sin RLS). */
interface InvoiceRow {
  readonly numero: string;
  readonly subtotal_centavos: number;
  readonly iva_centavos: number;
  readonly total_centavos: number;
  readonly nit: string;
  readonly correo_comprobante: string;
  readonly clave_objeto: string | null;
  readonly aviso_encolado_en: Date | null;
}

/** Factura del cobro de punta a punta (spec 009 CA-6, RN-2, RN-7; revisión I-5). */
describe('factura dentro del cobro (spec 009 CA-6)', () => {
  let testApp: TestApp;
  let owner: DataSource;
  let app: AppDatabase;
  const tokens = new TestAccessTokens(new FixedClock(PROBE_CLOCK_START));
  const accounts: string[] = [];

  beforeAll(async () => {
    testApp = await createTestApp({ modules: [BillingModule] });
    owner = await connectAsOwner();
    app = await connectAsAppDatabase();
  });

  afterAll(async () => {
    await app?.dataSource.destroy();
    await removeBillingAccounts(owner, accounts);
    await owner?.destroy();
    await testApp?.close();
  });

  /** Un cliente que contrata Equipo con `number`; devuelve su id. */
  const subscribe = async (number: string, nit = '12345678'): Promise<string> => {
    const id = await insertAccount(owner);
    accounts.push(id);
    const token = tokens.valid({ userId: id, role: Role.CLIENT, sessionId: randomUUID() });
    await request(testApp.app.getHttpServer())
      .post('/api/v1/billing/subscribe')
      .set({ Authorization: `Bearer ${token}` })
      .send({ planSlug: 'equipo', card: { number, expMonth: 12, expYear: 2030, cvc: '123' }, nit });
    return id;
  };

  const invoicesOf = (userId: string): Promise<InvoiceRow[]> =>
    owner.query(
      `SELECT numero, subtotal_centavos, iva_centavos, total_centavos, nit, correo_comprobante, clave_objeto,
              aviso_encolado_en
         FROM factura WHERE usuario_id = $1`,
      [userId],
    );

  const paymentOf = async (userId: string): Promise<string> => {
    const [row] = (await owner.query('SELECT id FROM transaccion WHERE usuario_id = $1', [
      userId,
    ])) as {
      id: string;
    }[];
    if (row === undefined) throw new Error('sin transacción');
    return row.id;
  };

  it('CA-6, RN-2: un pago aprobado deja su factura NB- con el desglose, el NIT y el correo, sin PDF ni aviso', async () => {
    const ana = await subscribe(TEST_CARDS.approved);

    const [invoice] = await invoicesOf(ana);

    expect(invoice).toEqual({
      numero: expect.stringMatching(/^NB-\d{4}-\d{4,}$/) as unknown,
      subtotal_centavos: 9821,
      iva_centavos: 1179,
      total_centavos: 11_000,
      nit: '12345678',
      correo_comprobante: `storage.${ana}@ejemplo.com`,
      clave_objeto: null,
      aviso_encolado_en: null,
    });
  });

  it('CA-6: un pago rechazado no tiene factura', async () => {
    const bruno = await subscribe(TEST_CARDS.rejected);

    await expect(invoicesOf(bruno)).resolves.toEqual([]);
  });

  it('I-5: la base rechaza una factura de una transacción de otro usuario o rechazada', async () => {
    const approved = await paymentOf(await subscribe(TEST_CARDS.approved));
    const rejectedOwner = await subscribe(TEST_CARDS.rejected);
    const rejected = await paymentOf(rejectedOwner);
    const stranger = await insertAccount(owner);
    accounts.push(stranger);
    const insert = (paymentId: string, userId: string) =>
      inRolledBackTransaction(owner, (runner) =>
        runner.query(
          `INSERT INTO factura (transaccion_id, usuario_id, numero, subtotal_centavos, iva_centavos,
                                total_centavos, correo_comprobante)
           VALUES ($1, $2, $3, 0, 1, 1, 'x@ejemplo.com')`,
          [paymentId, userId, `NB-TEST-${randomUUID().slice(0, 8)}`],
        ),
      );

    await expect(insert(approved, stranger)).rejects.toThrow(
      /transacción aprobada del mismo usuario/,
    );
    await expect(insert(rejected, rejectedOwner)).rejects.toThrow(
      /transacción aprobada del mismo usuario/,
    );
  });

  it('RNF-05, RN-7: RLS forzada con solo lectura y alta del dueño; otro cliente no ve la factura', async () => {
    const ana = await subscribe(TEST_CARDS.approved);
    const intruder = createActor(await insertAccount(owner), Role.CLIENT);
    accounts.push(intruder.id);

    const visible = await app.asActor(intruder, (manager) =>
      manager.query('SELECT id FROM factura WHERE usuario_id = $1', [ana]),
    );

    expect(visible).toEqual([]);
    await expect(rlsOf(owner, 'factura')).resolves.toEqual({
      forced: true,
      policies: [
        { policyname: 'factura_cliente_alta', cmd: 'INSERT' },
        { policyname: 'factura_cliente_lectura', cmd: 'SELECT' },
      ],
    });
  });
});

describe('cierre de la migración de factura: `revert` y `run` sobre una base vacía (RNF-10)', () => {
  let fresh: FreshDatabase;

  beforeAll(async () => {
    fresh = await createFreshDatabase('nimbo_factura');
  });

  afterAll(async () => {
    await fresh?.drop();
  });

  it('RNF-10: `down` elimina la tabla, su secuencia, su trigger y sus políticas, y `up` los vuelve a crear', async () => {
    const reverted = await revertFrom(fresh.dataSource, INVOICE_MIGRATION);

    expect(reverted[0]).toBe(INVOICE_MIGRATION);
    expect(await tableExists(fresh.dataSource, 'factura')).toBe(false);
    expect(await tableExists(fresh.dataSource, 'factura_numero_seq')).toBe(false);

    const rerun = await fresh.dataSource.runMigrations({ transaction: 'each' });
    expect(rerun.map((migration) => migration.name)).toEqual(reverted);
    expect(await tableExists(fresh.dataSource, 'factura')).toBe(true);
  });
});
