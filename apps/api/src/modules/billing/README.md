# `billing` — M4 · Suscripciones y Pago

- **Dueño**: Juan Marcos (`specs/README.md`).
- **Diagrama de origen**: M4 en `docs/sdd/design-model.md` §3 y `docs/design/diagramas/`.
- **Responsabilidad**: Planes, suscripciones, pagos, facturas, renovación; implementa `IPlanLimitsProvider` e `IAgentQuota`.
- **Puede depender de**: shared, notifications, audit, storage (importa el puerto `IPlanLimitsProvider` que declara `storage`, ADR-0022; `IObjectStorage` para facturas sigue abierto) (`docs/sdd/architecture.md` §3; el lint de fronteras lo hace cumplir).
- **Specs que lo construyen**: 006a, 008, 009, 010, 011; 020 (contador del agente: `uso_agente`, `AgentQuotaService` detrás de `IAgentQuota`, consumido por `intelligence`).

## Capas (`docs/sdd/architecture.md` §4)

```
modules/billing/
├─ domain/          # entidades, objetos de valor, errores; sin Nest, TypeORM ni zod
├─ application/     # servicios («service» de los diagramas) y puertos (`ports/`)
├─ infrastructure/  # persistencia (*.orm-entity.ts), adaptadores, procesadores
├─ presentation/    # controladores, DTOs, gateways
├─ billing.module.ts # lo crea la primera spec del módulo
└─ index.ts         # única API pública
```

## Regla

Otros módulos importan **solo** desde `modules/billing/index.ts` (fachadas, puertos que este módulo implementa,
eventos y tipos públicos). Nada de `infrastructure/**` cruza la frontera. Nombres de clases y puertos: los de
`docs/sdd/design-model.md`.
