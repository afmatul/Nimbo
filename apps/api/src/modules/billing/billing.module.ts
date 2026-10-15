import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { PaymentService } from './application/payment.service';
import { PersonalSubscriptionService } from './application/personal-subscription.service';
import { I_PAYMENT_GATEWAY } from './application/ports/i-payment-gateway.port';
import { I_PAYMENT_REPOSITORY } from './application/ports/i-payment-repository.port';
import { I_SUBSCRIPTION_REPOSITORY } from './application/ports/i-subscription-repository.port';
import { PlanLimitsAdapter } from './infrastructure/adapters/plan-limits.adapter';
import { SimulatedPaymentGateway } from './infrastructure/adapters/simulated-payment-gateway';
import { PlanOrmEntity } from './infrastructure/persistence/plan.orm-entity';
import { TypeOrmPaymentRepository } from './infrastructure/persistence/typeorm-payment.repository';
import { TypeOrmSubscriptionRepository } from './infrastructure/persistence/typeorm-subscription.repository';
import { AccountVerifiedListener } from './presentation/account-verified.listener';

/**
 * M4, spec 006a. Registra el catálogo y exporta el adaptador. El token `I_PLAN_LIMITS_PROVIDER`
 * lo enlaza la raíz de composición (`PlanLimitsBindingModule`), no este módulo: `storage` no conoce a `billing`.
 * 009 suma el alta Personal al verificar la cuenta y la exporta para la conciliación (`BillingWorkerModule`); el
 * oyente solo se activa donde la raíz monta `EventEmitterModule` (`api`). El cobro simulado (`PaymentService`) lo usa
 * la suscripción de pago (T-05).
 */
@Module({
  imports: [TypeOrmModule.forFeature([PlanOrmEntity])],
  providers: [
    PlanLimitsAdapter,
    PersonalSubscriptionService,
    { provide: I_SUBSCRIPTION_REPOSITORY, useClass: TypeOrmSubscriptionRepository },
    AccountVerifiedListener,
    { provide: I_PAYMENT_GATEWAY, useClass: SimulatedPaymentGateway },
    { provide: I_PAYMENT_REPOSITORY, useClass: TypeOrmPaymentRepository },
    PaymentService,
  ],
  exports: [PlanLimitsAdapter, PersonalSubscriptionService],
})
export class BillingModule {}
