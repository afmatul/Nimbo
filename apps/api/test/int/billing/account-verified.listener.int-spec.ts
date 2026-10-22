import { EventEmitter2 } from '@nestjs/event-emitter';
import type { DataSource } from 'typeorm';

import { BillingModule } from '../../../src/modules/billing';
import { CLIENT_ACCOUNT_VERIFIED } from '../../../src/modules/identity';
import type { ClientAccountVerifiedEvent } from '../../../src/modules/identity';
import { connectAsOwner } from '../../support/database-urls';
import { createTestApp } from '../setup/test-app';
import type { TestApp } from '../setup/test-app';
import { insertAccount, removeAccounts } from '../storage/storage-test-db';

/** Fila de `suscripcion` leída como el dueño de las tablas (sin RLS). */
interface SubscriptionRow {
  readonly slug: string;
  readonly vence_en: Date | null;
}

describe('alta Personal al verificar la cuenta (spec 009 CA-1)', () => {
  let testApp: TestApp;
  let owner: DataSource;
  let emitter: EventEmitter2;
  const accounts: string[] = [];

  beforeAll(async () => {
    testApp = await createTestApp({ modules: [BillingModule] });
    emitter = testApp.app.get(EventEmitter2);
    owner = await connectAsOwner();
  });

  afterAll(async () => {
    await removeAccounts(owner, accounts);
    await owner?.destroy();
    await testApp?.close();
  });

  const verify = async (userId: string): Promise<void> => {
    const event: ClientAccountVerifiedEvent = { userId };
    await emitter.emitAsync(CLIENT_ACCOUNT_VERIFIED, event);
  };

  const subscriptionsOf = (userId: string): Promise<SubscriptionRow[]> =>
    owner.query(
      `SELECT p.slug, s.vence_en FROM suscripcion s JOIN plan p ON p.id = s.plan_id
        WHERE s.usuario_id = $1`,
      [userId],
    );

  it('CA-1: crea la suscripción Personal sin vencimiento con el actor del dueño (RLS forzado)', async () => {
    const ana = await insertAccount(owner);
    accounts.push(ana);

    await verify(ana);

    expect(await subscriptionsOf(ana)).toEqual([{ slug: 'personal', vence_en: null }]);
  });

  it('CA-1: repetir el evento no duplica ni cambia la suscripción', async () => {
    const bruno = await insertAccount(owner);
    accounts.push(bruno);
    await verify(bruno);
    await owner.query(
      `UPDATE suscripcion SET plan_id = (SELECT id FROM plan WHERE slug = 'pro')
        WHERE usuario_id = $1`,
      [bruno],
    );

    await verify(bruno);

    expect(await subscriptionsOf(bruno)).toEqual([{ slug: 'pro', vence_en: null }]);
  });
});
