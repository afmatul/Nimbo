# `intelligence` — M6 · Inteligencia Documental

- **Dueño**: Fátima (`specs/README.md`).
- **Diagrama de origen**: M6 en `docs/sdd/design-model.md` §3 y `docs/design/diagramas/`.
- **Responsabilidad**: Indexación, recuperación híbrida, agente con citas; implementa `IIndexQueue`.
- **Puede depender de**: shared, storage, access, billing (`IAgentQuota`), realtime (`docs/sdd/architecture.md` §3; el lint de fronteras lo hace cumplir).
- **Specs que lo construyen**: 018 (contenido), 019, 020.

## Capas (`docs/sdd/architecture.md` §4)

```
modules/intelligence/
├─ domain/          # entidades, objetos de valor, errores; sin Nest, TypeORM ni zod
├─ application/     # servicios («service» de los diagramas) y puertos (`ports/`)
├─ infrastructure/  # persistencia (*.orm-entity.ts), adaptadores, procesadores
├─ presentation/    # controladores, DTOs, gateways
├─ intelligence.module.ts # lo crea la primera spec del módulo
└─ index.ts         # única API pública
```

## Regla

Otros módulos importan **solo** desde `modules/intelligence/index.ts` (fachadas, puertos que este módulo implementa,
eventos y tipos públicos). Nada de `infrastructure/**` cruza la frontera. Nombres de clases y puertos: los de
`docs/sdd/design-model.md`.
