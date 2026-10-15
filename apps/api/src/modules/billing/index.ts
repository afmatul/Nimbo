// API pública del módulo `billing`. Otros módulos importan solo desde aquí (Art. VIII.3).
export { BillingHttpModule } from './billing-http.module';
export { BillingModule } from './billing.module';
export { PlanLimitsAdapter } from './infrastructure/adapters/plan-limits.adapter';
export { PlanNotFoundError } from './domain/errors';
