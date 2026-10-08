import { Module } from '@nestjs/common';
import { BillingModule, PlanLimitsAdapter, PlanNotFoundError } from '../../../src/modules/billing';
import { I_PLAN_LIMITS_PROVIDER } from '../../../src/modules/storage';
import type { IPlanLimitsProvider } from '../../../src/modules/storage';
import { createActor, Role } from '../../../src/shared';
import { createTestApp, type TestApp } from '../setup/test-app';
import request from 'supertest';

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

describe('CA-1: Plans Controller Endpoint Integration', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp({
      modules: [TestBillingWiringModule],
    });
  });

  afterAll(async () => {
    await testApp?.close();
  });

  it('CA-1: GET /api/v1/billing/plans retorna el arreglo de planes con la estructura correcta', async () => {
    const response = await request(testApp.app.getHttpServer())
      .get('/api/v1/billing/plans')
      .expect(200);

    expect(response.body).toHaveProperty('planes');
    expect(response.body.planes).toHaveLength(4);

    const slugs = response.body.planes.map((p: any) => p.slug);
    expect(slugs).toEqual(['personal', 'pro', 'equipo', 'institucional']);

    const prices = response.body.planes.map((p: any) => p.precioCentavos);
    expect(prices).toEqual([0, 4500, 11000, 45000]);

    response.body.planes.forEach((p: any) => {
      expect(typeof p.cuotaBytes).toBe('string');
      expect(typeof p.maxArchivoBytes).toBe('string');
    });
  });
});

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
        maxFileBytes: 52428800n,
        storageQuotaBytes: 16106127360n,
        trashRetentionDays: 7,
      });
    });

    it('CA-5: devuelve los mismos límites para un administrador', async () => {
      const limits = await limitsProvider.limitsFor(
        createActor('00000000-0000-4000-8000-000000000002', Role.ADMIN),
      );

      expect(limits).toEqual({
        planName: 'Personal',
        maxFileBytes: 52428800n,
        storageQuotaBytes: 16106127360n,
        trashRetentionDays: 7,
      });
    });
  });

  describe('getLimitsByPlanId (CA-1, CA-2, CA-4, CA-9)', () => {
    it('CA-1, CA-9: obtiene los límites de los cuatro planes por sus UUID fijos', async () => {
      const personal = await adapter.getLimitsByPlanId('10000000-0000-4000-8000-000000000001');
      expect(personal).toEqual({
        planName: 'Personal',
        maxFileBytes: 52428800n,
        storageQuotaBytes: 16106127360n,
        trashRetentionDays: 7,
      });

      const pro = await adapter.getLimitsByPlanId('10000000-0000-4000-8000-000000000002');
      expect(pro).toEqual({
        planName: 'Pro',
        maxFileBytes: 524288000n,
        storageQuotaBytes: 107374182400n,
        trashRetentionDays: 30,
      });

      const equipo = await adapter.getLimitsByPlanId('10000000-0000-4000-8000-000000000003');
      expect(equipo).toEqual({
        planName: 'Equipo',
        maxFileBytes: 1073741824n,
        storageQuotaBytes: 375809638400n,
        trashRetentionDays: 60,
      });

      const institucional = await adapter.getLimitsByPlanId('10000000-0000-4000-8000-000000000004');
      expect(institucional).toEqual({
        planName: 'Institucional',
        maxFileBytes: 2147483648n,
        storageQuotaBytes: 2199023255552n,
        trashRetentionDays: 90,
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
        maxFileBytes: 52428800n,
        storageQuotaBytes: 16106127360n,
        trashRetentionDays: 7,
      });
      await expect(adapter.getLimitsBySlug('pro')).resolves.toEqual({
        planName: 'Pro',
        maxFileBytes: 524288000n,
        storageQuotaBytes: 107374182400n,
        trashRetentionDays: 30,
      });
      await expect(adapter.getLimitsBySlug('equipo')).resolves.toEqual({
        planName: 'Equipo',
        maxFileBytes: 1073741824n,
        storageQuotaBytes: 375809638400n,
        trashRetentionDays: 60,
      });
      await expect(adapter.getLimitsBySlug('institucional')).resolves.toEqual({
        planName: 'Institucional',
        maxFileBytes: 2147483648n,
        storageQuotaBytes: 2199023255552n,
        trashRetentionDays: 90,
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
});