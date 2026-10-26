// API pública del módulo `billing`. Otros módulos importan solo desde aquí (Art. VIII.3).
export { BillingModule } from './billing.module';
export { BillingHttpModule } from './billing-http.module';
export { BillingWorkerModule } from './billing-worker.module';
export { PlanLimitsAdapter } from './infrastructure/adapters/plan-limits.adapter';
export { PlanNotFoundError } from './domain/errors';
export { PlanInvalidError } from './domain/errors/plan-invalid.error';
export { PlanCatalogService } from './application/plan-catalog.service';
export { SubscriptionAdministration } from './application/subscription-administration';
export type {
  AdjustQuotaCommand,
  AdjustValidityCommand,
  ExtraQuota,
} from './application/subscription-administration';
export type { PlanClientCount } from './application/ports/i-subscription-administration.reader.port';
export type { SubscriptionLimits } from './application/ports/i-subscription-administration.repository.port';
export { QuotaBelowUsageError } from './domain/errors/quota-below-usage.error';
export { QuotaInvalidError } from './domain/errors/quota-invalid.error';
export { ValidityNotExtendedError } from './domain/errors/validity-not-extended.error';
export type { NewPlan, Plan } from './domain/entities/plan.entity';
export type { PlanLimitsSet } from './domain/value-objects/plan-limits-set.vo';
