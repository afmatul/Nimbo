import type { DataSource } from 'typeorm';

import { BillingModule, SubscriptionAdministration } from '../../../src/modules/billing';
import type { PlanClientCount } from '../../../src/modules/billing';
import { createActor, Role } from '../../../src/shared';
import type { Actor } from '../../../src/shared';
import { connectAsOwner } from '../../support/database-urls';
import { createTestApp } from '../setup/test-app';
import type { TestApp } from '../setup/test-app';
import { insertAccount, removeAccounts } from '../storage/storage-test-db';

const TEAM_ID = '10000000-0000-4000-8000-000000000003';

/**
 * `SubscriptionAdministration` sobre las funciones de ADR-0021 con `nimbo_app` y RLS forzada (spec 009 T-03; acuerdo
 * con la 011): nombres solo para el Administrador, conteos para Administrador y Operador, y solo de filas reales.
 */
describe('SubscriptionAdministration con suscripciones reales (spec 009 T-03)', () => {
  let testApp: TestApp;
  let owner: DataSource;
  let administration: SubscriptionAdministration;
  let admin: Actor;
  let operator: Actor;
  const accounts: string[] = [];

  const newAccount = async (role = Role.CLIENT): Promise<string> => {
    const id = await insertAccount(owner, role);
    accounts.push(id);
    return id;
  };
  const subscribeTo = (userId: string, planId: string): Promise<unknown> =>
    owner.query('INSERT INTO suscripcion (usuario_id, plan_id) VALUES ($1, $2)', [userId, planId]);
  const countFor = (counts: readonly PlanClientCount[], planId: string): number =>
    counts.find((count) => count.planId === planId)?.clientCount ?? 0;

  beforeAll(async () => {
    testApp = await createTestApp({ modules: [BillingModule] });
    owner = await connectAsOwner();
    administration = testApp.app.get(SubscriptionAdministration);
    admin = createActor(await newAccount(Role.ADMIN), Role.ADMIN);
    operator = createActor(await newAccount(Role.OPERATOR), Role.OPERATOR);
  });

  afterAll(async () => {
    await removeAccounts(owner, accounts);
    await owner?.destroy();
    await testApp?.close();
  });

  it('011 CA-1: el plan de cada cliente con fila; el cliente sin fila no aparece («—»)', async () => {
    const withRow = await newAccount();
    const withoutRow = await newAccount();
    await subscribeTo(withRow, TEAM_ID);

    const names = await administration.planNamesFor(admin, [withRow, withoutRow]);

    expect(names.get(withRow)).toBe('Equipo');
    expect(names.has(withoutRow)).toBe(false);
  });

  it('011 CA-8, CA-12: los conteos suben solo con filas de suscripción; un cliente sin fila no cuenta', async () => {
    const before = await administration.clientCountsByPlan(operator);
    await subscribeTo(await newAccount(), TEAM_ID);
    await newAccount();

    const after = await administration.clientCountsByPlan(admin);

    expect(countFor(after, TEAM_ID)).toBe(countFor(before, TEAM_ID) + 1);
    expect(after.every((count) => count.clientCount > 0)).toBe(true);
  });

  it('spec §5: el Operador no recibe el plan de un cliente', async () => {
    const client = await newAccount();

    await expect(administration.planNamesFor(operator, [client])).rejects.toThrow(
      /solo la usa un administrador/,
    );
  });
});
