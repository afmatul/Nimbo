import type { DataSource } from 'typeorm';

import type {
  Payment,
  PaymentDraft,
} from '../../../src/modules/billing/domain/entities/payment.entity';
import { Money } from '../../../src/modules/billing/domain/value-objects/money';
import { TypeOrmPaymentRepository } from '../../../src/modules/billing/infrastructure/persistence/typeorm-payment.repository';
import type { Actor } from '../../../src/shared';
import { createActor, Role } from '../../../src/shared';
import { connectAsOwner } from '../../support/database-urls';
import type { AppDatabase } from '../storage/storage-test-db';
import { connectAsAppDatabase, insertAccount } from '../storage/storage-test-db';

import {
  createFreshDatabase,
  removeBillingAccounts,
  revertFrom,
  rlsOf,
  tableExists,
} from './billing-test-db';
import type { FreshDatabase } from './billing-test-db';

const PAYMENT_MIGRATION = 'CrearTransaccion20261014100100';
const INSTRUMENT_MIGRATION = 'ReferenciaDeInstrumento20261018100100';
const PAID_AT = new Date('2026-10-14T12:00:00.000Z');
const INSTRUMENT_REF = 'SIM-TOK-ok-00000000-0000-4000-8000-000000000000';

/** Fila de `transaccion` como la ve el dueño de las tablas (sin RLS). */
interface PaymentRow {
  readonly usuario_id: string;
  readonly monto_centavos: number;
  readonly estado: string;
  readonly marca_tarjeta: string;
  readonly tarjeta_ultimos4: string;
  readonly referencia: string;
  readonly referencia_instrumento: string | null;
}

const draft = (status: PaymentDraft['status'] = 'aprobada'): PaymentDraft => ({
  planId: '10000000-0000-4000-8000-000000000003',
  amount: Money.ofCents(11_000),
  status,
  cardBrand: 'visa',
  cardLast4: '4242',
  instrumentRef: status === 'aprobada' ? INSTRUMENT_REF : null,
  createdAt: PAID_AT,
});

