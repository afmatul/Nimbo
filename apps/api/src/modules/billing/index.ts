// API pública del módulo `billing`. Otros módulos importan solo desde aquí (Art. VIII.3).
export { BillingModule } from './billing.module';
export { BillingWorkerModule } from './billing-worker.module';
export { PlanLimitsAdapter } from './infrastructure/adapters/plan-limits.adapter';
export { PlanNotFoundError } from './domain/errors';
export { PlanCatalogService } from './application/plan-catalog.service';
export { SubscriptionAdministration } from './application/subscription-administration';
export type { PlanClientCount } from './application/subscription-administration';
export type { NewPlan, Plan } from './domain/plan.entity';
export type { PlanLimitsSet } from './domain/plan-limits-set.vo';
