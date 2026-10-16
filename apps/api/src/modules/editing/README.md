# `editing` — M5 · Edición Colaborativa .docx e Historial con Autoría

- **Dueño**: Adrián (`specs/README.md`).
- **Diagrama de origen**: M5 en `docs/sdd/design-model.md` §3 y `docs/design/diagramas/`.
- **Responsabilidad**: Sesiones de edición, presencia, callback de ONLYOFFICE, autoría e historial. Aporta `OnlyOfficeHealthIndicator` (DF-29).
- **Puede depender de**: shared, storage, access, realtime, audit (`docs/sdd/architecture.md` §3; el lint de fronteras lo hace cumplir).
  **No** depende de `billing`: el plan de la cuenta propietaria sale de `IPlanLimitsProvider` de `storage` (DF-51), y
  `identity → editing` (para implementar `IUserDirectory`, DF-74) cerraría el ciclo `editing → billing → identity → editing`.
- **Declara**: `IUserDirectory` (nombres visibles de los participantes; lo implementa `identity` con
  `UserDirectoryAdapter` y lo enlaza la raíz con `UserDirectoryBindingModule`, DF-74).
- **Specs que lo construyen**: 016.

## Capas (`docs/sdd/architecture.md` §4)

```
modules/editing/
├─ domain/          # entidades, objetos de valor, errores; sin Nest, TypeORM ni zod
├─ application/     # servicios («service» de los diagramas) y puertos (`ports/`)
├─ infrastructure/  # persistencia (*.orm-entity.ts), adaptadores, procesadores
├─ presentation/    # controladores, DTOs, gateways
├─ editing.module.ts # lo crea la primera spec del módulo
└─ index.ts         # única API pública
```

## Regla

Otros módulos importan **solo** desde `modules/editing/index.ts` (fachadas, puertos que este módulo implementa,
eventos y tipos públicos). Nada de `infrastructure/**` cruza la frontera. Nombres de clases y puertos: los de
`docs/sdd/design-model.md`.
