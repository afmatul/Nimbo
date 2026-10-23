# `intelligence` — M6 · Inteligencia Documental

- **Dueño**: Fátima (`specs/README.md`); la 019 la implementa Adrián.
- **Diagrama de origen**: M6 en `docs/sdd/design-model.md` §3 y `docs/design/diagramas/`.
- **Responsabilidad**: Indexación de la versión vigente de cada archivo (019), recuperación híbrida y agente con citas (020).
  La indexación se dispara con el evento `storage.file-version-created` (019 RN-11, DF-77); `IIndexQueue` es **interno**
  de este módulo y ya no lo cruza nadie (cierra PD-18).
- **Puede depender de**: shared, storage, access, billing (`IAgentQuota`, 020), realtime, audit (resultados de la
  indexación, 019 CA-21) (`docs/sdd/architecture.md` §3; el lint de fronteras lo hace cumplir).
- **Expone por HTTP** solo el estado de indexación y «Reintentar» (`GET /files/:fileId/indexing`,
  `POST /files/:fileId/indexing/retry`, `@Roles(CLIENT)`, 019 plan §4); el aviso en vivo `indexing.status-changed` sale
  por el canal de 015, directo desde el `api` o por el relay de `index-status` desde el `worker` (ADR-0031 d).
- **No expone** fragmentos ni texto por HTTP en la 019: los lee la 020 con `accessibleNodes(actor)` antes de ordenar
  por similitud (DF-14). Ningún rol interno ve texto indexado (019 CA-20).
- **Specs que lo construyen**: 019, 020; 018 consume el índice de texto (`texto_busq`) sin modificarlo.
- **Pendiente al cerrar la 019** (T-11): composición de los módulos `api` y `worker`, puertos internos y estados de
  indexación.

## Capas (`docs/sdd/architecture.md` §4)

```
modules/intelligence/
├─ domain/          # entidades, objetos de valor, errores; sin Nest, TypeORM ni zod
├─ application/     # servicios («service» de los diagramas) y puertos (`ports/`)
├─ infrastructure/  # persistencia (*.orm-entity.ts), adaptadores, procesadores
├─ presentation/    # controladores, DTOs, oyentes de eventos
├─ intelligence.module.ts # api (lo crea la 019, T-05)
├─ intelligence-worker.module.ts # worker (lo crea la 019, T-06)
└─ index.ts         # única API pública
```

## Regla

Otros módulos importan **solo** desde `modules/intelligence/index.ts` (fachadas, puertos que este módulo implementa,
eventos y tipos públicos). Nada de `infrastructure/**` cruza la frontera. Nombres de clases y puertos: los de
`docs/sdd/design-model.md`.
