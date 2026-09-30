// API pública del módulo `storage`. Otros módulos importan solo desde aquí (Art. VIII.3, CA-5).
// No se exportan el detector de tipos, el escáner de cargas vencidas, el adaptador de auditoría ni los repositorios.
export { I_PLAN_LIMITS_PROVIDER } from './application/plan-limits';
export type { IPlanLimitsProvider, PlanLimits } from './application/plan-limits';
