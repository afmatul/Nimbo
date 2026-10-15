import { Controller, Get } from '@nestjs/common';
import type { Plan as PlanResponse, PlanCatalogResponse } from '@nimbo/contracts';

import { Public } from '../../../shared';
import { PlanCatalogService } from '../application/plan-catalog.service';
import type { Plan } from '../domain/plan.entity';

/** Lista blanca del contrato: precio entero (ADR-0016) y bytes como cadena decimal para no perder precisión (CA-1). */
const toPlanResponse = ({ limits, ...plan }: Plan): PlanResponse => ({
  id: plan.id,
  slug: plan.slug,
  name: plan.name,
  description: plan.description,
  priceCents: plan.priceCents,
  quotaBytes: limits.quotaBytes.toString(),
  maxFileBytes: limits.maxFileBytes.toString(),
  maxEditors: limits.maxEditors,
  agentQueriesPerMonth: limits.agentQueriesPerMonth,
  retainedVersions: limits.retainedVersions,
  trashRetentionDays: limits.trashRetentionDays,
});

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
