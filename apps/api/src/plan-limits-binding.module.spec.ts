import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { PlanLimitsAdapter } from './modules/billing';
import { I_PLAN_REPOSITORY } from './modules/billing/application/ports/i-plan-repository.port';
import { I_SUBSCRIPTION_REPOSITORY } from './modules/billing/application/ports/i-subscription-repository.port';
import { PERSONAL_PLAN } from './modules/billing/application/testing/plans';
import { SharedStubModule } from './modules/billing/application/testing/shared-stub.module';
import { PlanOrmEntity } from './modules/billing/infrastructure/persistence/plan.orm-entity';
import { I_PLAN_LIMITS_PROVIDER } from './modules/storage';
import type { IPlanLimitsProvider } from './modules/storage';
import { PlanLimitsBindingModule } from './plan-limits-binding.module';
import { createActor, I_TRANSACTION_RUNNER, Role } from './shared';

const ACTOR = createActor('11111111-1111-4111-8111-111111111111', Role.CLIENT);

describe('PlanLimitsBindingModule', () => {
  it('CA-5: enlaza I_PLAN_LIMITS_PROVIDER con PlanLimitsAdapter', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [SharedStubModule, PlanLimitsBindingModule],
    })
      .overrideProvider(getRepositoryToken(PlanOrmEntity))
      .useValue({})
      .overrideProvider(I_TRANSACTION_RUNNER)
      .useValue({ withActor: (_actor: unknown, work: () => Promise<unknown>) => work() })
      .overrideProvider(I_SUBSCRIPTION_REPOSITORY)
      .useValue({ findStanding: jest.fn().mockResolvedValue(null) })
      .overrideProvider(I_PLAN_REPOSITORY)
      .useValue({ findBySlug: jest.fn().mockResolvedValue(PERSONAL_PLAN) })
      .compile();
    const provider = moduleRef.get<IPlanLimitsProvider>(I_PLAN_LIMITS_PROVIDER);

    expect(provider).toBeInstanceOf(PlanLimitsAdapter);
    await expect(provider.limitsFor(ACTOR)).resolves.toEqual({
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
    await moduleRef.close();
  });
});
