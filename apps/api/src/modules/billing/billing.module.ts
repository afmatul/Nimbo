import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AgentQuotaService } from './application/agent-quota.service';
import { PersonalSubscriptionService } from './application/personal-subscription.service';
import { PlanCatalogService } from './application/plan-catalog.service';
import { I_AGENT_QUOTA } from './application/ports/i-agent-quota.port';
import { I_AGENT_USAGE_REPOSITORY } from './application/ports/i-agent-usage.repository.port';
import { I_INVOICE_REPOSITORY } from './application/ports/i-invoice-repository.port';
import { I_PLAN_REPOSITORY } from './application/ports/i-plan-repository.port';
import { I_SUBSCRIPTION_ADMINISTRATION_READER } from './application/ports/i-subscription-administration.reader.port';
import { I_SUBSCRIPTION_ADMINISTRATION_REPOSITORY } from './application/ports/i-subscription-administration.repository.port';
import { I_SUBSCRIPTION_REPOSITORY } from './application/ports/i-subscription-repository.port';
import { SubscriptionAdministration } from './application/subscription-administration';
import { PlanLimitsAdapter } from './infrastructure/adapters/plan-limits.adapter';
import { PlanOrmEntity } from './infrastructure/persistence/plan.orm-entity';
import { SqlSubscriptionAdministrationReader } from './infrastructure/persistence/sql-subscription-administration.reader';
import { TypeOrmAgentUsageRepository } from './infrastructure/persistence/typeorm-agent-usage.repository';
import { TypeOrmInvoiceRepository } from './infrastructure/persistence/typeorm-invoice.repository';
import { TypeOrmPlanRepository } from './infrastructure/persistence/typeorm-plan.repository';
import { TypeOrmSubscriptionAdministrationRepository } from './infrastructure/persistence/typeorm-subscription-administration.repository';
import { TypeOrmSubscriptionRepository } from './infrastructure/persistence/typeorm-subscription.repository';
import { AccountVerifiedListener } from './presentation/account-verified.listener';

/**
 * Núcleo de M4 (specs 006a, 008, 009 y 011), común al `api` y al `worker`: catálogo (`PlanCatalogService`), límites,
 * alta Personal (oyente y conciliación), repositorios de plan, suscripción y factura, y `SubscriptionAdministration`
 * para `backoffice` y el contador del agente (`AgentQuotaService`, 020). Sin controladores ni cobro: `GET /billing/plans`
 * vive en `BillingHttpModule` (solo `api`), y el cobro (`PaymentService`, la pasarela), el registro de la factura
 * (`InvoiceService`, que lee el contacto de `identity`) y `RenewalCheckout` en `BillingChargingModule`, que importan el
 * `api` y el `worker` (010). Exporta a `backoffice` el adaptador de límites, `PlanCatalogService` y
 * `SubscriptionAdministration`; a `intelligence`, `I_AGENT_QUOTA` (el único token que sale de `index.ts`, PD-18); y a
 * esos dos módulos de `billing` sus repositorios (sus tokens no salen de `index.ts`). `I_PLAN_LIMITS_PROVIDER` lo
 * enlaza `PlanLimitsBindingModule`: `storage` no conoce a `billing`. Con la 011b, `SubscriptionAdministration` también
 * ajusta cuota y vigencia por `ISubscriptionAdministrationRepository` (DF-81).
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
    {
      provide: I_SUBSCRIPTION_ADMINISTRATION_REPOSITORY,
      useClass: TypeOrmSubscriptionAdministrationRepository,
    },
    SubscriptionAdministration,
    { provide: I_AGENT_USAGE_REPOSITORY, useClass: TypeOrmAgentUsageRepository },
    { provide: I_AGENT_QUOTA, useClass: AgentQuotaService },
  ],
  exports: [
    PlanLimitsAdapter,
    PlanCatalogService,
    SubscriptionAdministration,
    PersonalSubscriptionService,
    I_PLAN_REPOSITORY,
    I_SUBSCRIPTION_REPOSITORY,
    I_INVOICE_REPOSITORY,
    I_AGENT_QUOTA,
  ],
})
export class BillingModule {}