/** `transaccion` de punta a punta (spec 009 RN-3, RN-5, RN-7): repositorio real como `nimbo_app` bajo RLS forzado. */
describe('TypeOrmPaymentRepository y la tabla `transaccion` (spec 009 RN-3, RN-5, RN-7)', () => {
  let owner: DataSource;
  let app: AppDatabase;
  let repository: TypeOrmPaymentRepository;
  let ana: Actor;
  let bruno: Actor;
  const created: string[] = [];

  beforeAll(async () => {
    owner = await connectAsOwner();
    app = await connectAsAppDatabase();
    repository = new TypeOrmPaymentRepository(app.context);
    ana = createActor(await insertAccount(owner), Role.CLIENT);
    bruno = createActor(await insertAccount(owner), Role.CLIENT);
    created.push(ana.id, bruno.id);
  });

  afterAll(async () => {
    await app?.dataSource.destroy();
    await removeBillingAccounts(owner, created);
    await owner?.destroy();
  });

  const record = (actor: Actor, status?: PaymentDraft['status']): Promise<Payment> =>
    app.runner.withActor(actor, () => repository.record(actor, draft(status)));

  const rowOf = async (id: string): Promise<PaymentRow | undefined> => {
    const [row] = (await owner.query(
      `SELECT usuario_id, monto_centavos, estado, marca_tarjeta, tarjeta_ultimos4, referencia,
              referencia_instrumento
         FROM transaccion WHERE id = $1`,
      [id],
    )) as PaymentRow[];
    return row;
  };

  it('RN-3, RN-5 (010 RN-2): guarda el pago con marca, últimos 4, referencia `SIM-2026-NNNNNN` y la del instrumento', async () => {
    const payment = await record(ana);

    expect(payment.reference).toMatch(/^SIM-2026-\d{6,}$/);
    await expect(rowOf(payment.id)).resolves.toEqual({
      usuario_id: ana.id,
      monto_centavos: 11_000,
      estado: 'aprobada',
      marca_tarjeta: 'visa',
      tarjeta_ultimos4: '4242',
      referencia: payment.reference,
      referencia_instrumento: INSTRUMENT_REF,
    });
  });

  it('010 RN-2: un pago rechazado no guarda referencia del instrumento y la base no lo permite', async () => {
    const rejected = await record(ana, 'rechazada');

    await expect(rowOf(rejected.id)).resolves.toMatchObject({ referencia_instrumento: null });
    await expect(
      app.runner.withActor(ana, () =>
        repository.record(ana, { ...draft('rechazada'), instrumentRef: INSTRUMENT_REF }),
      ),
    ).rejects.toThrow(/ck_transaccion_referencia_instrumento/);
  });

  it('RN-5: cada pago, también uno rechazado, toma la siguiente referencia', async () => {
    const first = await record(ana);
    const second = await record(ana, 'rechazada');

    const sequenceOf = (payment: Payment): number => Number(payment.reference.split('-')[2]);
    expect(sequenceOf(second)).toBe(sequenceOf(first) + 1);
  });

  it('RN-7: el cliente no puede cambiar ni borrar sus transacciones (sin políticas de UPDATE ni DELETE)', async () => {
    const payment = await record(ana);

    await app.runner.withActor(ana, async () => {
      const manager = app.context.requireActorScope(ana);
      await manager.query(`UPDATE transaccion SET estado = 'rechazada' WHERE id = $1`, [
        payment.id,
      ]);
      await manager.query('DELETE FROM transaccion WHERE id = $1', [payment.id]);
    });

    await expect(rowOf(payment.id)).resolves.toMatchObject({ estado: 'aprobada' });
  });

  it('RNF-05: un cliente no ve las transacciones de otro', async () => {
    await record(ana);

    const visible = await app.runner.withActor(bruno, () =>
      app.context.requireActorScope(bruno).query('SELECT usuario_id FROM transaccion'),
    );

    expect(visible).toEqual([]);
  });

  it('RN-7: `transaccion` tiene RLS forzada con solo lectura y alta del cliente', async () => {
    await expect(rlsOf(owner, 'transaccion')).resolves.toEqual({
      forced: true,
      policies: [
        { policyname: 'transaccion_cliente_alta', cmd: 'INSERT' },
        { policyname: 'transaccion_cliente_lectura', cmd: 'SELECT' },
      ],
    });
  });
});

describe('cierre de la migración de transacción: `revert` y `run` sobre una base vacía (RNF-10)', () => {
  let fresh: FreshDatabase;

  beforeAll(async () => {
    fresh = await createFreshDatabase('nimbo_transaccion');
  });

  afterAll(async () => {
    await fresh?.drop();
  });

  it('RNF-10: `down` elimina la tabla, su secuencia y sus políticas, y `up` las vuelve a crear', async () => {
    const reverted = await revertFrom(fresh.dataSource, PAYMENT_MIGRATION);

    expect(reverted[0]).toBe(PAYMENT_MIGRATION);
    expect(await tableExists(fresh.dataSource, 'transaccion')).toBe(false);
    expect(await tableExists(fresh.dataSource, 'transaccion_referencia_seq')).toBe(false);

    const rerun = await fresh.dataSource.runMigrations({ transaction: 'each' });
    expect(rerun.map((migration) => migration.name)).toEqual(reverted);
    expect(await tableExists(fresh.dataSource, 'transaccion')).toBe(true);
  });

  it('RNF-10 (010 plan §3): `down` quita `referencia_instrumento` y `up` la vuelve a crear', async () => {
    const hasColumn = async (): Promise<boolean> =>
      (
        (await fresh.dataSource.query(
          `SELECT 1 FROM information_schema.columns
            WHERE table_name = 'transaccion' AND column_name = 'referencia_instrumento'`,
        )) as unknown[]
      ).length === 1;

    const reverted = await revertFrom(fresh.dataSource, INSTRUMENT_MIGRATION);

    expect(reverted[0]).toBe(INSTRUMENT_MIGRATION);
    expect(await hasColumn()).toBe(false);
    await fresh.dataSource.runMigrations({ transaction: 'each' });
    expect(await hasColumn()).toBe(true);
  });
});
