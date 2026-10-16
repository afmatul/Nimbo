import { Controller, Get } from '@nestjs/common';
import type { PlanCatalogResponse } from '@nimbo/contracts';

import { Public } from '../../../shared';
import { PlanCatalogService } from '../application/plan-catalog.service';

import { toPlanResponse } from './plan.response';

@Controller('billing/plans')
export class PlansController {
  constructor(private readonly planCatalogService: PlanCatalogService) {}

  @Get()
  @Public()
  async getPlans(): Promise<PlanCatalogResponse> {
    const plans = await this.planCatalogService.list();
    return { plans: plans.map(toPlanResponse) };
  }
}
