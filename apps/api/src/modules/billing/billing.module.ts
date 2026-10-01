import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { PlanLimitsAdapter } from './infrastructure/adapters/plan-limits.adapter';
import { PlanOrmEntity } from './infrastructure/persistence/plan.orm-entity';

/**
 * M4, spec 006a. Registra el catálogo y exporta el adaptador. El token `I_PLAN_LIMITS_PROVIDER`
 * lo enlaza la raíz de composición (`PlanLimitsBindingModule`), no este módulo: `storage` no conoce a `billing`.
 */
@Module({
  imports: [TypeOrmModule.forFeature([PlanOrmEntity])],
  providers: [PlanLimitsAdapter],
  exports: [PlanLimitsAdapter],
})
export class BillingModule {}
