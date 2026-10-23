import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { SharedStubModule } from './application/testing/shared-stub.module';
import { BillingHttpModule } from './billing-http.module';
import { BillingModule } from './billing.module';
import { PlanLimitsAdapter } from './infrastructure/adapters/plan-limits.adapter';
import { PlanOrmEntity } from './infrastructure/persistence/plan.orm-entity';
import { PlansController } from './presentation/plans.controller';
import { SubscriptionController } from './presentation/subscription.controller';

describe('BillingModule (T-10, CA-5, RN-3)', () => {
  it('resuelve PlanLimitsAdapter cuando el repositorio está sustituido', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [SharedStubModule, BillingModule],
    })
      .overrideProvider(getRepositoryToken(PlanOrmEntity))
      .useValue({ findOneBy: jest.fn() })
      .compile();

    expect(moduleRef.get(PlanLimitsAdapter)).toBeInstanceOf(PlanLimitsAdapter);
    await moduleRef.close();
  });

  it('no declara controladores: el `worker` lo carga y no publica `GET /billing/plans` (008)', () => {
    expect(Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, BillingModule)).toBeUndefined();
  });
});

@Module({})
class StorageStubModule {}

describe('BillingHttpModule (008, 009)', () => {
  it('publica el catálogo y el cobro solo en el `api`', () => {
    const storage: DynamicModule = { module: StorageStubModule };

    expect(BillingHttpModule.forRoot({ RENEWAL_REMINDER_DAYS: 3 }, storage).controllers).toEqual([
      PlansController,
      SubscriptionController,
    ]);
  });
});
