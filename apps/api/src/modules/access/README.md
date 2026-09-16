# `access` — M3a · Compartición y Control de Acceso (lectura de permisos)

- **Dueño**: Adrián (`specs/README.md`).
- **Diagrama de origen**: M3a en `docs/sdd/design-model.md` §3 y `docs/design/diagramas/`.
- **Responsabilidad**: `PermissionResolver`, políticas, `accessibleNodes(actor)`. Única excepción documentada: lee tablas de `storage` y `sharing` por SQL de solo lectura (architecture.md §3, regla 3).
- **Puede depender de**: shared (`docs/sdd/architecture.md` §3; el lint de fronteras lo hace cumplir).
- **Specs que lo construyen**: 003.

## Capas (`docs/sdd/architecture.md` §4)

```
modules/access/
├─ domain/          # entidades, objetos de valor, errores; sin Nest, TypeORM ni zod
├─ application/     # servicios («service» de los diagramas) y puertos (`ports/`)
├─ infrastructure/  # persistencia (*.orm-entity.ts), adaptadores, procesadores
├─ presentation/    # controladores, DTOs, gateways
├─ access.module.ts # lo crea la primera spec del módulo
└─ index.ts         # única API pública
```

## Regla

Otros módulos importan **solo** desde `modules/access/index.ts` (fachadas, puertos que este módulo implementa,
eventos y tipos públicos). Nada de `infrastructure/**` cruza la frontera. Nombres de clases y puertos: los de
`docs/sdd/design-model.md`.
