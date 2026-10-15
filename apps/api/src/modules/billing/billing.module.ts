import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { PlanLimitsAdapter } from './infrastructure/adapters/plan-limits.adapter';
import { PlanOrmEntity } from './infrastructure/persistence/plan.orm-entity';

/**
 * M4, spec 006a. Exporta solo `PlanLimitsAdapter`.
 * Sin catálogo ni controladores: el `worker` lo carga y no publica rutas. El token `I_PLAN_LIMITS_PROVIDER` lo enlaza
 * la raíz de composición (`PlanLimitsBindingModule`): `storage` no conoce a `billing`.
 */
@Module({
  imports: [TypeOrmModule.forFeature([PlanOrmEntity])],
  providers: [PlanLimitsAdapter],
  exports: [PlanLimitsAdapter],
})
export class BillingModule {}
