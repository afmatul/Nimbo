// Única API pública del módulo transversal `shared` (plan 000 §6.2).
// Otros módulos y `apps/worker` importan solo desde aquí; el lint de fronteras (T-28) lo hace cumplir.
export { createActor } from './domain/actor';
export type { Actor } from './domain/actor';
export {
  ConflictError,
  DomainError,
  ForbiddenError,
  InvalidInputError,
  NotFoundError,
  RateLimitExceededError,
  TooManyRequestsError,
  InsufficientRoleError,
  UnauthenticatedError,
  UnauthorizedError,
} from './domain/errors';
export type { ErrorDetails, FieldIssue } from './domain/errors';
export { FixedClock } from './domain/fixed.clock';
export { I_CLOCK } from './domain/i-clock.port';
export type { IClock } from './domain/i-clock.port';
export { ALL_ROLES, Role } from './domain/role.enum';
export {
  ACCESS_TOKEN_STRATEGY,
  I_ACCESS_TOKEN_VERIFIER,
} from './application/auth/i-access-token-verifier.port';
export type {
  AccessTokenClaims,
  AccessTokenVerification,
  IAccessTokenVerifier,
} from './application/auth/i-access-token-verifier.port';
export type { IHealthIndicator } from './application/health/i-health-indicator.port';
export { I_TRANSACTION_RUNNER } from './application/persistence/i-transaction-runner.port';
export type { ITransactionRunner } from './application/persistence/i-transaction-runner.port';
export { I_RATE_LIMITER } from './application/rate-limit/i-rate-limiter.port';
export type {
  IRateLimiter,
  RateLimitDecision,
  RateLimitRule,
} from './application/rate-limit/i-rate-limiter.port';
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
export { BIGINT_TRANSFORMER } from './infrastructure/persistence/bigint.transformer';
export { buildDataSourceOptions } from './infrastructure/persistence/data-source';
export { TransactionContext } from './infrastructure/persistence/transaction-context';
export { REDIS_CLIENT } from './infrastructure/redis/redis-client.provider';
export { enqueueWithCorrelation } from './infrastructure/queue/enqueue-with-correlation';
export { PingProcessor } from './infrastructure/queue/ping.processor';
export { PING_QUEUE, PingQueue } from './infrastructure/queue/ping.queue';
export type { PingJobData } from './infrastructure/queue/ping.queue';
export { REDACTED_FIELDS } from './infrastructure/logging/redacted-fields';
export { configureHttpApp } from './presentation/configure-http-app';
export type { HttpAppEnv } from './presentation/configure-http-app';
export { AuthGuardsModule } from './presentation/auth/auth-guards.module';
export { CurrentActor } from './presentation/auth/current-actor.decorator';
export { CurrentSessionId } from './presentation/auth/current-session-id.decorator';
export { IS_PUBLIC, Public } from './presentation/auth/public.decorator';
export { Roles, ROLES_KEY } from './presentation/auth/roles.decorator';
export { DomainExceptionFilter } from './presentation/domain-exception.filter';
export { VersionHeaderMiddleware } from './presentation/version-header.middleware';
export { ZodValidationPipe } from './presentation/zod-validation.pipe';
export type { InvalidInputFactory } from './presentation/zod-validation.pipe';
export { SharedModule } from './shared.module';
