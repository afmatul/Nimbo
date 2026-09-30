// Fixture negativo de `boundaries.js` (DF-51, opción A): ningún archivo de `storage`, incluido `plan-limits.ts`,
// importa `billing`; `billing` implementa `IPlanLimitsProvider` importándolo de `storage/index.ts`.
export { BillingModule } from '../../billing';
export { PlanRepository } from '../../billing/infrastructure/plan.repository';
