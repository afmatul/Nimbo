import { Controller, Get } from '@nestjs/common';
import { PlanCatalogService } from '../application/plan-catalog.service';
import { Public } from '../../../shared/presentation/auth/public.decorator';
import { PlanDomain } from '../domain/plan-catalog';

@Controller('billing/plans')
export class PlansController {
  constructor(private readonly planCatalogService: PlanCatalogService) {}

  @Get()
  @Public()
  async getPlans(): Promise<PlanDomain[]> {
    return await this.planCatalogService.list();
  }
}