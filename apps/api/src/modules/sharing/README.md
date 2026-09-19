# `sharing` — M3b · Compartición y Control de Acceso (comparticiones y enlaces)

- **Dueño**: Abel (`specs/README.md`).
- **Diagrama de origen**: M3b en `docs/sdd/design-model.md` §3 y `docs/design/diagramas/`.
- **Responsabilidad**: Comparticiones, enlaces públicos, límite de intentos.
- **Puede depender de**: shared, access, storage, audit (`docs/sdd/architecture.md` §3; el lint de fronteras lo hace cumplir).
- **Specs que lo construyen**: 012, 013.

## Capas (`docs/sdd/architecture.md` §4)

```
modules/sharing/
├─ domain/          # entidades, objetos de valor, errores; sin Nest, TypeORM ni zod
├─ application/     # servicios («service» de los diagramas) y puertos (`ports/`)
├─ infrastructure/  # persistencia (*.orm-entity.ts), adaptadores, procesadores
├─ presentation/    # controladores, DTOs, gateways
├─ sharing.module.ts # lo crea la primera spec del módulo
└─ index.ts         # única API pública
```

## Regla

Otros módulos importan **solo** desde `modules/sharing/index.ts` (fachadas, puertos que este módulo implementa,
eventos y tipos públicos). Nada de `infrastructure/**` cruza la frontera. Nombres de clases y puertos: los de
`docs/sdd/design-model.md`.
