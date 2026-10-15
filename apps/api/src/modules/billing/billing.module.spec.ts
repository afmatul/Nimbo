import { Global, Module } from '@nestjs/common';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PinoLogger } from 'nestjs-pino';

import { PlanCatalogService } from './application/plan-catalog.service';
import { BillingHttpModule } from './billing-http.module';
import { BillingModule } from './billing.module';
import { PlanLimitsAdapter } from './infrastructure/adapters/plan-limits.adapter';
import { PlanOrmEntity } from './infrastructure/persistence/plan.orm-entity';
import { PlansController } from './presentation/plans.controller';

/** Sustituye a `PinoLogger`, global en `api` y `worker`. */
@Global()
@Module({
  providers: [{ provide: PinoLogger, useValue: { error: jest.fn() } }],
  exports: [PinoLogger],
})
class GlobalTestLoggerModule {}

describe('BillingModule (T-10, CA-5, RN-3)', () => {
  it('resuelve PlanLimitsAdapter cuando el repositorio está sustituido', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [BillingModule],
    })
      .overrideProvider(getRepositoryToken(PlanOrmEntity))
      .useValue({ findOneBy: jest.fn() })
      .compile();

    expect(moduleRef.get(PlanLimitsAdapter)).toBeInstanceOf(PlanLimitsAdapter);
    await moduleRef.close();
  });

  it('no declara controladores ni el catálogo: el `worker` lo carga y no publica `GET /billing/plans`', () => {
    expect(Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, BillingModule)).toBeUndefined();
    expect(Reflect.getMetadata(MODULE_METADATA.PROVIDERS, BillingModule)).toEqual([
      PlanLimitsAdapter,
    ]);
  });
});

describe('BillingHttpModule (008)', () => {
  it('publica `PlansController` con `PlanCatalogService` sobre el repositorio de `BillingModule`', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [GlobalTestLoggerModule, BillingHttpModule],
    })
      .overrideProvider(getRepositoryToken(PlanOrmEntity))
      .useValue({ find: jest.fn().mockResolvedValue([]) })
      .compile();

    await expect(moduleRef.get(PlansController).getPlans()).resolves.toEqual({ plans: [] });
    expect(moduleRef.get(PlanCatalogService)).toBeInstanceOf(PlanCatalogService);
    await moduleRef.close();
  });
});
