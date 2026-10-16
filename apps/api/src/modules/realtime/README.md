# `realtime` — T3 · transversal (generalizado desde M5)

- **Dueño**: Adrián (`specs/README.md`).
- **Diagrama de origen**: T3 en `docs/sdd/design-model.md` §3 y `docs/design/diagramas/`.
- **Responsabilidad**: Único gateway Socket.IO, salas por usuario y documento. Valida el token del handshake con el puerto token→`Actor` que define `shared` (lo implementa `identity`, sin que `realtime` lo importe) y declara su puerto de publicación (ADR-0010).
- **Puede depender de**: shared (`docs/sdd/architecture.md` §3; el lint de fronteras lo hace cumplir).
- **Specs que lo construyen**: 015.

## Capas (`docs/sdd/architecture.md` §4)

```
modules/realtime/
├─ domain/          # entidades, objetos de valor, errores; sin Nest, TypeORM ni zod
├─ application/     # servicios («service» de los diagramas) y puertos (`ports/`)
├─ infrastructure/  # persistencia (*.orm-entity.ts), adaptadores, procesadores
├─ presentation/    # controladores, DTOs, gateways
├─ realtime.module.ts # lo crea la primera spec del módulo
└─ index.ts         # única API pública
```

## Regla

Otros módulos importan **solo** desde `modules/realtime/index.ts` (fachadas, puertos que este módulo implementa,
eventos y tipos públicos). Nada de `infrastructure/**` cruza la frontera. Nombres de clases y puertos: los de
`docs/sdd/design-model.md`.
