# `storage` — M2 · Motor de Almacenamiento

- **Dueño**: Abel (`specs/README.md`).
- **Diagrama de origen**: M2 en `docs/sdd/design-model.md` §3 y `docs/design/diagramas/`.
- **Responsabilidad**: Nodos, cargas, descargas, papelera, versiones, cuota, búsqueda por metadatos, vista previa.
- **Puede depender de**: shared, access, audit, realtime (`docs/sdd/architecture.md` §3; el lint de fronteras lo
  hace cumplir). **No** depende de `billing`: `storage` declara `IPlanLimitsProvider` y `billing` lo implementa
  (DF-51, opción A); el token se enlaza en `AppModule`.
- **Specs que lo construyen**: 005 (carga y descarga, primera spec del módulo), 006, 007, 014, 017, 018.

## Capas (`docs/sdd/architecture.md` §4)

```
modules/storage/
├─ domain/          # FileName, ObjectKey, FileKind, QuotaPolicy, UploadSession, File, FileVersion y errores;
│                   # sin Nest, TypeORM, zod ni @nimbo/contracts (ADR-0008): los límites llegan como argumentos
├─ application/     # servicios («service» de los diagramas), plan-limits.ts y puertos (`ports/`)
├─ infrastructure/  # persistencia (*.orm-entity.ts), adaptadores (MagicBytesDetector, MinIO), procesadores
├─ presentation/    # controladores; el contrato de códigos de error contra `contracts/storage`
├─ storage.module.ts # llega con los controladores de 005 (T-42)
└─ index.ts         # única API pública
```

## Regla

Otros módulos importan **solo** desde `modules/storage/index.ts`. Hoy exporta `I_PLAN_LIMITS_PROVIDER` y los tipos
`IPlanLimitsProvider` y `PlanLimits`. No exporta `MagicBytesDetector`, `IExpiredUploadScanner`, el adaptador de
auditoría ni los repositorios. Nada de `infrastructure/**` cruza la frontera. Nombres de clases y puertos: los de
`docs/sdd/design-model.md`.
