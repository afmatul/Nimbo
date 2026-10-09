import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { I_PLAN_REPOSITORY } from './application/i-plan-repository';
import { PlanCatalogService } from './application/plan-catalog.service';
import { PlanLimitsAdapter } from './infrastructure/adapters/plan-limits.adapter';
import { PlanOrmEntity } from './infrastructure/persistence/plan.orm-entity';
import { TypeOrmPlanRepository } from './infrastructure/persistence/typeorm-plan.repository';
import { PlansController } from './presentation/plans.controller';

@Module({
  imports: [TypeOrmModule.forFeature([PlanOrmEntity])],
  controllers: [PlansController],
  providers: [
    PlanCatalogService,
    PlanLimitsAdapter,
    {
      provide: I_PLAN_REPOSITORY,
      useClass: TypeOrmPlanRepository,
    },
  ],
  exports: [PlanLimitsAdapter],
})
export class BillingModule {}
