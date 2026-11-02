# `access` — M3a · Compartición y Control de Acceso (lectura de permisos)

- **Dueño**: Adrián (`specs/README.md`).
- **Diagrama de origen**: M3a en `docs/sdd/design-model.md` §3 y `docs/design/diagramas/`.
- **Responsabilidad**: `PermissionResolver`, políticas, `accessibleNodes(actor)`. Única excepción documentada: lee tablas de `storage` y `sharing` por SQL de solo lectura (architecture.md §3, regla 3).
- **Puede depender de**: shared (`docs/sdd/architecture.md` §3; el lint de fronteras lo hace cumplir).
- **Specs que lo construyen**: 003 (base), 005 (propiedad y RLS) y 012 (comparticiones).

## Capas (`docs/sdd/architecture.md` §4)

```
modules/access/
├─ domain/          # entidades, objetos de valor, errores; sin Nest, TypeORM ni zod
├─ application/     # servicios («service» de los diagramas) y puertos (`ports/`)
├─ infrastructure/  # persistencia (*.orm-entity.ts), adaptadores, procesadores
├─ presentation/    # controladores, DTOs, gateways
├─ access.module.ts # provee PermissionResolver e I_ACCESS_LEVEL_READER → SqlAccessLevelReader (003)
└─ index.ts         # única API pública
```

## Regla

Otros módulos importan **solo** desde `modules/access/index.ts` (fachadas, puertos que este módulo implementa,
eventos y tipos públicos). Nada de `infrastructure/**` cruza la frontera. Nombres de clases y puertos: los de
`docs/sdd/design-model.md`.

## API pública (003, plan §5 y §6.5)

| Exportación                | Qué es                                                                                                                                                                                                                             |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AccessModule`             | Lo importa `AppModule`. Provee `PermissionResolver` y, detrás de `I_ACCESS_LEVEL_READER` (interno), `SqlAccessLevelReader`                                                                                                         |
| `PermissionResolver`       | `levelFor(actor, nodeId)` y `can(actor, nodeId, action)`. Los roles internos reciben `null`/`false` sin consultar (CA-9); un `nodeId` que no es UUID, también                                                                      |
| `accessibleNodes(actor)`   | Función pura: `AccessibleNodesFragment` `{ sql, parameters }`, un `SELECT (nodo_id uuid, tipo_nodo text, nivel text)` con parámetros `access_*`: propios vivos (`OWNER`) ∪ compartidos (`EDITOR`/`VIEWER`, 012). **Solo lecturas** |
| `ownedNodes(actor)`        | Igual, pero solo los propios vivos (`OWNER`): escrituras, destinos y la raíz de «Mis archivos» (012, DF-85)                                                                                                                        |
| `ownedTrashedNodes(actor)` | Igual que `accessibleNodes`, pero con las **raíces de la papelera** del actor (`eliminado_con_carpeta_id IS NULL`); vacío para roles internos (006, RN-7)                                                                          |
| `AccessLevel`, `Action`    | `OWNER > EDITOR > VIEWER` y las once acciones de la tabla de plan §6.5 (Owner todo; Editor y Viewer, lista cerrada)                                                                                                                |

Uso desde otro módulo (siempre dentro de `ITransactionRunner.withActor(actor, …)`; sin él, el lector lanza
`ActorScopeMissingError`):

```ts
await runner.withActor(actor, async () => {
  if (!(await permissions.can(actor, nodeId, Action.DOWNLOAD))) return null; // 404 o 403: lo decide la spec
  const f = accessibleNodes(actor);
  qb.andWhere(`archivo.id IN (SELECT nodo_id FROM (${f.sql}) accesibles)`, f.parameters);
});
```

## Qué agregan 005 y 012 (plan §6.11, D-1)

En 003 `accessibleNodes` devolvía el **conjunto vacío tipado** para todos los roles; la consulta de
`SqlAccessLevelReader` (precedencia `OWNER > EDITOR > VIEWER`, `LIMIT 1`) se ejecuta contra Postgres en
`test/int/access/sql-access-level-reader.int-spec.ts`.

- **005 (hecho, D-17)**: el caso `CLIENT` devuelve la propiedad: `archivo` con `propietario_id = :access_actor_id` y
  `eliminado_en IS NULL`, `tipo_nodo = 'archivo'`, `nivel = 'OWNER'` (sin carpetas: RN-4, 006). RLS `ENABLE` + `FORCE`
  en `archivo`, `version_archivo` y `carga` (migración de 005). Los roles internos siguen con el conjunto vacío: ven
  metadatos por `INodeMetadataReader` (011), nunca por aquí. Prueba: `test/int/access/accessible-nodes.int-spec.ts`.
- **006 (hecho)**: la rama de propiedad agrega `UNION ALL` de `carpeta` viva (`tipo_nodo = 'carpeta'`). Como eliminar
  una carpeta marca todo su subárbol, el filtro sigue siendo plano. Los consumidores que unen por `nodo_id` filtran
  también por `tipo_nodo`. `ownedTrashedNodes(actor)` da las raíces de la papelera del dueño. RLS en `carpeta`
  (migración `20261001100200`). Prueba: `test/int/access/accessible-nodes.int-spec.ts`.
- **012 (T-02)**: `accessibleNodes` suma `UNION ALL SELECT … FROM nodos_compartidos()` (directos y heredados por
  `carpeta.ruta`, vivos, de cuentas `activa`, nivel mayor por nodo); la función SQL `STABLE` sin parámetros
  (migración `20261101100000`) es la regla única que usan también las políticas `archivo_compartido`,
  `carpeta_compartida` y `version_archivo_compartida` (migración `20261101100100`). Nace `ownedNodes(actor)` (la
  propiedad viva) para que `storage` escriba solo lo propio. Sin `inheritedGrants` ni `IGrantRepository` (YAGNI).
  Prueba: `test/int/access/accessible-nodes-shared.int-spec.ts`.
- **012 (T-09)**: la misma función decide las políticas del Editor en `sesion_edicion`/`participacion` y la lectura de
  `indexacion`/`fragmento` vigentes de lo compartido para el agente (migración `20261101100200`). Pruebas:
  `test/int/editing/shared-editing.int-spec.ts` y `test/isolation/agent.iso-spec.ts` (ISO-16 a ISO-19).
- Un valor nuevo de `Action` (p. ej. historial o restaurar, 014) queda negado para Editor y Viewer hasta que su spec lo
  agregue a la política.
