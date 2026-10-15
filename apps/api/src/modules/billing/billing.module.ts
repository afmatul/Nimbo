import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { PaymentService } from './application/payment.service';
import { PersonalSubscriptionService } from './application/personal-subscription.service';
import { PlanCatalogService } from './application/plan-catalog.service';
import { I_PAYMENT_GATEWAY } from './application/ports/i-payment-gateway.port';
import { I_PAYMENT_REPOSITORY } from './application/ports/i-payment-repository.port';
import { I_PLAN_REPOSITORY } from './application/ports/i-plan-repository.port';
import { I_SUBSCRIPTION_REPOSITORY } from './application/ports/i-subscription-repository.port';
import { SubscriptionAdministration } from './application/subscription-administration';
import { PlanLimitsAdapter } from './infrastructure/adapters/plan-limits.adapter';
import { SimulatedPaymentGateway } from './infrastructure/adapters/simulated-payment-gateway';
import { PlanOrmEntity } from './infrastructure/persistence/plan.orm-entity';
import { TypeOrmPaymentRepository } from './infrastructure/persistence/typeorm-payment.repository';
import { TypeOrmPlanRepository } from './infrastructure/persistence/typeorm-plan.repository';
import { TypeOrmSubscriptionRepository } from './infrastructure/persistence/typeorm-subscription.repository';
import { AccountVerifiedListener } from './presentation/account-verified.listener';
import { PlansController } from './presentation/plans.controller';

/**
 * M4, specs 006a, 008, 009 y 011. Registra el catálogo (`PlansController`, `PlanCatalogService` sobre
 * `IPlanRepository`) y exporta el adaptador y las dos fachadas de `backoffice` (011): `PlanCatalogService` y
 * `SubscriptionAdministration`. 009 suma el alta Personal al verificar la cuenta y la exporta para la conciliación
 * (`BillingWorkerModule`); el oyente solo se activa donde la raíz monta `EventEmitterModule` (`api`). El cobro simulado
 * (`PaymentService`) lo usa la suscripción de pago (T-05). El token `I_PLAN_LIMITS_PROVIDER` lo enlaza la raíz de
 * composición (`PlanLimitsBindingModule`), no este módulo: `storage` no conoce a `billing`.
 */
@Module({
  imports: [TypeOrmModule.forFeature([PlanOrmEntity])],
  controllers: [PlansController],
  providers: [
    PlanCatalogService,
    PlanLimitsAdapter,
    SubscriptionAdministration,
    { provide: I_PLAN_REPOSITORY, useClass: TypeOrmPlanRepository },
    PersonalSubscriptionService,
    { provide: I_SUBSCRIPTION_REPOSITORY, useClass: TypeOrmSubscriptionRepository },
    AccountVerifiedListener,
    { provide: I_PAYMENT_GATEWAY, useClass: SimulatedPaymentGateway },
    { provide: I_PAYMENT_REPOSITORY, useClass: TypeOrmPaymentRepository },
    PaymentService,
  ],
  exports: [
    PlanLimitsAdapter,
    PlanCatalogService,
    SubscriptionAdministration,
    PersonalSubscriptionService,
  ],
})
export class BillingModule {}
