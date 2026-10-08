// API pública del módulo `billing`. Otros módulos importan solo desde aquí (Art. VIII.3).
export { BillingModule } from './billing.module';
export { PlanLimitsAdapter } from './infrastructure/adapters/plan-limits.adapter';
export { PlanNotFoundError } from './domain/errors';
export * from './billing.module';
export * from './application/plan-catalog.service';
export * from './domain/plan-catalog';