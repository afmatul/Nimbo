import { Test } from '@nestjs/testing';

import { I_PLAN_LIMITS_PROVIDER } from './modules/storage';
import type { IPlanLimitsProvider } from './modules/storage';
import { PendingPlanLimitsProvider, PlanLimitsBindingModule } from './plan-limits-binding.module';
import { createActor, Role } from './shared';

const ACTOR = createActor('11111111-1111-4111-8111-111111111111', Role.CLIENT);

describe('PlanLimitsBindingModule', () => {
  it('RN-1: mientras 006a no implemente el puerto, enlaza un proveedor sin valores que falla cerrado', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PlanLimitsBindingModule],
    }).compile();
    const provider = moduleRef.get<IPlanLimitsProvider>(I_PLAN_LIMITS_PROVIDER);

    expect(provider).toBeInstanceOf(PendingPlanLimitsProvider);
    await expect(provider.limitsFor(ACTOR)).rejects.toThrow('006a');
    await moduleRef.close();
  });
});
