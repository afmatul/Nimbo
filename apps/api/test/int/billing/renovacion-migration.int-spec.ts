import type { DataSource } from 'typeorm';

import { TypeOrmSubscriptionRepository } from '../../../src/modules/billing/infrastructure/persistence/typeorm-subscription.repository';
import type { Actor } from '../../../src/shared';
import { createActor, Role } from '../../../src/shared';
import { connectAsOwner } from '../../support/database-urls';
import type { AppDatabase } from '../storage/storage-test-db';
import { connectAsAppDatabase, insertAccount, removeAccounts } from '../storage/storage-test-db';

import { createFreshDatabase, revertFrom } from './billing-test-db';
import type { FreshDatabase } from './billing-test-db';

const RENEWAL_MIGRATION = 'RenovacionDeSuscripcion20261018100000';
const PERSONAL_ID = '10000000-0000-4000-8000-000000000001';
const TEAM_ID = '10000000-0000-4000-8000-000000000003';
const PRO_ID = '10000000-0000-4000-8000-000000000002';
const EXPIRES = new Date('2026-11-13T12:00:00.000Z');

const NEW_COLUMNS = [
  'aviso_previo_para',
  'aviso_vencida_para',
  'estado',
  'plan_pendiente_id',
  'renovacion_automatica',
];

const subscriptionColumns = async (database: DataSource): Promise<string[]> =>
  (
    (await database.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name = 'suscripcion' AND column_name = ANY($1) ORDER BY column_name`,
      [NEW_COLUMNS],
    )) as { column_name: string }[]
  ).map((row) => row.column_name);

/** `suscripcion` con estado, renovación automática y cambio programado (spec 010 plan §3, CA-15, RN-3, RN-7). */
describe('migración renovacion-de-suscripcion (spec 010 CA-15, RN-3, RN-5, RN-7)', () => {
  let owner: DataSource;
  let app: AppDatabase;
  let repository: TypeOrmSubscriptionRepository;
  let ana: Actor;
  const created: string[] = [];

  const asAna = (sql: string, params: unknown[] = []): Promise<unknown> =>
    app.asActor(ana, (manager) => manager.query(sql, params));

  const setPaid = (patch = ''): Promise<unknown> =>
    asAna(`UPDATE suscripcion SET plan_id = $2, vence_en = $3 ${patch} WHERE usuario_id = $1`, [
      ana.id,
      TEAM_ID,
      EXPIRES,
    ]);

  beforeAll(async () => {
    owner = await connectAsOwner();
    app = await connectAsAppDatabase();
    repository = new TypeOrmSubscriptionRepository(app.context);
    ana = createActor(await insertAccount(owner), Role.CLIENT);
    created.push(ana.id);
    await app.runner.withActor(ana, () => repository.insertPersonalIfAbsent(ana));
  });

  afterAll(async () => {
    await app?.dataSource.destroy();
    await removeAccounts(owner, created);
    await owner?.destroy();
  });

  it('RN-3: una fila nueva queda vigente, con renovación automática y sin cambio programado', async () => {
    const current = await app.runner.withActor(ana, () => repository.lockCurrent(ana));

    expect(current).toMatchObject({
      planId: PERSONAL_ID,
      status: 'vigente',
      autoRenew: true,
      pendingPlanId: null,
    });
    await expect(app.runner.withActor(ana, () => repository.findStanding(ana))).resolves.toEqual({
      planId: PERSONAL_ID,
      readOnly: false,
    });
  });

  it('CA-15: Personal (sin `vence_en`) no puede quedar en solo lectura', async () => {
    await expect(
      asAna(`UPDATE suscripcion SET estado = 'solo_lectura' WHERE usuario_id = $1`, [ana.id]),
    ).rejects.toThrow(/ck_suscripcion_solo_lectura/);
  });

  it('RN-5: el estado solo admite `vigente` o `solo_lectura`', async () => {
    await expect(setPaid(`, estado = 'vencida'`)).rejects.toThrow(/ck_suscripcion_estado/);
  });

  it('RN-7: el plan programado no puede ser el actual', async () => {
    await expect(setPaid(`, plan_pendiente_id = '${TEAM_ID}'`)).rejects.toThrow(
      /ck_suscripcion_plan_pendiente/,
    );
  });

  it('plan §3: el repositorio guarda y lee estado, renovación automática y cambio programado como el cliente', async () => {
    await setPaid();
    const paid = await app.runner.withActor(ana, () => repository.lockCurrent(ana));
    const changed = paid
      .setAutoRenew(false)
      .scheduleChange({ ...paid, id: PRO_ID, slug: 'pro', isForSale: true } as never, new Date());

    await app.runner.withActor(ana, () => repository.save(ana, changed.expire()));

    await expect(
      app.runner.withActor(ana, () => repository.lockCurrent(ana)),
    ).resolves.toMatchObject({
      planId: TEAM_ID,
      expiresAt: EXPIRES,
      status: 'solo_lectura',
      autoRenew: false,
      pendingPlanId: PRO_ID,
    });
    await expect(app.runner.withActor(ana, () => repository.findStanding(ana))).resolves.toEqual({
      planId: TEAM_ID,
      readOnly: true,
    });
  });

  it('plan §3: `nimbo_app` puede escribir las marcas de los avisos', async () => {
    await expect(
      asAna(
        'UPDATE suscripcion SET aviso_previo_para = vence_en, aviso_vencida_para = vence_en WHERE usuario_id = $1',
        [ana.id],
      ),
    ).resolves.toBeDefined();
  });
});

describe('cierre de la migración renovacion-de-suscripcion: `revert` y `run` (RNF-10)', () => {
  let fresh: FreshDatabase;

  beforeAll(async () => {
    fresh = await createFreshDatabase('nimbo_renovacion');
  });

  afterAll(async () => {
    await fresh?.drop();
  });

  it('RNF-10: `down` quita las cinco columnas y `up` las vuelve a crear', async () => {
    const reverted = await revertFrom(fresh.dataSource, RENEWAL_MIGRATION);

    expect(reverted[0]).toBe(RENEWAL_MIGRATION);
    await expect(subscriptionColumns(fresh.dataSource)).resolves.toEqual([]);

    const rerun = await fresh.dataSource.runMigrations({ transaction: 'each' });
    expect(rerun.map((migration) => migration.name)).toEqual(reverted);
    await expect(subscriptionColumns(fresh.dataSource)).resolves.toEqual(NEW_COLUMNS);
  });
});
