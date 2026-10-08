import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlansController } from './presentation/plans.controller';
import { PlanCatalogService } from './application/plan-catalog.service';
import { IPlanRepository } from './application/i-plan-repository';
import { TypeOrmPlanRepository } from './infrastructure/persistence/typeorm-plan.repository';
import { PlanOrmEntity } from './infrastructure/persistence/plan.orm-entity';
import { PlanLimitsAdapter } from './infrastructure/adapters/plan-limits.adapter';
// Importa el token de límites si aplica, por ejemplo:
// import { I_PLAN_LIMITS_PROVIDER } from ...;

@Module({
  imports: [TypeOrmModule.forFeature([PlanOrmEntity])],
  controllers: [PlansController],
  providers: [
    PlanCatalogService,
    PlanLimitsAdapter,
    {
      provide: IPlanRepository,
      useClass: TypeOrmPlanRepository,
    },

  ],
  exports: [PlanCatalogService, PlanLimitsAdapter], // <--- ¡Asegúrate de exportarlo!
})
export class BillingModule {}