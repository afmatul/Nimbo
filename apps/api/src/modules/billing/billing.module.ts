import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { PersonalSubscriptionService } from './application/personal-subscription.service';
import { PlanCatalogService } from './application/plan-catalog.service';
import { I_INVOICE_REPOSITORY } from './application/ports/i-invoice-repository.port';
import { I_PLAN_REPOSITORY } from './application/ports/i-plan-repository.port';
import { I_SUBSCRIPTION_ADMINISTRATION_READER } from './application/ports/i-subscription-administration.reader.port';
import { I_SUBSCRIPTION_REPOSITORY } from './application/ports/i-subscription-repository.port';
import { SubscriptionAdministration } from './application/subscription-administration';
import { PlanLimitsAdapter } from './infrastructure/adapters/plan-limits.adapter';
import { PlanOrmEntity } from './infrastructure/persistence/plan.orm-entity';
import { SqlSubscriptionAdministrationReader } from './infrastructure/persistence/sql-subscription-administration.reader';
import { TypeOrmInvoiceRepository } from './infrastructure/persistence/typeorm-invoice.repository';
import { TypeOrmPlanRepository } from './infrastructure/persistence/typeorm-plan.repository';
import { TypeOrmSubscriptionRepository } from './infrastructure/persistence/typeorm-subscription.repository';
import { AccountVerifiedListener } from './presentation/account-verified.listener';

/**
 * Núcleo de M4 (specs 006a, 008, 009 y 011), común al `api` y al `worker`: catálogo (`PlanCatalogService`), límites,
 * alta Personal (oyente y conciliación), repositorios de plan, suscripción y factura, y `SubscriptionAdministration`
 * para `backoffice`. Sin controladores ni cobro: `GET /billing/plans` vive en `BillingHttpModule` (solo `api`), y el
 * cobro (`PaymentService`, la pasarela), el registro de la factura (`InvoiceService`, que lee el contacto de `identity`)
 * y `RenewalCheckout` en `BillingChargingModule`, que importan el `api` y el `worker` (010). Exporta a `backoffice` el adaptador de límites,
 * `PlanCatalogService` y `SubscriptionAdministration`, y a esos dos módulos de `billing` sus repositorios (los tokens
 * no salen de `index.ts`). `I_PLAN_LIMITS_PROVIDER` lo enlaza `PlanLimitsBindingModule`: `storage` no conoce a
 * `billing`.
 */
@Module({
  imports: [TypeOrmModule.forFeature([PlanOrmEntity])],
  providers: [
    PlanCatalogService,
    PlanLimitsAdapter,
    { provide: I_PLAN_REPOSITORY, useClass: TypeOrmPlanRepository },
    PersonalSubscriptionService,
    { provide: I_SUBSCRIPTION_REPOSITORY, useClass: TypeOrmSubscriptionRepository },
    AccountVerifiedListener,
    { provide: I_INVOICE_REPOSITORY, useClass: TypeOrmInvoiceRepository },
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
    I_PLAN_REPOSITORY,
    I_SUBSCRIPTION_REPOSITORY,
    I_INVOICE_REPOSITORY,
  ],
})
export class BillingModule {}
