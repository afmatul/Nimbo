import { TEST_CARDS } from '@nimbo/contracts';
import type { DataSource } from 'typeorm';

import { BillingWorkerModule } from '../../../src/modules/billing';
import { I_DUE_SUBSCRIPTION_SCANNER } from '../../../src/modules/billing/application/ports/i-due-subscription.scanner.port';
import type { IDueSubscriptionScanner } from '../../../src/modules/billing/application/ports/i-due-subscription.scanner.port';
import { RenewalReminderService } from '../../../src/modules/billing/application/renewal-reminder.service';
import { SubscriptionRenewer } from '../../../src/modules/billing/application/subscription-renewer';
import type { MailMessage } from '../../../src/modules/notifications';
import { I_NOTIFIER } from '../../../src/modules/notifications';
import { StorageWorkerModule } from '../../../src/modules/storage';
import { PlanLimitsBindingModule } from '../../../src/plan-limits-binding.module';
import { createActor, I_TRANSACTION_RUNNER, Role } from '../../../src/shared';
import type { ITransactionRunner } from '../../../src/shared';
import { connectAsOwner } from '../../support/database-urls';
import { buildTestEnv, createTestApp } from '../setup/test-app';
import type { TestApp } from '../setup/test-app';

import { createBillingHttpApp } from './billing-http';
import { removeBillingAccounts } from './billing-test-db';
import {
  DAY_MS,
  PERIOD_MS,
  PERSONAL_ID,
  PRO_ID,
  subscriptionAccounts,
  subscriptionAuditsOf,
  subscriptionOf,
  TEAM_ID,
} from './subscription-accounts';
import type { SubscriptionAccount } from './subscription-accounts';

/** Un día: el programa repetible no corre solo durante la suite; la pasada la pide la prueba. */
const RENEWAL_INTERVAL_MINUTES = '1440';
const NIT = '12345678';

const cardBody = (number: string) => ({
  planSlug: 'equipo',
  card: { number, expMonth: 12, expYear: 2030, cvc: '123' },
  nit: NIT,
});

interface PaymentRow {
  readonly estado: string;
  readonly plan_id: string;
}

/**
 * Renovación automática, vencimiento y aviso previo de punta a punta (spec 010 CA-1, CA-2, CA-3, CA-5, CA-7, CA-20,
 * CA-21, CA-29; RN-2, RN-10, M-3): el `api` contrata con las tarjetas de prueba (referencias reales de la pasarela) y el
 * `worker` renueva como cada dueño. Los correos se capturan en un `INotifier` de prueba.
 */
