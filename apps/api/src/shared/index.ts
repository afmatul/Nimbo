// Única API pública del módulo transversal `shared` (plan 000 §6.2).
// Otros módulos y `apps/worker` importan solo desde aquí; el lint de fronteras (T-28) lo hace cumplir.
export { HealthModule } from './health.module';
