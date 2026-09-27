# `backoffice` — M8 · Administración, Soporte y Operación

- **Dueño**: Adrián (`specs/README.md`).
- **Diagrama de origen**: M8 en `docs/sdd/design-model.md` §3 y `docs/design/diagramas/`.
- **Responsabilidad**: Administración, soporte, métricas y colas. La salud (DF-49) y `RolesGuard` con los guards globales (DF-50, spec 003 D-2) pasaron a `shared`.
- **Puede depender de**: shared, audit, identity, billing, storage (fachadas, DF-04) (`docs/sdd/architecture.md` §3; el lint de fronteras lo hace cumplir).
- **Specs que lo construyen**: 011, 022.

## Capas (`docs/sdd/architecture.md` §4)

```
modules/backoffice/
├─ domain/          # entidades, objetos de valor, errores; sin Nest, TypeORM ni zod
├─ application/     # servicios («service» de los diagramas) y puertos (`ports/`)
├─ infrastructure/  # persistencia (*.orm-entity.ts), adaptadores, procesadores
├─ presentation/    # controladores, DTOs, gateways
├─ backoffice.module.ts # lo crea la primera spec del módulo
└─ index.ts         # única API pública
```

## Regla

Otros módulos importan **solo** desde `modules/backoffice/index.ts` (fachadas, puertos que este módulo implementa,
eventos y tipos públicos). Nada de `infrastructure/**` cruza la frontera. Nombres de clases y puertos: los de
`docs/sdd/design-model.md`.
