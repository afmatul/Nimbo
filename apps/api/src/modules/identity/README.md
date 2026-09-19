# `identity` — M1 · Identidad y Acceso

- **Dueño**: Juan Marcos (`specs/README.md`).
- **Diagrama de origen**: M1 en `docs/sdd/design-model.md` §3 y `docs/design/diagramas/`.
- **Responsabilidad**: Registro, verificación, login, refresh, sesiones y dispositivos.
- **Puede depender de**: shared, notifications, audit (`docs/sdd/architecture.md` §3; el lint de fronteras lo hace cumplir).
- **Specs que lo construyen**: 001, 002.

## Capas (`docs/sdd/architecture.md` §4)

```
modules/identity/
├─ domain/          # entidades, objetos de valor, errores; sin Nest, TypeORM ni zod
├─ application/     # servicios («service» de los diagramas) y puertos (`ports/`)
├─ infrastructure/  # persistencia (*.orm-entity.ts), adaptadores, procesadores
├─ presentation/    # controladores, DTOs, gateways
├─ identity.module.ts # lo crea la primera spec del módulo
└─ index.ts         # única API pública
```

## Regla

Otros módulos importan **solo** desde `modules/identity/index.ts` (fachadas, puertos que este módulo implementa,
eventos y tipos públicos). Nada de `infrastructure/**` cruza la frontera. Nombres de clases y puertos: los de
`docs/sdd/design-model.md`.
