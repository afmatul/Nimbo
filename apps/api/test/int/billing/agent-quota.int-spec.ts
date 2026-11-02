import type { DataSource } from 'typeorm';

import { BillingModule, I_AGENT_QUOTA } from '../../../src/modules/billing';
import type { AgentQuotaReservation, IAgentQuota } from '../../../src/modules/billing';
import { createActor, FixedClock, I_CLOCK, Role } from '../../../src/shared';
import type { Actor } from '../../../src/shared';
import { connectAsOwner } from '../../support/database-urls';
import { createTestApp } from '../setup/test-app';
import type { TestApp } from '../setup/test-app';
import { insertAccount, removeAccounts } from '../storage/storage-test-db';

import { DAY_MS, PERIOD_MS, PRO_ID } from './subscription-accounts';

const LIMIT = 3;
const PARALLEL_ASKS = 8;
const PERIOD_START = new Date('2026-10-14T12:00:00.000Z');
const PERIOD_END = new Date(PERIOD_START.getTime() + PERIOD_MS);
const MID_PERIOD = new Date(PERIOD_START.getTime() + 10 * DAY_MS);

interface PaidRow {
  readonly startedAt: Date;
  readonly readOnly?: boolean;
}

/** Una copia de Pro con `LIMIT` consultas, para agotar la cuota sin 500 reservas. */
const insertSmallPlan = async (owner: DataSource): Promise<string> => {
  const [plan] = (await owner.query(
    `INSERT INTO plan (slug, nombre, descripcion, precio_centavos, cuota_bytes, max_archivo_bytes, max_editores,
                       consultas_agente_mensual, versiones_retenidas, dias_retencion_papelera)
     SELECT 'agente-' || substr(md5(random()::text), 1, 8), 'Agente ' || substr(md5(random()::text), 1, 6),
            descripcion, precio_centavos, cuota_bytes, max_archivo_bytes, max_editores, $2,
            versiones_retenidas, dias_retencion_papelera
       FROM plan WHERE id = $1 RETURNING id`,
    [PRO_ID, LIMIT],
  )) as { id: string }[];
  if (plan === undefined) throw new Error('sin plan de prueba');
  return plan.id;
};

const usageRows = async (owner: DataSource, userId: string) =>
  (await owner.query(
    'SELECT periodo_inicio, consultas FROM uso_agente WHERE usuario_id = $1 ORDER BY periodo_inicio',
    [userId],
  )) as { periodo_inicio: Date; consultas: number }[];

