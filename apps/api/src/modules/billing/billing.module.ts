import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { PlanCatalogService } from './application/plan-catalog.service';
import { I_PLAN_REPOSITORY } from './application/ports/i-plan-repository.port';
import { SubscriptionAdministration } from './application/subscription-administration';
import { PlanLimitsAdapter } from './infrastructure/adapters/plan-limits.adapter';
import { PlanOrmEntity } from './infrastructure/persistence/plan.orm-entity';
import { TypeOrmPlanRepository } from './infrastructure/persistence/typeorm-plan.repository';
import { PlansController } from './presentation/plans.controller';

/**
 * M4, specs 006a, 008 y 011. Registra el catálogo (`PlansController`, `PlanCatalogService` sobre `IPlanRepository`) y
 * exporta el adaptador y las dos fachadas de `backoffice` (011): `PlanCatalogService` y `SubscriptionAdministration`.
 * El token `I_PLAN_LIMITS_PROVIDER` lo enlaza la raíz de composición (`PlanLimitsBindingModule`), no este módulo:
 * `storage` no conoce a `billing`.
 */
@Module({
  imports: [TypeOrmModule.forFeature([PlanOrmEntity])],
  controllers: [PlansController],
  providers: [
    PlanCatalogService,
    PlanLimitsAdapter,
    SubscriptionAdministration,
    { provide: I_PLAN_REPOSITORY, useClass: TypeOrmPlanRepository },
  ],
  exports: [PlanLimitsAdapter, PlanCatalogService, SubscriptionAdministration],
})
export class BillingModule {}
