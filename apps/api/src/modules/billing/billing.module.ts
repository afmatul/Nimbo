import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { PersonalSubscriptionService } from './application/personal-subscription.service';
import { I_SUBSCRIPTION_REPOSITORY } from './application/ports/i-subscription-repository.port';
import { PlanLimitsAdapter } from './infrastructure/adapters/plan-limits.adapter';
import { PlanOrmEntity } from './infrastructure/persistence/plan.orm-entity';
import { TypeOrmSubscriptionRepository } from './infrastructure/persistence/typeorm-subscription.repository';
import { AccountVerifiedListener } from './presentation/account-verified.listener';

/**
 * M4, spec 006a. Registra el catálogo y exporta el adaptador. El token `I_PLAN_LIMITS_PROVIDER`
 * lo enlaza la raíz de composición (`PlanLimitsBindingModule`), no este módulo: `storage` no conoce a `billing`.
 * 009 suma el alta Personal al verificar la cuenta y la exporta para la conciliación (`BillingWorkerModule`); el
 * oyente solo se activa donde la raíz monta `EventEmitterModule` (`api`).
 */
@Module({
  imports: [TypeOrmModule.forFeature([PlanOrmEntity])],
  providers: [
    PlanLimitsAdapter,
    PersonalSubscriptionService,
    { provide: I_SUBSCRIPTION_REPOSITORY, useClass: TypeOrmSubscriptionRepository },
    AccountVerifiedListener,
  ],
  exports: [PlanLimitsAdapter, PersonalSubscriptionService],
})
export class BillingModule {}
