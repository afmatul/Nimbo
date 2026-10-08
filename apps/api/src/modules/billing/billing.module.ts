import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlansController } from './presentation/plans.controller';
import { PlanCatalogService } from './application/plan-catalog.service';
import { I_PLAN_REPOSITORY } from './application/i-plan-repository';
import { TypeOrmPlanRepository } from './infrastructure/persistence/typeorm-plan.repository';
import { PlanOrmEntity } from './infrastructure/persistence/plan.orm-entity';
import { PlanLimitsAdapter } from './infrastructure/adapters/plan-limits.adapter';

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