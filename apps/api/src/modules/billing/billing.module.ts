import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { IdentityReadersModule } from '../identity';

import { InvoiceService } from './application/invoice.service';
import { PaymentService } from './application/payment.service';
import { PersonalSubscriptionService } from './application/personal-subscription.service';
import { PlanCatalogService } from './application/plan-catalog.service';
import { I_INVOICE_REPOSITORY } from './application/ports/i-invoice-repository.port';
import { I_PAYMENT_GATEWAY } from './application/ports/i-payment-gateway.port';
import { I_PAYMENT_REPOSITORY } from './application/ports/i-payment-repository.port';
import { I_PLAN_REPOSITORY } from './application/ports/i-plan-repository.port';
import { I_SUBSCRIPTION_ADMINISTRATION_READER } from './application/ports/i-subscription-administration.reader.port';
import { I_SUBSCRIPTION_REPOSITORY } from './application/ports/i-subscription-repository.port';
import { SubscriptionAdministration } from './application/subscription-administration';
import { PlanLimitsAdapter } from './infrastructure/adapters/plan-limits.adapter';
import { SimulatedPaymentGateway } from './infrastructure/adapters/simulated-payment-gateway';
import { PlanOrmEntity } from './infrastructure/persistence/plan.orm-entity';
import { SqlSubscriptionAdministrationReader } from './infrastructure/persistence/sql-subscription-administration.reader';
import { TypeOrmInvoiceRepository } from './infrastructure/persistence/typeorm-invoice.repository';
import { TypeOrmPaymentRepository } from './infrastructure/persistence/typeorm-payment.repository';
import { TypeOrmPlanRepository } from './infrastructure/persistence/typeorm-plan.repository';
import { TypeOrmSubscriptionRepository } from './infrastructure/persistence/typeorm-subscription.repository';
import { AccountVerifiedListener } from './presentation/account-verified.listener';
import { PlansController } from './presentation/plans.controller';

/**
 * Núcleo de M4 (specs 006a, 008, 009 y 011), común al `api` y al `worker`: catálogo (`PlansController`,
 * `PlanCatalogService`), límites, alta Personal (oyente y conciliación), cobro simulado y registro de la factura. No
 * conoce `storage`: lo que sube o firma objetos vive en `BillingHttpModule` (`api`) y `BillingWorkerModule` (`worker`),
 * que reciben la instancia de `storage` de su raíz. Exporta a `backoffice` el adaptador de límites y `PlanCatalogService`,
 * `SubscriptionAdministration` (009 T-03), y a esos dos módulos los servicios y repositorios internos que usan. `I_PLAN_LIMITS_PROVIDER` lo enlaza
 * `PlanLimitsBindingModule`: `storage` no conoce a `billing`.
 */
@Module({
  imports: [TypeOrmModule.forFeature([PlanOrmEntity]), IdentityReadersModule],
  controllers: [PlansController],
  providers: [
    PlanCatalogService,
    PlanLimitsAdapter,
    { provide: I_PLAN_REPOSITORY, useClass: TypeOrmPlanRepository },
    PersonalSubscriptionService,
    { provide: I_SUBSCRIPTION_REPOSITORY, useClass: TypeOrmSubscriptionRepository },
    AccountVerifiedListener,
    { provide: I_PAYMENT_GATEWAY, useClass: SimulatedPaymentGateway },
    { provide: I_PAYMENT_REPOSITORY, useClass: TypeOrmPaymentRepository },
    PaymentService,
    { provide: I_INVOICE_REPOSITORY, useClass: TypeOrmInvoiceRepository },
    InvoiceService,
    {
      provide: I_SUBSCRIPTION_ADMINISTRATION_READER,
      useClass: SqlSubscriptionAdministrationReader,
    },
    SubscriptionAdministration,
  ],
  exports: [
    PlanLimitsAdapter,
    PlanCatalogService,
    SubscriptionAdministration,
    PersonalSubscriptionService,
    PaymentService,
    InvoiceService,
    I_PLAN_REPOSITORY,
    I_SUBSCRIPTION_REPOSITORY,
    I_INVOICE_REPOSITORY,
  ],
})
export class BillingModule {}
