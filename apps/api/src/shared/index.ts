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
export type { IHealthIndicator } from './application/health/i-health-indicator.port';
export { HealthModule } from './health.module';
export { SystemClock } from './infrastructure/clock/system.clock';
export { apiEnvSchema, workerEnvSchema } from './infrastructure/config/env.schema';
export type { Env, SharedEnvBase } from './infrastructure/config/env.schema';
export { ENV, EnvModule } from './infrastructure/config/env.module';
export { MINIO_CONFIG, MinioConfigModule } from './infrastructure/config/minio-config.module';
export type { MinioConfig } from './infrastructure/config/minio-config.module';
export { formatEnvIssues } from './infrastructure/config/env-report';
export { CorrelationContext } from './infrastructure/correlation/correlation-context';
export { CorrelationIdMiddleware } from './infrastructure/correlation/correlation-id.middleware';
export { loadDotenvFile } from './infrastructure/config/load-dotenv-file';
export { loadEnv } from './infrastructure/config/load-env';
export { redactDeep } from './infrastructure/logging/redact-deep';
export { MinioHealthIndicator } from './infrastructure/health/minio.health-indicator';
export { PostgresHealthIndicator } from './infrastructure/health/postgres.health-indicator';
export { RedisHealthIndicator } from './infrastructure/health/redis.health-indicator';
export { buildDataSourceOptions } from './infrastructure/persistence/data-source';
export { enqueueWithCorrelation } from './infrastructure/queue/enqueue-with-correlation';
export { PingProcessor } from './infrastructure/queue/ping.processor';
export { REDACTED_FIELDS } from './infrastructure/logging/redacted-fields';
export { DomainExceptionFilter } from './presentation/domain-exception.filter';
export { VersionHeaderMiddleware } from './presentation/version-header.middleware';
export { SharedModule } from './shared.module';
