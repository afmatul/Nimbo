import { Module } from '@nestjs/common';

import { I_PLAN_REPOSITORY } from './application/i-plan-repository';
import { PlanCatalogService } from './application/plan-catalog.service';
import { BillingModule } from './billing.module';
import { TypeOrmPlanRepository } from './infrastructure/persistence/typeorm-plan.repository';
import { PlansController } from './presentation/plans.controller';

/**
 * Catálogo de planes de la spec 008 (`PlansController`, `PlanCatalogService` sobre `IPlanRepository`). Solo `api` lo
 * registra en `app.module.ts`; el `worker` carga `BillingModule` a través de `PlanLimitsBindingModule` y no publica
 * `GET /billing/plans` (mismo criterio que `AuditHttpModule`).
 */
@Module({
  imports: [BillingModule],
  controllers: [PlansController],
  providers: [PlanCatalogService, { provide: I_PLAN_REPOSITORY, useClass: TypeOrmPlanRepository }],
})
export class BillingHttpModule {}
