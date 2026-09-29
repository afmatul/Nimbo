# `storage` — M2 · Motor de Almacenamiento

- **Dueño**: Abel (`specs/README.md`).
- **Diagrama de origen**: M2 en `docs/sdd/design-model.md` §3 y `docs/design/diagramas/`.
- **Responsabilidad**: Nodos, cargas, descargas, papelera, versiones, cuota, búsqueda por metadatos, vista previa.
- **Puede depender de**: shared, access, audit, realtime (`docs/sdd/architecture.md` §3; el lint de fronteras lo hace cumplir). Declara y exporta `IPlanLimitsProvider`; no depende de `billing` (ADR-0021).
- **Specs que lo construyen**: 005, 006, 007, 014, 017, 018.

## Capas (`docs/sdd/architecture.md` §4)

```
modules/storage/
├─ domain/          # entidades, objetos de valor, errores; sin Nest, TypeORM ni zod
├─ application/     # servicios («service» de los diagramas) y puertos (`ports/`)
├─ infrastructure/  # persistencia (*.orm-entity.ts), adaptadores, procesadores
├─ presentation/    # controladores, DTOs, gateways
├─ storage.module.ts # lo crea la primera spec del módulo
└─ index.ts         # única API pública
```

## Regla

Otros módulos importan **solo** desde `modules/storage/index.ts` (fachadas, puertos que este módulo implementa,
el puerto `IPlanLimitsProvider` que declara y `billing` implementa, eventos y tipos públicos). Nada de `infrastructure/**` cruza la frontera. Nombres de clases y puertos: los de
`docs/sdd/design-model.md`.
