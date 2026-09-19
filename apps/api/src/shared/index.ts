// Única API pública del módulo transversal `shared` (plan 000 §6.2).
// Otros módulos y `apps/worker` importan solo desde aquí; el lint de fronteras (T-28) lo hace cumplir.
export type { Actor } from './domain/actor';
export {
  ConflictError,
  DomainError,
  ForbiddenError,
  InvalidInputError,
  NotFoundError,
  UnauthorizedError,
} from './domain/errors';
export { FixedClock } from './domain/fixed.clock';
export { I_CLOCK } from './domain/i-clock.port';
export type { IClock } from './domain/i-clock.port';
export { Role } from './domain/role.enum';
export { HealthModule } from './health.module';
export { SystemClock } from './infrastructure/clock/system.clock';