describe('IAgentQuota con la base real (spec 020 CA-10 a CA-14; RN-4, RN-5)', () => {
  let testApp: TestApp;
  let owner: DataSource;
  let quota: IAgentQuota;
  let planId: string;
  const clock = new FixedClock(MID_PERIOD);
  const accounts: string[] = [];

  beforeAll(async () => {
    testApp = await createTestApp({
      modules: [BillingModule],
      overrides: [{ provide: I_CLOCK, useValue: clock }],
    });
    quota = testApp.app.get<IAgentQuota>(I_AGENT_QUOTA);
    owner = await connectAsOwner();
    planId = await insertSmallPlan(owner);
  });

  beforeEach(() => {
    clock.set(MID_PERIOD);
  });

  afterAll(async () => {
    await removeAccounts(owner, accounts);
    await owner?.query('DELETE FROM plan WHERE id = $1', [planId]);
    await owner?.destroy();
    await testApp?.close();
  });

  const newClient = async (paid: PaidRow | null): Promise<Actor> => {
    const id = await insertAccount(owner);
    accounts.push(id);
    if (paid !== null) await writeSubscription(id, paid);
    return createActor(id, Role.CLIENT);
  };

  const writeSubscription = (userId: string, paid: PaidRow): Promise<unknown> =>
    owner.query(
      `INSERT INTO suscripcion (usuario_id, plan_id, iniciado_en, vence_en, estado)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT ON CONSTRAINT uq_suscripcion_usuario
         DO UPDATE SET iniciado_en = EXCLUDED.iniciado_en, vence_en = EXCLUDED.vence_en, estado = EXCLUDED.estado`,
      [
        userId,
        planId,
        paid.startedAt,
        new Date(paid.startedAt.getTime() + PERIOD_MS),
        paid.readOnly === true ? 'solo_lectura' : 'vigente',
      ],
    );

  const reserveAll = async (actor: Actor, count: number) =>
    Promise.all(Array.from({ length: count }, () => quota.reserve(actor)));

  it(`CA-12: ${String(PARALLEL_ASKS)} reservas simultáneas con límite ${String(LIMIT)} conceden exactamente ${String(LIMIT)}`, async () => {
    const ana = await newClient({ startedAt: PERIOD_START });

    const results = await reserveAll(ana, PARALLEL_ASKS);

    const granted = results.filter((result) => result.outcome === 'granted');
    expect(granted).toHaveLength(LIMIT);
    expect(granted.map((result) => result.used).sort()).toEqual([1, 2, 3]);
    await expect(usageRows(owner, ana.id)).resolves.toEqual([
      { periodo_inicio: PERIOD_START, consultas: LIMIT },
    ]);
  });

  it('CA-11: agotada, `exhausted` trae el límite del plan y la renovación, y no toca el contador', async () => {
    const bruno = await newClient({ startedAt: PERIOD_START });
    await reserveAll(bruno, LIMIT);

    await expect(quota.reserve(bruno)).resolves.toEqual({
      outcome: 'exhausted',
      limit: LIMIT,
      resetsAt: PERIOD_END,
    });
    await expect(quota.status(bruno)).resolves.toEqual({
      used: LIMIT,
      limit: LIMIT,
      resetsAt: PERIOD_END,
    });
  });

  it('CA-13: al renovar, el periodo nuevo empieza en cero', async () => {
    const carla = await newClient({ startedAt: PERIOD_START });
    await reserveAll(carla, LIMIT);

    await writeSubscription(carla.id, { startedAt: PERIOD_END });
    clock.set(new Date(PERIOD_END.getTime() + DAY_MS));

    await expect(quota.status(carla)).resolves.toMatchObject({ used: 0, limit: LIMIT });
    await expect(quota.reserve(carla)).resolves.toMatchObject({ outcome: 'granted', used: 1 });
  });

  it('CA-14: en solo lectura consulta y consume del plan que conserva, sin fecha de renovación', async () => {
    const dana = await newClient({ startedAt: PERIOD_START, readOnly: true });
    clock.set(new Date(PERIOD_END.getTime() + DAY_MS));

    await expect(quota.reserve(dana)).resolves.toMatchObject({
      outcome: 'granted',
      used: 1,
      limit: LIMIT,
      resetsAt: null,
    });
  });

  it('RN-5: `release` devuelve la consulta a la fila que la reservó, aunque el periodo ya haya cambiado', async () => {
    const elena = await newClient({ startedAt: PERIOD_START });
    const first = await quota.reserve(elena);
    if (first.outcome !== 'granted') throw new Error('debió conceder');
    const reservation: AgentQuotaReservation = first.reservation;

    await writeSubscription(elena.id, { startedAt: PERIOD_END });
    clock.set(new Date(PERIOD_END.getTime() + DAY_MS));
    await quota.reserve(elena);
    await quota.release(elena, reservation);

    await expect(usageRows(owner, elena.id)).resolves.toEqual([
      { periodo_inicio: PERIOD_START, consultas: 0 },
      { periodo_inicio: PERIOD_END, consultas: 1 },
    ]);
  });

  it('CA-10: Personal sin fila de suscripción: 20 consultas y renovación el día 1 de Guatemala', async () => {
    const fabio = await newClient(null);

    await expect(quota.status(fabio)).resolves.toEqual({
      used: 0,
      limit: 20,
      resetsAt: new Date('2026-11-01T06:00:00.000Z'),
    });
  });
});
