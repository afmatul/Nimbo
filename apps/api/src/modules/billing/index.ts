// API pública del módulo `billing`. Otros módulos importan solo desde aquí (Art. VIII.3).
export { BillingModule } from './billing.module';
export { BillingWorkerModule } from './billing-worker.module';
export { PlanLimitsAdapter } from './infrastructure/adapters/plan-limits.adapter';
export { PlanNotFoundError } from './domain/errors';