describe('pasada de renovación del `worker` (spec 010 CA-1 a CA-3, CA-5, CA-7, CA-20, CA-21, CA-29)', () => {
  let api: TestApp;
  let worker: TestApp;
  let owner: DataSource;
  const accounts: string[] = [];
  const sent: MailMessage[] = [];
  const accountWith = subscriptionAccounts(
    () => api,
    () => owner,
    accounts,
  );

  beforeAll(async () => {
    api = await createBillingHttpApp();
    const env = buildTestEnv(
      { SUBSCRIPTION_RENEWAL_INTERVAL_MINUTES: RENEWAL_INTERVAL_MINUTES },
      { withWorkerEnv: true },
    );
    worker = await createTestApp({
      validatedEnv: env,
      modules: [
        PlanLimitsBindingModule,
        BillingWorkerModule.forRoot(env, StorageWorkerModule.forRoot(env)),
      ],
      overrides: [
        {
          provide: I_NOTIFIER,
          useValue: { notify: (message: MailMessage) => (sent.push(message), Promise.resolve()) },
        },
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

  /** Contrata Equipo con `card` desde Personal y deja vencido el periodo hace una hora (o vencerá en `inDays`). */
  const paidWith = async (
    number: string,
    expiresInMs = -3_600_000,
  ): Promise<SubscriptionAccount> => {
    const account = await accountWith(null);
    expect((await account.call('post', 'subscribe', cardBody(number))).status).toBe(201);
    const expiresAt = new Date(Date.now() + expiresInMs);
    await owner.query(
      'UPDATE suscripcion SET iniciado_en = $2, vence_en = $3 WHERE usuario_id = $1',
      [account.id, new Date(expiresAt.getTime() - PERIOD_MS), expiresAt],
    );
    return account;
  };

  const renew = (userId: string) =>
    worker.app.get(SubscriptionRenewer).renew(createActor(userId, Role.CLIENT));

  const paymentsOf = async (userId: string): Promise<PaymentRow[]> =>
    (await owner.query(
      'SELECT estado, plan_id FROM transaccion WHERE usuario_id = $1 ORDER BY creado_en',
      [userId],
    )) as PaymentRow[];

  const invoiceNitsOf = async (userId: string): Promise<string[]> =>
    (
      (await owner.query('SELECT nit FROM factura WHERE usuario_id = $1 ORDER BY creado_en', [
        userId,
      ])) as { nit: string }[]
    ).map((row) => row.nit);

  const mailsTo = (userId: string): MailMessage[] =>
    sent.filter((message) => message.recipientId === userId);

  const dueIds = (): Promise<readonly string[]> => {
    const transactions = worker.app.get<ITransactionRunner>(I_TRANSACTION_RUNNER);
    const scanner = worker.app.get<IDueSubscriptionScanner>(I_DUE_SUBSCRIPTION_SCANNER);
    return transactions.run(() => scanner.listDueForRenewal(1000));
  };

  it('CA-1, RN-4: con 4242 cobra con la referencia, factura con el NIT de la última y el periodo sigue al anterior', async () => {
    const ana = await paidWith(TEST_CARDS.approved);
    const before = await subscriptionOf(owner, ana.id);

    await expect(renew(ana.id)).resolves.toBe('renewed');

    const after = await subscriptionOf(owner, ana.id);
    expect(after).toMatchObject({ estado: 'vigente', iniciado_en: before.vence_en });
    expect(after.vence_en?.getTime()).toBe((before.vence_en?.getTime() ?? 0) + PERIOD_MS);
    await expect(paymentsOf(ana.id)).resolves.toEqual([
      { estado: 'aprobada', plan_id: TEAM_ID },
      { estado: 'aprobada', plan_id: TEAM_ID },
    ]);
    await expect(invoiceNitsOf(ana.id)).resolves.toEqual([NIT, NIT]);
    await expect(subscriptionAuditsOf(owner, ana.id)).resolves.toMatchObject([
      { accion: 'subscription.renewed', atributos: { trigger: 'automatic', planSlug: 'equipo' } },
    ]);
  });

  it('CA-2, RN-2: contratada con 0341, el cobro automático se rechaza: solo lectura con su plan y correo de vencida', async () => {
    const bruno = await paidWith(TEST_CARDS.recurringDeclined);
    const { vence_en: expiresAt } = await subscriptionOf(owner, bruno.id);

    await expect(renew(bruno.id)).resolves.toBe('rejected');

    await expect(subscriptionOf(owner, bruno.id)).resolves.toMatchObject({
      estado: 'solo_lectura',
      plan_id: TEAM_ID,
      vence_en: expiresAt,
    });
    await expect(paymentsOf(bruno.id)).resolves.toMatchObject([
      { estado: 'aprobada' },
      { estado: 'rechazada' },
    ]);
    expect(await invoiceNitsOf(bruno.id)).toHaveLength(1);
    expect(mailsTo(bruno.id).map((message) => message.tag)).toEqual(['billing.expired']);
    expect(await dueIds()).not.toContain(bruno.id);
  });

  it('M-3, RN-10: ya en solo lectura sin el correo, la pasada solo lo reenvía y nunca cobra', async () => {
    const carla = await paidWith(TEST_CARDS.approved);
    await owner.query(`UPDATE suscripcion SET estado = 'solo_lectura' WHERE usuario_id = $1`, [
      carla.id,
    ]);
    expect(await dueIds()).toContain(carla.id);

    await expect(renew(carla.id)).resolves.toBe('noticeResent');

    expect(await paymentsOf(carla.id)).toHaveLength(1);
    expect(mailsTo(carla.id).map((message) => message.tag)).toEqual(['billing.expired']);
    expect(await dueIds()).not.toContain(carla.id);
  });

  it.each([
    ['CA-7: con la renovación automática apagada', `renovacion_automatica = false`, 'suscripcion'],
    [
      'plan §3: con un pago de la 009 sin referencia',
      `referencia_instrumento = NULL`,
      'transaccion',
    ],
  ])('%s vence sin cobro y avisa', async (_case, change, table) => {
    const dana = await paidWith(TEST_CARDS.approved);
    await owner.query(`UPDATE ${table} SET ${change} WHERE usuario_id = $1`, [dana.id]);

    await expect(renew(dana.id)).resolves.toBe('readOnly');

    await expect(subscriptionOf(owner, dana.id)).resolves.toMatchObject({ estado: 'solo_lectura' });
    expect(await paymentsOf(dana.id)).toHaveLength(1);
    expect(mailsTo(dana.id).map((message) => message.tag)).toEqual(['billing.expired']);
  });

  it('CA-20: con un cambio programado a Pro cobra el precio completo de Pro y el periodo nuevo es de Pro', async () => {
    const elena = await paidWith(TEST_CARDS.approved);
    await owner.query('UPDATE suscripcion SET plan_pendiente_id = $2 WHERE usuario_id = $1', [
      elena.id,
      PRO_ID,
    ]);

    await expect(renew(elena.id)).resolves.toBe('renewed');

    await expect(subscriptionOf(owner, elena.id)).resolves.toMatchObject({
      plan_id: PRO_ID,
      plan_pendiente_id: null,
    });
    expect((await paymentsOf(elena.id)).at(-1)).toEqual({ estado: 'aprobada', plan_id: PRO_ID });
  });

  it('CA-20: si el cobro del plan nuevo se rechaza, queda en solo lectura con el anterior y el cambio sigue', async () => {
    const fabio = await paidWith(TEST_CARDS.recurringDeclined);
    await owner.query('UPDATE suscripcion SET plan_pendiente_id = $2 WHERE usuario_id = $1', [
      fabio.id,
      PRO_ID,
    ]);

    await expect(renew(fabio.id)).resolves.toBe('rejected');

    await expect(subscriptionOf(owner, fabio.id)).resolves.toMatchObject({
      plan_id: TEAM_ID,
      plan_pendiente_id: PRO_ID,
      estado: 'solo_lectura',
    });
  });

  it('CA-21: con la bajada a Personal programada no cobra y pasa a Personal; con uso mayor, la carga es 422 por cuota', async () => {
    const gabriel = await paidWith(TEST_CARDS.approved);
    await owner.query('UPDATE suscripcion SET plan_pendiente_id = $2 WHERE usuario_id = $1', [
      gabriel.id,
      PERSONAL_ID,
    ]);
    await owner.query('UPDATE usuario SET espacio_usado = 20000000000 WHERE id = $1', [gabriel.id]);

    await expect(renew(gabriel.id)).resolves.toBe('downgraded');

    await expect(subscriptionOf(owner, gabriel.id)).resolves.toMatchObject({
      plan_id: PERSONAL_ID,
      vence_en: null,
      estado: 'vigente',
    });
    expect(await paymentsOf(gabriel.id)).toHaveLength(1);
    const upload = await gabriel.call('post', '/uploads', {
      name: 'nuevo.pdf',
      sizeBytes: 1024,
      onConflict: 'ask',
      folderId: null,
    });
    expect(upload.status).toBe(422);
    expect(upload.body).toMatchObject({ code: 'STORAGE_QUOTA_EXCEEDED' });
    await owner.query('UPDATE usuario SET espacio_usado = 0 WHERE id = $1', [gabriel.id]);
  });

  it('CA-29: un plan programado que se desactivó se descarta, se renueva con Equipo y se avisa', async () => {
    const helena = await paidWith(TEST_CARDS.approved);
    const [retired] = (await owner.query(
      `INSERT INTO plan (slug, nombre, descripcion, precio_centavos, cuota_bytes, max_archivo_bytes, max_editores,
                         consultas_agente_mensual, versiones_retenidas, dias_retencion_papelera, desactivado_en)
       SELECT 'retirado-' || substr(md5(random()::text), 1, 8), 'Retirado ' || substr(md5(random()::text), 1, 6),
              descripcion, precio_centavos, cuota_bytes, max_archivo_bytes, max_editores, consultas_agente_mensual,
              versiones_retenidas, dias_retencion_papelera, now()
         FROM plan WHERE id = $1 RETURNING id, nombre`,
      [PRO_ID],
    )) as { id: string; nombre: string }[];
    if (retired === undefined) throw new Error('sin plan retirado');
    await owner.query('UPDATE suscripcion SET plan_pendiente_id = $2 WHERE usuario_id = $1', [
      helena.id,
      retired.id,
    ]);

    await expect(renew(helena.id)).resolves.toBe('renewed');

    await expect(subscriptionOf(owner, helena.id)).resolves.toMatchObject({
      plan_id: TEAM_ID,
      plan_pendiente_id: null,
    });
    const discarded = mailsTo(helena.id).find(
      (message) => message.tag === 'billing.plan-discarded',
    );
    expect(discarded?.text).toContain(`El plan ${retired.nombre} ya no está disponible`);
    await owner.query(
      'UPDATE suscripcion SET plan_pendiente_id = NULL WHERE plan_pendiente_id = $1',
      [retired.id],
    );
    await owner.query('DELETE FROM plan WHERE id = $1', [retired.id]);
  });

  it('CA-3, RN-9: dos pasadas y una renovación manual a la vez dejan un solo cobro del periodo', async () => {
    const ivan = await paidWith(TEST_CARDS.approved);
    const { vence_en: expiresAt } = await subscriptionOf(owner, ivan.id);

    const results = await Promise.all([
      renew(ivan.id),
      renew(ivan.id),
      ivan.call('post', 'renew', {
        card: cardBody(TEST_CARDS.approved).card,
        nit: NIT,
        expectedExpiresAt: expiresAt?.toISOString(),
      }),
    ]);

    expect(results.slice(0, 2).sort()).toEqual(expect.arrayContaining(['skipped']));
    expect(
      (await paymentsOf(ivan.id)).filter((payment) => payment.estado === 'aprobada'),
    ).toHaveLength(2);
  });

  it('CA-5, RN-8: a 2 días de vencer, un solo aviso por periodo con la tarjeta que se cobrará', async () => {
    const julia = await paidWith(TEST_CARDS.approved, 2 * DAY_MS);
    const reminders = worker.app.get(RenewalReminderService);
    const actor = createActor(julia.id, Role.CLIENT);
    const transactions = worker.app.get<ITransactionRunner>(I_TRANSACTION_RUNNER);
    const scanner = worker.app.get<IDueSubscriptionScanner>(I_DUE_SUBSCRIPTION_SCANNER);
    expect(await transactions.run(() => scanner.listDueForReminder(3, 1000))).toContain(julia.id);

    await expect(reminders.remind(actor)).resolves.toBe(true);

    const [reminder] = mailsTo(julia.id);
    expect(reminder?.tag).toBe('billing.renewal-reminder');
    expect(reminder?.text).toContain('con VISA ···· 4242');
    expect(await transactions.run(() => scanner.listDueForReminder(3, 1000))).not.toContain(
      julia.id,
    );
  });
});
