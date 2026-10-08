import { Controller, Get } from '@nestjs/common';
import { PlanCatalogService } from '../application/plan-catalog.service';
import { Public } from '../../../shared/presentation/auth/public.decorator';

@Controller('billing/plans')
export class PlansController {
  constructor(private readonly planCatalogService: PlanCatalogService) {}

  @Get()
  @Public()
  async getPlans() {
    const plans = await this.planCatalogService.list();
    return {
      planes: plans.map((plan) => ({
        ...plan,
        precioCentavos: plan.precioCentavos?.toString() ?? '0',
        cuotaBytes: plan.cuotaBytes?.toString() ?? '0',
        maxArchivoBytes: plan.maxArchivoBytes?.toString() ?? '0',
      })),
    };
  }
}