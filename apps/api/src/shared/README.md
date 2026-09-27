# `shared` — módulo transversal T1

- **Dueño**: Adrián (`specs/README.md`).
- **Diagrama de origen**: bloque T1 de `docs/sdd/design-model.md` §3 (salud movida desde M8, DF-49; `RolesGuard`
  movido desde M8, DF-50).
- **Specs que lo construyen**: 000 (fundaciones) y 003 (guards globales). Después de 000 solo entra lo que usan
  ≥ 3 módulos o lo que el proceso necesita antes de que exista un módulo (plan 000 R-11).

## Contenido (al cerrar la spec 000)

`Actor`, `Role`, `IClock` (`SystemClock`, `FixedClock`), `DomainError` y subclases, `DomainExceptionFilter`,
logger Pino con `REDACTED_FIELDS`/`redactDeep`, `CorrelationContext` + middlewares, `loadEnv` (zod),
`buildDataSourceOptions`, `HealthModule` (`HealthService`, `IHealthIndicator`, indicadores Postgres/Redis/MinIO),
cola `ping` (`enqueueWithCorrelation`, `PingProcessor`).

## Con la spec 001 (PD-30)

Entra el puerto `IRateLimiter` con su implementación `RedisRateLimiter`. Lo consumen `identity` (límite por correo,
001 D-15) y, desde la 012, `sharing`. Vive aquí porque `identity` no puede depender de `sharing` (ADR-0010).

## Con la spec 003 (DF-50, 003 D-2)

Los guards globales viven aquí, no en `backoffice`: `JwtAuthGuard` y `RolesGuard` niegan por defecto, y solo las
rutas con `@Public()` se atienden sin sesión. Toda ruta declara `@Public()` o `@Roles(...)`. `JwtAuthGuard` verifica
el token con el puerto token→`Actor` que declara `shared` y que implementa `identity` (002 D-14), así que `shared`
sigue sin importar módulos. También entra `withActor()` (ADR-0005).

## Capas

```
shared/
├─ domain/          # sin Nest, TypeORM ni zod
├─ application/     # HealthService, puertos (IHealthIndicator)
├─ infrastructure/  # config, logging, correlation, persistence, queue, health, clock
├─ presentation/    # HealthController, DomainExceptionFilter, VersionHeaderMiddleware
├─ shared.module.ts  health.module.ts
└─ index.ts         # única API pública
```

## Regla

Otros módulos y `apps/worker` importan **solo** desde `shared/index.ts` (Art. VIII.3; lint de fronteras, CA-5).
`shared` no importa de ningún módulo.
