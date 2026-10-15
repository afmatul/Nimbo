import { Controller, Get } from '@nestjs/common';
import type { Plan, PlanCatalogResponse } from '@nimbo/contracts';

import { Public } from '../../../shared';
import { PlanCatalogService } from '../application/plan-catalog.service';
import type { PlanSummary } from '../domain/plan-summary';

/** Lista blanca del contrato: precio entero (ADR-0016) y bytes como cadena decimal para no perder precisión (CA-1). */
const toPlanResponse = (plan: PlanSummary): Plan => ({
  id: plan.id,
  slug: plan.slug,
  name: plan.name,
  description: plan.description,
  priceCents: plan.priceCents,
  quotaBytes: plan.quotaBytes.toString(),
  maxFileBytes: plan.maxFileBytes.toString(),
  maxEditors: plan.maxEditors,
  agentQueriesPerMonth: plan.agentQueriesPerMonth,
  retainedVersions: plan.retainedVersions,
  trashRetentionDays: plan.trashRetentionDays,
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
