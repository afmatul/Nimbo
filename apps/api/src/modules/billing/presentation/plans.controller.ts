import { Controller, Get } from '@nestjs/common';
import type { PlanCatalogResponse, PlanDto } from '@nimbo/contracts';

import { Public } from '../../../shared';
import { PlanCatalogService } from '../application/plan-catalog.service';
import type { PlanDomain } from '../domain/plan-catalog';

/** Precio entero (ADR-0016); bytes como cadena decimal para no perder precisión en JSON (CA-1). */
const toPlanDto = (plan: PlanDomain): PlanDto => ({
  id: plan.id,
  slug: plan.slug,
  nombre: plan.nombre,
  descripcion: plan.descripcion,
  precioCentavos: plan.precioCentavos,
  cuotaBytes: plan.cuotaBytes.toString(),
  maxArchivoBytes: plan.maxArchivoBytes.toString(),
  maxEditores: plan.maxEditores,
  consultasAgenteMensual: plan.consultasAgenteMensual,
  versionesRetenidas: plan.versionesRetenidas,
  diasRetencionPapelera: plan.diasRetencionPapelera,
});

@Controller('billing/plans')
export class PlansController {
  constructor(private readonly planCatalogService: PlanCatalogService) {}

  @Get()
  @Public()
  async getPlans(): Promise<PlanCatalogResponse> {
    const plans = await this.planCatalogService.list();
    return { planes: plans.map(toPlanDto) };
  }
}
