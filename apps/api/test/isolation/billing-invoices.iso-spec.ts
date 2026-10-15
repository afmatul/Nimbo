import type { DataSource } from 'typeorm';

import { createActor, Role } from '../../src/shared';
import type { Actor } from '../../src/shared';
import { TransactionContext } from '../../src/shared/infrastructure/persistence/transaction-context';
import { TypeOrmTransactionRunner } from '../../src/shared/infrastructure/persistence/typeorm-transaction-runner';
import { insertAccount } from '../int/storage/storage-test-db';
import { connectTo } from '../support/database-urls';

import { startRestrictedOwnerDatabase } from './setup/nosuperuser-postgres';
import type { RestrictedOwnerDatabase } from './setup/nosuperuser-postgres';

const FUNCTION_SIGNATURE = 'facturas_pendientes_de_emitir(integer)';
const TEAM_PLAN_ID = '10000000-0000-4000-8000-000000000003';
const OLD = new Date(Date.now() - 10 * 60_000);

/**
 * Emisión de facturas sin actor con un dueño `NOSUPERUSER` (spec 009 T-07; ADR-0021, RN-7): la única lectura de
 * `factura` sin actor es `facturas_pendientes_de_emitir`, que falla con actor, devuelve solo ids y `PUBLIC` no ejecuta;
 * `nimbo_app` solo cambia `clave_objeto` y `aviso_encolado_en` de su propia factura.
 */
describe('emisión de facturas y avisos bajo RLS con dueño NOSUPERUSER (009 T-07 y T-08, ADR-0021)', () => {
  let database: RestrictedOwnerDatabase;
  let owner: DataSource;
  let app: DataSource;
  let transactions: TypeOrmTransactionRunner;
  let context: TransactionContext;
  let ana: Actor;
  let invoiceId: string;

  /** Transacción aprobada y su factura sin PDF, insertadas como la dueña (el dueño no tiene política de alta). */
  const insertPendingInvoice = (actor: Actor): Promise<string> =>
    transactions.withActor(actor, async () => {
      const manager = context.requireActorScope(actor);
      const [payment] = (await manager.query(
        `INSERT INTO transaccion (usuario_id, plan_id, monto_centavos, estado, marca_tarjeta, tarjeta_ultimos4, referencia)
         VALUES ($1, $2, 11000, 'aprobada', 'visa', '4242', $3) RETURNING id`,
        [actor.id, TEAM_PLAN_ID, `SIM-ISO-${actor.id.slice(0, 8)}`],
      )) as { id: string }[];
      const [invoice] = (await manager.query(
        `INSERT INTO factura (transaccion_id, usuario_id, numero, subtotal_centavos, iva_centavos, total_centavos,
                              correo_comprobante, creado_en)
         VALUES ($1, $2, $3, 9821, 1179, 11000, 'ana@ejemplo.com', $4) RETURNING id`,
        [payment?.id, actor.id, `NB-ISO-${actor.id.slice(0, 8)}`, OLD],
      )) as { id: string }[];
      return invoice?.id ?? '';
    });

  beforeAll(async () => {
    database = await startRestrictedOwnerDatabase();
    owner = await connectTo(database.ownerUrl);
    app = await connectTo(database.appUrl);
    context = new TransactionContext(app);
    transactions = new TypeOrmTransactionRunner(app, context);
    ana = createActor(await insertAccount(owner), Role.CLIENT);
    invoiceId = await insertPendingInvoice(ana);
  });

  afterAll(async () => {
    await app?.destroy();
    await owner?.destroy();
    await database?.stop();
  });

  it('ADR-0021: sin actor, la función devuelve solo `(factura_id, usuario_id)` de las facturas sin PDF o sin aviso', async () => {
    const rows = (await app.query(
      'SELECT * FROM facturas_pendientes_de_emitir($1)',
      [100],
    )) as Record<string, unknown>[];

    expect(rows).toEqual([{ factura_id: invoiceId, usuario_id: ana.id }]);
  });

  it.each([Role.CLIENT, Role.ADMIN, Role.SUPPORT, Role.OPERATOR] as const)(
    'ADR-0021: con un actor %s la función falla (solo la usa el worker, sin actor)',
    async (role) => {
      const actor =
        role === Role.CLIENT ? ana : createActor(await insertAccount(owner, role), role);

      await expect(
        transactions.withActor(actor, () =>
          context.requireActorScope(actor).query('SELECT * FROM facturas_pendientes_de_emitir(10)'),
        ),
      ).rejects.toThrow(/solo corre sin actor/);
    },
  );

  it('ADR-0021: `PUBLIC` no puede ejecutarla; `nimbo_app` sí', async () => {
    const [row] = (await owner.query(
      `SELECT has_function_privilege('public', $1, 'EXECUTE') AS public,
              has_function_privilege('nimbo_app', $1, 'EXECUTE') AS app`,
      [FUNCTION_SIGNATURE],
    )) as { public: boolean; app: boolean }[];

    expect(row).toEqual({ public: false, app: true });
  });

  it('RN-7: el cliente dueño no puede cambiar el número ni los montos de su factura (solo PDF y aviso)', async () => {
    await expect(
      transactions.withActor(ana, () =>
        context
          .requireActorScope(ana)
          .query(`UPDATE factura SET total_centavos = 1 WHERE id = $1`, [invoiceId]),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it('RNF-05: otro cliente no puede guardar la clave del PDF de una factura ajena', async () => {
    const intruder = createActor(await insertAccount(owner), Role.CLIENT);

    await transactions.withActor(intruder, () =>
      context
        .requireActorScope(intruder)
        .query(`UPDATE factura SET clave_objeto = 'invoices/x/y.pdf' WHERE id = $1`, [invoiceId]),
    );

    const [row] = (await app.query('SELECT * FROM facturas_pendientes_de_emitir(100)')) as {
      factura_id: string;
    }[];
    expect(row?.factura_id).toBe(invoiceId);
  });

  it('RNF-05, T-08: otro cliente no puede marcar el aviso de una factura ajena', async () => {
    const intruder = createActor(await insertAccount(owner), Role.CLIENT);

    await transactions.withActor(intruder, () =>
      context
        .requireActorScope(intruder)
        .query('UPDATE factura SET aviso_encolado_en = now() WHERE id = $1', [invoiceId]),
    );

    const [row] = (await owner.query('SELECT aviso_encolado_en FROM factura WHERE id = $1', [
      invoiceId,
    ])) as {
      aviso_encolado_en: Date | null;
    }[];
    expect(row?.aviso_encolado_en).toBeNull();
  });

  it('T-08: la función sigue devolviendo la factura con PDF pero sin aviso, y la suelta al marcarlo', async () => {
    const bea = createActor(await insertAccount(owner), Role.CLIENT);
    const beaInvoice = await insertPendingInvoice(bea);
    const mark = (column: string) =>
      transactions.withActor(bea, () =>
        context
          .requireActorScope(bea)
          .query(`UPDATE factura SET ${column} WHERE id = $1`, [beaInvoice]),
      );
    const pendingIds = async (): Promise<string[]> =>
      (
        (await app.query('SELECT factura_id FROM facturas_pendientes_de_emitir(100)')) as {
          factura_id: string;
        }[]
      ).map((row) => row.factura_id);

    await mark(`clave_objeto = 'invoices/${bea.id}/${beaInvoice}.pdf'`);
    expect(await pendingIds()).toContain(beaInvoice);

    await mark('aviso_encolado_en = now()');
    expect(await pendingIds()).not.toContain(beaInvoice);
  });
});
