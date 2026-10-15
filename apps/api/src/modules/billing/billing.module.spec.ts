import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { SharedStubModule } from './application/testing/shared-stub.module';
import { BillingModule } from './billing.module';
import { PlanLimitsAdapter } from './infrastructure/adapters/plan-limits.adapter';
import { PlanOrmEntity } from './infrastructure/persistence/plan.orm-entity';

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
});
