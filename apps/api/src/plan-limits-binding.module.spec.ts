import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { PlanLimitsAdapter } from './modules/billing';
import { PlanOrmEntity } from './modules/billing/infrastructure/persistence/plan.orm-entity';
import { I_PLAN_LIMITS_PROVIDER } from './modules/storage';
import type { IPlanLimitsProvider } from './modules/storage';
import { PlanLimitsBindingModule } from './plan-limits-binding.module';
import { createActor, Role } from './shared';

const ACTOR = createActor('11111111-1111-4111-8111-111111111111', Role.CLIENT);

describe('PlanLimitsBindingModule', () => {
  it('CA-5: enlaza I_PLAN_LIMITS_PROVIDER con PlanLimitsAdapter', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PlanLimitsBindingModule],
    })
      .overrideProvider(getRepositoryToken(PlanOrmEntity))
      .useValue({
        findOneBy: jest.fn().mockResolvedValue({
          id: '10000000-0000-4000-8000-000000000001',
          slug: 'personal',
          cuotaBytes: 16106127360n,
          maxArchivoBytes: 52428800n,
          diasRetencionPapelera: 7,
        }),
      })
      .compile();
    const provider = moduleRef.get<IPlanLimitsProvider>(I_PLAN_LIMITS_PROVIDER);

    expect(provider).toBeInstanceOf(PlanLimitsAdapter);
    await expect(provider.limitsFor(ACTOR)).resolves.toEqual({
      maxFileBytes: 52428800n,
      storageQuotaBytes: 16106127360n,
      trashRetentionDays: 7,
    });
    await moduleRef.close();
  });
});
