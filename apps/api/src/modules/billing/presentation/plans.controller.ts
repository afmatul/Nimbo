import { Controller, Get } from '@nestjs/common';
import { PlanCatalogResponseSchema } from '@nimbo/contracts';
import type { PlanCatalogResponse } from '@nimbo/contracts';
import { PlanCatalogService } from '../application/plan-catalog.service';
import { Public } from '../../../shared/presentation/auth/public.decorator';

@Controller('billing/plans')
export class PlansController {
  constructor(private readonly planCatalogService: PlanCatalogService) {}

  @Get()
  @Public()
  async getPlans(): Promise<PlanCatalogResponse> {
    const plans = await this.planCatalogService.list();

    return PlanCatalogResponseSchema.parse({
      planes: plans.map((plan) => ({
        id: plan.id,
        slug: plan.slug,
        nombre: plan.nombre,
        descripcion: plan.descripcion,
        precioCentavos: Number(plan.precioCentavos), // entero (ADR-0016)
        cuotaBytes: plan.cuotaBytes.toString(), // bytes como cadena decimal
        maxArchivoBytes: plan.maxArchivoBytes.toString(),
        maxEditores: plan.maxEditores,
        consultasAgenteMensual: plan.consultasAgenteMensual,
        versionesRetenidas: plan.versionesRetenidas,
        diasRetencionPapelera: plan.diasRetencionPapelera,
      })),
    });
  }
}