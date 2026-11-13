import { Module } from '@nestjs/common';
import type { DataSource } from 'typeorm';

import { BillingModule, PlanLimitsAdapter, PlanNotFoundError } from '../../../src/modules/billing';
import { I_PLAN_LIMITS_PROVIDER } from '../../../src/modules/storage';
import type { IPlanLimitsProvider } from '../../../src/modules/storage';
import { createActor, Role } from '../../../src/shared';
import { connectAsOwner } from '../../support/database-urls';
import { createTestApp, type TestApp } from '../setup/test-app';
import { insertAccount, removeAccounts } from '../storage/storage-test-db';

@Module({
  imports: [BillingModule],
  providers: [
    {
      provide: I_PLAN_LIMITS_PROVIDER,
      useExisting: PlanLimitsAdapter,
    },
  ],
  exports: [I_PLAN_LIMITS_PROVIDER],
})
class TestBillingWiringModule {}

describe('PlanLimitsAdapter integración con base de datos real (T-11, CA-1, CA-4, CA-5, CA-9)', () => {
  let testApp: TestApp;
  let adapter: PlanLimitsAdapter;
  let limitsProvider: IPlanLimitsProvider;

  beforeAll(async () => {
    testApp = await createTestApp({
      modules: [TestBillingWiringModule],
    });

    adapter = testApp.app.get(PlanLimitsAdapter);
    limitsProvider = testApp.app.get<IPlanLimitsProvider>(I_PLAN_LIMITS_PROVIDER);
  });

  afterAll(async () => {
    await testApp?.close();
  });

  it('resuelve PlanLimitsAdapter e I_PLAN_LIMITS_PROVIDER como la misma instancia', () => {
    expect(adapter).toBeInstanceOf(PlanLimitsAdapter);
    expect(limitsProvider).toBe(adapter);
  });

  describe('limitsFor(actor) (CA-5)', () => {
    it('CA-5: devuelve los límites de Personal para un cliente', async () => {
      const limits = await limitsProvider.limitsFor(
        createActor('00000000-0000-4000-8000-000000000001', Role.CLIENT),
      );

      expect(limits).toEqual({
        planName: 'Personal',
        maxFileBytes: 50000000n,
        storageQuotaBytes: 15000000000n,
        trashRetentionDays: 7,
        retainedVersions: 3,
        readOnly: false,
        maxEditors: 0,
        extraQuotaBytes: 0n,
        extraQuotaUntil: null,
      });
    });

    it('CA-5: devuelve los mismos límites para un administrador', async () => {
      const limits = await limitsProvider.limitsFor(
        createActor('00000000-0000-4000-8000-000000000002', Role.ADMIN),
      );

      expect(limits).toEqual({
        planName: 'Personal',
        maxFileBytes: 50000000n,
        storageQuotaBytes: 15000000000n,
        trashRetentionDays: 7,
        retainedVersions: 3,
        readOnly: false,
        maxEditors: 0,
        extraQuotaBytes: 0n,
        extraQuotaUntil: null,
      });
    });
  });

  describe('getLimitsByPlanId (CA-1, CA-2, CA-4, CA-9)', () => {
    it('CA-1, CA-9: obtiene los límites de los cuatro planes por sus UUID fijos', async () => {
      const personal = await adapter.getLimitsByPlanId('10000000-0000-4000-8000-000000000001');
      expect(personal).toEqual({
        planName: 'Personal',
        maxFileBytes: 50000000n,
        storageQuotaBytes: 15000000000n,
        trashRetentionDays: 7,
        retainedVersions: 3,
        maxEditors: 0,
      });

      const pro = await adapter.getLimitsByPlanId('10000000-0000-4000-8000-000000000002');
      expect(pro).toEqual({
        planName: 'Pro',
        maxFileBytes: 500000000n,
        storageQuotaBytes: 100000000000n,
        trashRetentionDays: 30,
        retainedVersions: 30,
        maxEditors: 3,
      });

      const equipo = await adapter.getLimitsByPlanId('10000000-0000-4000-8000-000000000003');
      expect(equipo).toEqual({
        planName: 'Equipo',
        maxFileBytes: 1000000000n,
        storageQuotaBytes: 350000000000n,
        trashRetentionDays: 60,
        retainedVersions: 60,
        maxEditors: 5,
      });

      const institucional = await adapter.getLimitsByPlanId('10000000-0000-4000-8000-000000000004');
      expect(institucional).toEqual({
        planName: 'Institucional',
        maxFileBytes: 2000000000n,
        storageQuotaBytes: 2000000000000n,
        trashRetentionDays: 90,
        retainedVersions: 100,
        maxEditors: 5,
      });
    });

    it('CA-4: lanza PlanNotFoundError al consultar un UUID que no existe', async () => {
      const fakeUuid = '00000000-0000-4000-8000-999999999999';

      await expect(adapter.getLimitsByPlanId(fakeUuid)).rejects.toThrow(PlanNotFoundError);
      await expect(adapter.getLimitsByPlanId(fakeUuid)).rejects.toMatchObject({
        code: 'PLAN_NOT_FOUND',
        status: 404,
      });
    });
  });

  describe('getLimitsBySlug (CA-1, CA-3, CA-4)', () => {
    it('CA-1: obtiene los límites de los cuatro planes por slug', async () => {
      await expect(adapter.getLimitsBySlug('personal')).resolves.toEqual({
        planName: 'Personal',
        maxFileBytes: 50000000n,
        storageQuotaBytes: 15000000000n,
        trashRetentionDays: 7,
        retainedVersions: 3,
        maxEditors: 0,
      });
      await expect(adapter.getLimitsBySlug('pro')).resolves.toEqual({
        planName: 'Pro',
        maxFileBytes: 500000000n,
        storageQuotaBytes: 100000000000n,
        trashRetentionDays: 30,
        retainedVersions: 30,
        maxEditors: 3,
      });
      await expect(adapter.getLimitsBySlug('equipo')).resolves.toEqual({
        planName: 'Equipo',
        maxFileBytes: 1000000000n,
        storageQuotaBytes: 350000000000n,
        trashRetentionDays: 60,
        retainedVersions: 60,
        maxEditors: 5,
      });
      await expect(adapter.getLimitsBySlug('institucional')).resolves.toEqual({
        planName: 'Institucional',
        maxFileBytes: 2000000000n,
        storageQuotaBytes: 2000000000000n,
        trashRetentionDays: 90,
        retainedVersions: 100,
        maxEditors: 5,
      });
    });

    it('CA-4: lanza PlanNotFoundError al consultar un slug que no existe', async () => {
      await expect(adapter.getLimitsBySlug('plan-inexistente')).rejects.toThrow(PlanNotFoundError);
      await expect(adapter.getLimitsBySlug('plan-inexistente')).rejects.toMatchObject({
        code: 'PLAN_NOT_FOUND',
        status: 404,
      });
    });
  });

  describe('limitsFor con la suscripción real (spec 009 T-03, PD-80; RLS forzada)', () => {
    let owner: DataSource;
    const accounts: string[] = [];

    beforeAll(async () => {
      owner = await connectAsOwner();
    });

    afterAll(async () => {
      await removeAccounts(owner, accounts);
      await owner?.destroy();
    });

    const newClient = async (): Promise<string> => {
      const id = await insertAccount(owner);
      accounts.push(id);
      return id;
    };

    it('T-03: con fila en Equipo, los límites de Equipo', async () => {
      const ana = await newClient();
      await owner.query(
        "INSERT INTO suscripcion (usuario_id, plan_id) SELECT $1, id FROM plan WHERE slug = 'equipo'",
        [ana],
      );

      await expect(limitsProvider.limitsFor(createActor(ana, Role.CLIENT))).resolves.toMatchObject({
        planName: 'Equipo',
        trashRetentionDays: 60,
      });
    });

    it('011b CA-4, CA-5: lee `cuota_extra_bytes` y `cuota_extra_hasta`; vigente suma, vencido no', async () => {
      const [vigente, vencido] = [await newClient(), await newClient()];
      const insertWithExtra = (id: string, until: string) =>
        owner.query(
          `INSERT INTO suscripcion (usuario_id, plan_id, cuota_extra_bytes, cuota_extra_hasta)
             SELECT $1, id, 53687091200, $2 FROM plan WHERE slug = 'personal'`,
          [id, until],
        );
      await insertWithExtra(vigente, '2999-01-01T06:00:00.000Z');
      await insertWithExtra(vencido, '2000-01-01T06:00:00.000Z');

      await expect(
        limitsProvider.limitsFor(createActor(vigente, Role.CLIENT)),
      ).resolves.toMatchObject({
        storageQuotaBytes: 15000000000n + 53687091200n,
        extraQuotaBytes: 53687091200n,
        extraQuotaUntil: new Date('2999-01-01T06:00:00.000Z'),
      });
      await expect(
        limitsProvider.limitsFor(createActor(vencido, Role.CLIENT)),
      ).resolves.toMatchObject({
        storageQuotaBytes: 15000000000n,
        extraQuotaBytes: 0n,
        extraQuotaUntil: null,
      });
    });

    it('T-03: sin fila, los límites de Personal', async () => {
      const bruno = await newClient();

      await expect(
        limitsProvider.limitsFor(createActor(bruno, Role.CLIENT)),
      ).resolves.toMatchObject({
        planName: 'Personal',
      });
    });

    it('RNF-05: la lectura va bajo RLS: el plan de otro cliente no se filtra a quien no tiene fila', async () => {
      const carla = await newClient();
      await owner.query(
        "INSERT INTO suscripcion (usuario_id, plan_id) SELECT $1, id FROM plan WHERE slug = 'pro'",
        [carla],
      );
      const dana = await newClient();

      await expect(limitsProvider.limitsFor(createActor(dana, Role.CLIENT))).resolves.toMatchObject(
        {
          planName: 'Personal',
        },
      );
    });
  });
});
