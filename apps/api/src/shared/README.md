# `shared` — módulo transversal T1

- **Dueño**: Adrián (`specs/README.md`).
- **Diagrama de origen**: bloque T1 de `docs/sdd/design-model.md` §3 (salud movida desde M8, DF-49).
- **Specs que lo construyen**: 000 (fundaciones). Después de 000 solo entra lo que usan ≥ 3 módulos o lo que el
  proceso necesita antes de que exista un módulo (plan 000 R-11).

## Contenido (al cerrar la spec 000)

`Actor`, `Role`, `IClock` (`SystemClock`, `FixedClock`), `DomainError` y subclases, `DomainExceptionFilter`,
logger Pino con `REDACTED_FIELDS`/`redactDeep`, `CorrelationContext` + middlewares, `loadEnv` (zod),
`buildDataSourceOptions`, `HealthModule` (`HealthService`, `IHealthIndicator`, indicadores Postgres/Redis/MinIO),
cola `ping` (`enqueueWithCorrelation`, `PingProcessor`).

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
