# Plan 006 — Carpetas y papelera

> Spec: `./spec.md` · Estado del plan: **Aprobado** (Adrián, 2026-09-30; decisiones en §8)
> Dice qué archivos se tocan y qué se espera de cada uno. Reutiliza lo integrado por 005 y 006a; las desviaciones de
> los diagramas quedan en **DF-61**.

## 1. Resumen técnico
- **Carpetas**: tabla `carpeta` con el padre (`carpeta_padre_id`) y `ruta`, el camino materializado del E-R (`/id1/id2/`), más
  `profundidad`. La ruta permite detectar ciclos (el destino cae dentro del prefijo de origen ⇒ `422 STORAGE_INVALID_MOVE`), comprobar la profundidad del subárbol y
  mover todo en un `UPDATE` por prefijo. `archivo.carpeta_id` (NULL = raíz). Unicidad por tipo entre hermanos vivos con índices
  únicos parciales `NULLS NOT DISTINCT` (PG 17).
- **Papelera**: eliminar es un `UPDATE` que fija `eliminado_en` y `purgar_en = eliminado_en + trashRetentionDays` (del plan vigente,
  CA-19). Si es una carpeta, marca **todo el subárbol vivo** con la misma fecha y con `eliminado_con_carpeta_id = F`. Así:
  (a) `accessibleNodes` sigue siendo un filtro plano `eliminado_en IS NULL` sin recursión; (b) la papelera lista solo las raíces
  (`eliminado_con_carpeta_id IS NULL`): un elemento por carpeta (CA-11); (c) restaurar F devuelve solo lo que tiene
  `eliminado_con_carpeta_id = F`, y lo eliminado antes por separado se queda en la papelera (CA-13, RN-3).
- **Nombre repetido al restaurar o mover**: se reutiliza `FileName.firstFree` y `findTakenNames` de 005, ahora por carpeta. Para carpetas,
  `FolderName` comparte las reglas de validación extraídas de `FileName` (sin extensión en «(n)»).
- **Purga**: `TrashPurger` es el único que borra. Por archivo: primero `IObjectStorage.purgeObject` de cada versión (es idempotente) y
  después, en una transacción, borra `version_archivo` y `archivo` y hace `addUsedBytes(-bytes)`. Las carpetas se borran al final. Lo usan
  «Eliminar definitivamente» (síncrono, un elemento) y el trabajo `trash-purge` del worker, con el patrón DF-52/ADR-0021: función
  `SECURITY DEFINER` `papelera_vencida` y `withActor` por dueño. «Vaciar papelera» no purga en la petición: fija `purgar_en = now` en
  todas las raíces de la papelera del actor y encola un trabajo `trash-purge` inmediato; el espacio baja cuando el trabajo termina.
- **Serialización**: toda mutación del árbol (crear, renombrar, mover, eliminar, restaurar, purgar) y el registro de una carga
  abren `withActor` y toman primero `IQuotaRepository.lockUsage(actor)` (`FOR UPDATE` de la fila del dueño, el mismo punto de 005). Así no
  hay carreras de ciclo ni de nombre, y una carga no se registra en una carpeta que se está eliminando (CA-6).

> Nota 2026-10-01: la purga se implementó dentro de la transacción y no antes, como dice el párrafo «Purga». Ver DF-61 y las
> notas del developer de `tasks.md` (T-06).

## 2. Módulos, archivos y diseño
| Módulo / capa | Archivo (nuevo o cambiado) | Responsabilidad |
|---|---|---|
| storage/application | `plan-limits.ts` (cambia) | `PlanLimits` agrega `trashRetentionDays: number` (ver §7, decisión 1) |
| billing/infrastructure | `adapters/plan-limits.adapter.ts` (cambia) | `toLimits` mapea `dias_retencion_papelera`; las pruebas unitarias y de integración se ajustan |
| storage/domain | `node-name.ts` (nuevo), `file-name.vo.ts` (cambia) | Reglas de nombre compartidas (NFC, separadores, 255, clave sin mayúsculas). `FileName` las usa sin cambiar su comportamiento |
| storage/domain | `folder-name.vo.ts` (nuevo) | VO de nombre de carpeta; `firstFree` como «base (n)» sin extensión |
| storage/domain | `folder.ts` (nuevo), `file.ts` (cambia) | `Folder` (entidad inmutable: padre, `FolderPath`, `TrashState`); `File` agrega `folderId` y `TrashState`. `StorageNode = File \| Folder` (unión discriminada; DF-61) |
| storage/domain | `folder-path.ts` (nuevo) | VO puro: `childOf`, `contains` (ciclo), `depth`, `rebase(from, to)`, `ancestorIds()` (migas) |
| storage/domain | `trash-state.ts` (nuevo) | `deletedAt`, `purgeAt`, `trashedWithFolderId`; `TrashState.start(now, retentionDays)` calcula la fecha de purga |
| storage/domain | `errors/node.errors.ts` (nuevo), `errors/index.ts` | `InvalidMoveError` (422), `FolderDepthExceededError` (422, `details.maxDepth`), `InvalidNodeRequestError` (400, `fields`), `FolderNameConflictError` (409 sin `suggestedName`). Se reutilizan `NameConflictError` y `NodeNotFoundError` |
| storage/domain | `upload-session.ts` (cambia) | `folderId` (destino) |
| storage/application | `folder.service.ts` (nuevo) | `create`, `rename`, `move`, `contents` (lista la carpeta o la raíz con las migas). Reemplaza a `FileService.list` |
| storage/application | `file.service.ts` (cambia) | Quita `list`; agrega `rename(actor, id, name, onConflict)` y `move(actor, id, folderId, onConflict)` con la regla «(n)» de 005 |
| storage/application | `trash.service.ts` (nuevo) | `trashFile`, `trashFolder`, `list`, `summary`, `restoreFile`, `restoreFolder`, `purge`, `empty`, `purgeExpired` (lo usa el worker; vuelve a comprobar el vencimiento) |
| storage/application | `trash-purger.ts` (nuevo) | Borrado físico por elemento (objetos → filas → `espacio_usado`), idempotente; lo comparten `TrashService` y el worker (DRY) |
| storage/application | `folder-config.ts` (nuevo) | `FOLDER_CONFIG = { maxDepth }` desde `FOLDER_MAX_DEPTH` |
| storage/application | `upload.service.ts`, `upload-registrar.ts` (cambian) | `init` recibe `folderId`, valida el destino (404) y calcula el nombre en esa carpeta. `register`, dentro del `lockUsage`, comprueba que la carpeta siga viva: si no, CAS `activa → cancelada`, descarta el objeto y responde `404` (CA-6) |
| storage/application/ports | `i-node.repository.port.ts` (cambia) | Métodos por carpeta: `findAccessibleFolder`, `listContents`, `breadcrumbs`, `findTakenNames(actor, name, folderId)`, `findTakenFolderNames`, `insertFolder`, `renameFile/Folder`, `moveFile`, `moveFolderSubtree`, `maxSubtreeDepth` |
| storage/application/ports | `i-trash.repository.port.ts` (nuevo) | `markFileTrashed`, `markFolderSubtreeTrashed`, `listTrash`, `trashSummary`, `findTrashedItem`, `restoreFile`, `restoreFolderSubtree`, `purgeTargets` (archivos y claves de un elemento), `deleteFileRows`, `deleteFolderRows` |
| storage/application/ports | `i-expired-trash.scanner.port.ts` (nuevo) | Único acceso sin actor de la purga: `(tipo, id, propietarioId)` vencidos |
| storage/infrastructure/persistence | `carpeta.orm-entity.ts` (nuevo); `archivo.orm-entity.ts`, `carga.orm-entity.ts` (cambian); `typeorm-node.repository.ts` (cambia); `typeorm-trash.repository.ts`, `sql-expired-trash.scanner.ts` (nuevos); `file-list-cursor.ts` → `node-list-cursor.ts` | Mapeo y SQL. Toda lectura une `accessibleNodes` o `ownedTrashedNodes` en la misma consulta, con `requireActorScope(actor)` |
| storage/infrastructure | `trash-purge.scheduler.ts`, `trash-purge.processor.ts` (nuevos) | Cola `trash-purge` repetible (`upsertJobScheduler`, 3 intentos, `concurrency: 1`), con la misma estructura de dos fases que `UploadCleanupProcessor` |
| storage/presentation | `folders.controller.ts`, `trash.controller.ts` (nuevos); `files.controller.ts` (cambia); `storage-validation.ts` (cambia) | Rutas de §4, `@Roles(Role.CLIENT)` y pipes zod. `FoldersController` cierra DF-15 en carpetas |
| storage | `storage.module.ts`, `storage-worker.module.ts`, `upload-lifecycle.providers.ts`, `index.ts` | Proveedores y configuración nuevos; el `api` registra la cola `trash-purge` solo para encolar «Vaciar» (`TrashPurgeQueue`) |
| access/infrastructure/sql | `accessible-nodes.ts` (cambia) | `UNION ALL` de `carpeta` viva en la rama de propiedad; nuevo `ownedTrashedNodes(actor)` (solo raíces de la papelera del dueño; vacío para roles internos) |
| audit/application | `audit-action.ts` (cambia) | `NODE_TRASHED`, `NODE_RESTORED`, `NODE_PURGED`, `TRASH_EMPTIED` |
| shared/config | esquemas de entorno, `.env.example` | `FOLDER_MAX_DEPTH` (api), `TRASH_PURGE_INTERVAL_MINUTES` y `TRASH_PURGE_BATCH_SIZE` (worker) |
| packages/contracts/storage | `error-codes.ts`, `schemas.ts` (cambian); `folder-schemas.ts`, `trash-schemas.ts` (nuevos) | Códigos y esquemas de §4; mensajes de campo sin «subir» para carpetas y renombrar |

- **Puertos nuevos**: `ITrashRepository` e `IExpiredTrashScanner`, ambos **dentro de `storage`**. Cumplen la regla b del Art. V: frontera de
  persistencia y, el segundo, el único acceso sin actor, que solo inyecta el procesador (mismo criterio que `IExpiredUploadScanner`). No se meten
  en `INodeRepository` por ISP: el árbol vivo y la papelera tienen consumidores distintos. **Sin puertos entre módulos.**
- **Dependencias entre módulos**: ninguna nueva. `storage → access` (función `ownedTrashedNodes`) y `billing → storage` (campo nuevo en
  `PlanLimits`) ya existen. Única dependencia externa nueva: `sonner` 2.0.8 (vía `npx shadcn add sonner`, genera
  `apps/web/src/components/ui/sonner.tsx`), decidida en `docs/adr/0024-avisos-no-bloqueantes-con-sonner.md` (Aceptado).
- **Frontend** (`apps/web`): rutas `app/(app)/(cliente)/archivos/page.tsx` (raíz), `archivos/carpeta/[folderId]/page.tsx` y
  `papelera/page.tsx`. `features/storage/`: `api.ts` (rutas nuevas), `components/folder-breadcrumbs`, `new-folder-dialog`,
  `rename-dialog`, `move-dialog` (selector de destino; incluye «Nueva carpeta» con el `POST /folders` existente, sin API nueva), `trash-list`, `trash-summary`, `purge-confirm-dialog` (sobre `alert-dialog`) y
  `restore-result` (avisos CA-14/15/17). `file-explorer` y `file-row-menu` se amplían; se reutiliza `name-conflict-dialog` (005) para
  archivos. `components/nimbo/app-layout.tsx`: «Carpetas» y Papelera con contador (`GET /trash/summary`). Catálogo `lib/error-catalog.ts`.
  Estados y textos según los mockups de `storage/explorador/` y `storage/papelera/`.

> Nota 2026-10-01: la implementación agregó `ITrashRepository.schedulePurgeOfAll`, `TRASH_LIFECYCLE_PROVIDERS` y la cola
> `trash-purge` en `worker.module.ts`. Ver DF-61 y las notas del developer de `tasks.md` (T-06).

## 3. Datos
```sql
-- 20261001100000-crear-carpeta.ts
CREATE TABLE carpeta (
  id uuid PRIMARY KEY,
  propietario_id uuid NOT NULL REFERENCES usuario(id),
  carpeta_padre_id uuid REFERENCES carpeta(id) ON DELETE SET NULL,       -- NULL = raíz
  nombre varchar(255) NOT NULL,
  ruta text NOT NULL,                                                       -- '/<id ancestro>/…/<id>/' (solo UUID)
  profundidad smallint NOT NULL CHECK (profundidad >= 1),
  creado_en timestamptz NOT NULL, actualizado_en timestamptz NOT NULL,
  eliminado_en timestamptz, purgar_en timestamptz,
  eliminado_con_carpeta_id uuid REFERENCES carpeta(id),                     -- raíz del borrado que la arrastró
  CONSTRAINT ck_carpeta_padre CHECK (carpeta_padre_id IS NULL OR carpeta_padre_id <> id),
  CONSTRAINT ck_carpeta_papelera CHECK ((eliminado_en IS NULL) = (purgar_en IS NULL)
                                        AND (eliminado_con_carpeta_id IS NULL OR eliminado_en IS NOT NULL))
);
CREATE UNIQUE INDEX uq_carpeta_hermanos_nombre ON carpeta (propietario_id, carpeta_padre_id, lower(nombre))
  NULLS NOT DISTINCT WHERE eliminado_en IS NULL;
CREATE INDEX idx_carpeta_ruta ON carpeta (propietario_id, ruta text_pattern_ops);
CREATE INDEX idx_carpeta_hijas ON carpeta (propietario_id, carpeta_padre_id, creado_en DESC, id DESC) WHERE eliminado_en IS NULL;
CREATE INDEX idx_carpeta_papelera ON carpeta (propietario_id, eliminado_en DESC, id DESC)
  WHERE eliminado_en IS NOT NULL AND eliminado_con_carpeta_id IS NULL;
CREATE INDEX idx_carpeta_purga ON carpeta (purgar_en) WHERE eliminado_en IS NOT NULL AND eliminado_con_carpeta_id IS NULL;
-- down: DROP TABLE carpeta;

-- 20261001100100-carpeta-y-papelera-en-archivo-y-carga.ts
ALTER TABLE archivo ADD COLUMN carpeta_id uuid REFERENCES carpeta(id) ON DELETE SET NULL,
                    ADD COLUMN purgar_en timestamptz,
                    ADD COLUMN eliminado_con_carpeta_id uuid REFERENCES carpeta(id),
                    ADD CONSTRAINT ck_archivo_papelera CHECK (…igual que carpeta…);
DROP INDEX uq_archivo_propietario_nombre;  DROP INDEX idx_archivo_propietario_creado;
CREATE UNIQUE INDEX uq_archivo_hermanos_nombre ON archivo (propietario_id, carpeta_id, lower(nombre))
  NULLS NOT DISTINCT WHERE eliminado_en IS NULL;
CREATE INDEX idx_archivo_carpeta_creado ON archivo (propietario_id, carpeta_id, creado_en DESC, id DESC) WHERE eliminado_en IS NULL;
CREATE INDEX idx_archivo_papelera ON archivo (propietario_id, eliminado_en DESC, id DESC)
  WHERE eliminado_en IS NOT NULL AND eliminado_con_carpeta_id IS NULL;
CREATE INDEX idx_archivo_arrastrado ON archivo (eliminado_con_carpeta_id) WHERE eliminado_con_carpeta_id IS NOT NULL;
CREATE INDEX idx_archivo_purga ON archivo (purgar_en) WHERE eliminado_en IS NOT NULL AND eliminado_con_carpeta_id IS NULL;
ALTER TABLE carga ADD COLUMN carpeta_destino_id uuid;   -- sin FK, como archivo_id/version_id reservados; se valida al completar
-- down: quita columnas e índices nuevos y recrea los dos índices de 005 (falla si hay nombres repetidos en carpetas
--       distintas: el down se prueba sobre BD vacía, como en 005).

-- 20261001100200-rls-carpeta-y-purga-de-papelera.ts   (ADR-0005, patrón ADR-0021)
ALTER TABLE carpeta ENABLE ROW LEVEL SECURITY; ALTER TABLE carpeta FORCE ROW LEVEL SECURITY;
CREATE POLICY carpeta_cliente ON carpeta TO nimbo_app USING (rol CLIENT y propietario) WITH CHECK (igual);  -- como archivo_cliente
CREATE POLICY carpeta_metadatos_internos ON carpeta FOR SELECT TO nimbo_app USING (nimbo_actor_role() IN ('ADMIN','SUPPORT'));
CREATE POLICY archivo_mantenimiento ON archivo FOR SELECT TO CURRENT_USER USING (eliminado_en IS NOT NULL);
CREATE POLICY carpeta_mantenimiento ON carpeta FOR SELECT TO CURRENT_USER USING (eliminado_en IS NOT NULL);
CREATE FUNCTION papelera_vencida(p_ahora timestamptz, p_limite integer)
  RETURNS TABLE (tipo_nodo text, id uuid, propietario_id uuid) LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp AS
  $$ (raíces de la papelera de archivo y carpeta con purgar_en <= LEAST(p_ahora, now()))
     ORDER BY purgar_en LIMIT LEAST(GREATEST(p_limite,0),1000) $$;
REVOKE ALL ON FUNCTION papelera_vencida(timestamptz, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION papelera_vencida(timestamptz, integer) TO nimbo_app;
-- down: DROP FUNCTION; DROP POLICY (las cuatro); NO FORCE / DISABLE RLS en carpeta.
```
- Bytes en `bigint`; los tamaños de carpeta se calculan (RN-6) como la suma de `version_archivo.tamano_bytes` de lo arrastrado. Ese mismo número se
  muestra y se libera: «Liberarás {tamaño}» es exacto (hoy coincide con `archivo.tamano_bytes`; con 014 incluye versiones).
- `carpeta_padre_id` y `archivo.carpeta_id` usan `ON DELETE SET NULL` solo para un caso: un elemento que se eliminó aparte y cuya carpeta
  original se purgó antes (eso solo pasa si cambió la retención). Ese elemento se restaura en la raíz (CA-15). Ninguna fila viva queda bajo una carpeta purgada,
  porque la purga se lleva su subárbol.
- Permisos: los dan los `ALTER DEFAULT PRIVILEGES` de 003, igual que en 005. Fixtures de aislamiento: `.withFolders()` y `.withTrash()` insertan como `nimbo_app` en `withActor`.

## 4. Contratos
Prefijo `/api/v1`. Todas las rutas usan `@Roles(Role.CLIENT)`: un rol interno recibe `403 SHARED_FORBIDDEN` y una petición sin token, `401 SHARED_UNAUTHENTICATED` (CA-23). Un `:id` que no es UUID
responde `404` del recurso. Los tamaños van como `number` seguro. Errores con `{ code, message, correlationId, fields?, details? }`.

| Método | Ruta | Request → Respuesta | Errores (`code`) |
|---|---|---|---|
| GET | `/folders/contents?folderId&cursor&limit` | Sin `folderId` = raíz → `200 { folder: FolderRef\|null, breadcrumbs: FolderRef[], items: NodeSummary[], nextCursor }`, carpetas primero y luego `creado_en DESC, id DESC`. **Reemplaza `GET /files`** | `404 STORAGE_NODE_NOT_FOUND` · `400 STORAGE_INVALID_QUERY` |
| POST | `/folders` | `{ name, parentId: uuid\|null }` → `201 FolderSummary` | `400 STORAGE_INVALID_NODE_REQUEST` (`fields`) · `404` · `409 STORAGE_NAME_CONFLICT` · `422 STORAGE_FOLDER_DEPTH_EXCEEDED` (`details.maxDepth`) |
| PATCH | `/folders/:folderId` | `{ name }` → `200 FolderSummary` | `400` · `404` · `409 STORAGE_NAME_CONFLICT` |
| POST | `/folders/:folderId/move` | `{ parentId: uuid\|null }` → `200 FolderSummary` | `404` (origen o destino) · `409` · `422 STORAGE_INVALID_MOVE` · `422 STORAGE_FOLDER_DEPTH_EXCEEDED` |
| DELETE | `/folders/:folderId` | → `200 TrashItem` | `404` |
| PATCH | `/files/:fileId` | `{ name, onConflict?: 'ask'\|'keep_both' }` → `200 FileSummary` | `400` · `404` · `409 STORAGE_NAME_CONFLICT` (`details.suggestedName`) |
| POST | `/files/:fileId/move` | `{ folderId: uuid\|null, onConflict? }` → `200 FileSummary` | `404` · `409` (`suggestedName`) |
| DELETE | `/files/:fileId` | → `200 TrashItem` (la UI muestra «Movimos…» y «Ver papelera») | `404` |
| POST | `/uploads` (cambia) | Agrega `folderId?: uuid\|null` | Agrega `404 STORAGE_NODE_NOT_FOUND` (destino); al completar, `404` si el destino se eliminó |
| GET | `/trash?cursor&limit` | → `200 { items: TrashItem[], nextCursor }`, `eliminado_en DESC, id DESC` | `400 STORAGE_INVALID_QUERY` |
| GET | `/trash/summary` | → `200 { itemCount, totalBytes, retentionDays }` | — |
| POST | `/trash/files/:id/restore` · `/trash/folders/:id/restore` | → `200 { item: NodeSummary, outcome: 'restored'\|'renamed'\|'moved_to_root', originalName }` | `404` (inexistente, ajeno o purgado) · `422 STORAGE_FOLDER_DEPTH_EXCEEDED` (la carpeta original quedó tan abajo que restaurar supera el máximo; el mensaje sugiere mover antes la carpeta original) |
| DELETE | `/trash/files/:id` · `/trash/folders/:id` | → `200 { freedBytes }` (síncrono) | `404` |
| DELETE | `/trash` | → `202 { scheduledItems, pendingBytes }`: fija `purgar_en = now` y encola `trash-purge`; la UI muestra «Vaciando…» y vuelve a leer `/trash/summary` | — |

`FolderRef = { id, name }` · `NodeSummary = ({ type:'folder' } & FolderSummary) | ({ type:'file' } & FileSummary)` · `FileSummary` (005) +
`folderId` · `TrashItem = { id, type, name, kind?, sizeBytes, originalFolder: FolderRef|null, deletedAt, purgeAt }`. Los días restantes los calcula
`web` a partir de `purgeAt`. La selección múltiple (CA-17) hace una llamada por elemento y muestra el resultado de cada una, sin ruta de lote (YAGNI).
Mensajes de §3 de la spec en `contracts` y en `lib/error-catalog.ts`.

**Eventos**: cola BullMQ `trash-purge` (repetible cada `TRASH_PURGE_INTERVAL_MINUTES`; payload `{ correlationId }`; 3 intentos con espera
exponencial). «Vaciar» agrega un trabajo puntual con el mismo procesador (`TrashPurgeQueue.enqueueNow`, que el `api` registra en la
cola). Es idempotente: si ya lo tomó el ciclo programado, la segunda pasada no encuentra nada. No se emite `FileTrashed` porque no tiene consumidor hasta 019 (YAGNI).

## 5. Seguridad y operación
- Cada servicio recibe `actor` y abre `withActor`. Las lecturas del árbol usan `accessibleNodes(actor)` (ahora con `carpeta`) y las de la papelera
  `ownedTrashedNodes(actor)`, ambas **dentro** de la consulta, con la RLS de `carpeta` como segunda barrera. Mover a una carpeta ajena se resuelve como destino
  no accesible ⇒ `404` idéntico (CA-22). Solo el propietario restaura y purga (RN-7): `ownedTrashedNodes` no incluye comparticiones.
- Purga sin actor: `papelera_vencida` devuelve solo `(tipo, id, dueño)` de raíces **vencidas**, sin nombre ni clave, con un tope de 1000 filas. Después,
  `withActor(createActor(dueño, CLIENT))` llama a `TrashService.purgeExpired`, que vuelve a comprobar `purgar_en <= now`. No mira el estado de la
  cuenta (CA-19: también se purga si la cuenta está vencida).
- CA-20: si `purgeObject` falla en un archivo, no se toca su fila ni `espacio_usado`; se registra
  `{ event:'trash.purge_failed', nodeId, errorName }` y el trabajo falla al final para que BullMQ lo reintente. Una carpeta solo se borra cuando ya no
  le quedan archivos.
- Auditoría por `IAuditLogger` después del commit y con mejor esfuerzo: `node.trashed`, `node.restored`, `node.purged` (`trigger: manual|scheduled`)
  y `trash.emptied`, con `resourceId` (UUID), `attributes { nodeType, itemCount, sizeBytes }` y `correlationId`. **Sin nombres** (CA-24). Las bitácoras Pino
  solo llevan UUID y conteos. `name` y `nombre` ya están en `REDACTED_FIELDS`.

## 6. Estrategia de pruebas (por riesgo)
| CA | Nivel | Archivo |
|---|---|---|
| CA-8, CA-9 (ciclo, profundidad, `rebase`) | unit | `domain/folder-path.spec.ts` |
| CA-3, CA-14 («(n)» de carpetas; `FileName` sin regresión) | unit | `domain/folder-name.vo.spec.ts`, `file-name.vo.spec.ts` |
| CA-19 (fecha de purga fija) | unit | `domain/trash-state.spec.ts` |
| CA-13 a CA-15 (decisión de restaurar), CA-20 (objeto falla ⇒ sin cambios; idempotencia) | unit | `application/trash.service.spec.ts`, `trash-purger.spec.ts` |
| CA-20 (lote con error ⇒ reintento) | unit | `infrastructure/trash-purge.processor.spec.ts` |
| CA-1 a CA-5, CA-7 a CA-9 | int | `test/int/storage/folders.int-spec.ts` (por ruta: el caso feliz y el error principal) |
| CA-4, CA-7 (archivos: renombrar o mover con `suggestedName`) | int | `test/int/storage/files-organize.int-spec.ts` |
| CA-6 (subir a una carpeta; destino eliminado durante la carga ⇒ 404 y reserva liberada) | int | `test/int/storage/uploads-folder.int-spec.ts` |
| CA-10 a CA-18, CA-21 (ciclo y `espacio_usado`) | int | `test/int/storage/trash.int-spec.ts` |
| CA-19, CA-20 (purga programada contra MinIO real, con un fallo simulado) | int | `test/int/storage/trash-purge.int-spec.ts` |
| Migraciones up/down ×3 | int | `test/int/storage/folders-migrations.int-spec.ts` |
| CA-22, CA-23 | iso | `test/isolation/storage-folders.iso-spec.ts` (todas las rutas de §4, A contra B: `404` idéntico salvo `correlationId`; mover algo propio a una carpeta de A; roles internos `403`; RLS niega `carpeta` sin filtro) |
| CA-22 (purga sin actor) | iso | `storage-maintenance.iso-spec.ts` (se amplía): `papelera_vencida` no devuelve filas vivas ni no vencidas, ni más de 1000; `nimbo_app` sin actor ve 0 filas de `carpeta` |
| CA-24 | int | Se verifica dentro de `trash.int-spec.ts` con un `IAuditLogger` espía (acción, conteos, sin `name`) |
| CA-25 y estados de §6 | web | `trash-list.spec.tsx`, `move-dialog.spec.tsx`, `file-explorer.spec.tsx` (carpetas, migas, vacía, errores), `a11y.spec.tsx` a 360 y 1440 px |

## 7. Riesgos y coherencia con el diseño
- **Decisión 1, retención en `PlanLimits`**: se amplía el tipo con `trashRetentionDays` en lugar de crear un puerto nuevo. La retención es un límite de
  almacenamiento que consume `storage` mismo, así que no rompe ISP ni DF-51 (otros módulos siguen sin ensancharlo). Toca el adaptador de `billing` (006a).
- **Decisión 2, profundidad en configuración**: `FOLDER_MAX_DEPTH` (api, por defecto `10`, zod 1–50), no una columna de `plan`. La spec la
  define como configuración, no como regla del plan. Va en `pnpm env:check`.
- R-1 **Vaciar una papelera grande**: se resuelve en el worker (decisión 3), no en la petición. Riesgo restante: si el worker está caído, el espacio
  tarda en bajar. La UI lo dice: los elementos con `purgeAt <= now` siguen en la papelera con la marca «Vaciando…» y sin acciones hasta que el trabajo
  los borra.
- R-5 **Elementos eliminados aparte dentro de una carpeta purgada antes** (solo pasa si bajó la retención): por `SET NULL` se restauran en la
  raíz, posiblemente sin el aviso de CA-15. Riesgo conocido y aceptado por Adrián (2026-09-30).
- R-2 **`UNION ALL` en el listado y en `accessibleNodes`** (ADR-0011): `EXPLAIN` de `contents`, `listTrash` y del fragmento con los índices de §3.
- R-3 **Datos con purga parcial**: entre `purgeObject` y el commit, un archivo **en la papelera** puede tener versiones sin objeto. Nunca es visible
  (no se descarga desde la papelera) y el siguiente ciclo lo termina.
- R-4 **Reemplazar `GET /files`**: rompe el contrato de 005. Solo lo consume `web` y se cambia en el mismo PR. Se actualizan los contratos y las pruebas de 005.
- **Desviaciones**: **DF-61** nuevo (registrado en `design-findings.md`). Lo que se agrega:
  - columnas `profundidad`, `purgar_en` y `eliminado_con_carpeta_id`;
  - `TrashService`, `TrashPurger`, `FolderService`, `ITrashRepository` e `IExpiredTrashScanner`;
  - `StorageNode` como unión y no como clase abstracta;
  - `trash` sale de `FileService`;
  - cola `trash-purge` por `upsertJobScheduler` en lugar de `@Cron` (arquitectura §8).

  Avanzan DF-15 (`FoldersController`) y DF-33 (`carpeta_id`, `carpeta_destino_id`). Se sigue ADR-0011 (DF-40) y se reutiliza DF-52 / ADR-0021.
- Pendientes: se suma a PD-46 el redibujo de M2 y del E-R (`carpeta`, columnas nuevas) y la fila de `trash-purge` en arquitectura §8.
- ADR requeridos: ADR-0024 (`sonner` para avisos, Aceptado). `NULLS NOT DISTINCT` es nativo de PG 15+ y el proyecto usa PG 17. No se agrega ningún puerto entre módulos.
- Entrega: rama de código `feat/006-carpetas-y-papelera` (`conventions.md`; `spec/006-…` es solo para los documentos), con dos PR como
  máximo (`workflow.md` §6): **PR-A** `api` + `contracts` + migraciones + worker; **PR-B** `web`.
- **Coordinación con 007 (CA-26 a CA-28, por planificar)**: 007 CA-19 reorganiza la barra lateral (plan 007 D-23): `AppLayout`
  ya no recibe `folderItems` sino el slot `sidebarSections`, y «Carpetas» vive en `features/storage/components/sidebar-folders.tsx`.
  CA-27 («Accesos rápidos») se implementa en `features/storage` y entra por ese slot, **sin editar `components/nimbo/app-layout.tsx`**;
  el cajón móvil ya se cierra al activar cualquier enlace. Los estados de mockup de CA-27/28 solo cambian la región central del
  generador de `shared/layout/`. Orden: 006 (sin CA-26 a CA-28) a `main` → 007 a `main` → CA-26 a CA-28 en una rama desde `main`.

## 8. Aprobación
- `architect`: no aplica (sin puerto entre módulos, sin tecnología nueva y sin cambio de arquitectura). Se le pide revisar DF-61 al redibujar (PD-46).
- Adrián: **Aprobado — Adrián, 2026-09-30**, con estas decisiones aplicadas:
  1. Restaurar por encima de la profundidad máxima responde `422 STORAGE_FOLDER_DEPTH_EXCEEDED` y sugiere mover la carpeta original (spec CA-15).
  2. `GET /files` se reemplaza por `GET /folders/contents` y la web de 005 se actualiza en el mismo cambio.
  3. «Eliminar definitivamente» es síncrono; «Vaciar papelera» fija `purgar_en = now` y encola `trash-purge`.
  4. Rama `feat/006-carpetas-y-papelera`, con un PR de `api` y otro de `web`.
  5. Lo eliminado aparte bajo una carpeta purgada se restaura en la raíz, posiblemente sin aviso (R-5).

## 9. Adición 2026-10-03 — CA-26 a CA-28
> Estado: **Aprobado — Adrián, 2026-10-03** (architect: aprobado con cambios aplicados, 2026-10-03; decisiones de Adrián en §9.4). No modifica §1 a §8 (aprobados). Cubre RF-38. Con esta adición el plan supera
> las 250 líneas de la plantilla; es una excepción por revisión posterior a la aprobación.

### 9.1 CA-26 — desglosar carpetas en la lista (solo web, sin API nueva)
- Reutiliza `GET /folders/contents?folderId&cursor&limit` (§4) y sus `NodeSummary`. Sin ruta, tabla, puerto ni contrato nuevos. **Un developer ya lo
  implementa (T-12)**; esto es solo trazabilidad.
- Componentes (`apps/web/src/features/storage/`): `components/file-explorer.tsx` (fila de carpeta con control de expandir y filas hijas con sangría
  por nivel) y un componente de filas anidadas que carga con `folders-api.ts`. Las acciones de fila (Renombrar, Mover, Mover a la papelera)
  son las mismas de `file-row-menu` en cualquier nivel; tras una acción se vuelve a leer el padre afectado.
- Estado **por fila**: cargando, vacía («Esta carpeta está vacía») y error con «Reintentar», sin tocar el resto de la lista. Expandir no abre la
  carpeta ni cuenta como reciente (CA-27): solo abrirla la registra.
- **Q-2 (aprobada)**: se pide solo la primera página de la carpeta desglosada; si `nextCursor` no es nulo, al final de su nivel va una fila «Ver más» que es un
  enlace a `archivos/carpeta/[folderId]`, sin «Cargar más» en la fila. **Guías verticales** con el token de color nuevo que define `ui-guidelines.md` y `globals.css`
  (sin colores escritos a mano).
- Accesibilidad: botón con `aria-expanded` y `aria-controls` hacia el contenedor de hijas, operable con teclado (Enter/Espacio), nivel anunciado a
  lectores de pantalla y foco que no salta al expandir. El patrón exacto (filas anidadas o `treegrid`) lo fija el developer según el mockup.
- Los estados siguen CA-25 (360 y 1440 px, axe). Sangría a 360 px (Q-1, aprobada): 16 px por nivel y se repite pasados 10 niveles.

### 9.2 CA-27 y CA-28 — accesos rápidos (RF-38)
**Decisión**: concepto nuevo en M2 (`storage`), por cuenta, en el servidor. Cabe en `storage` (usa `accessibleNodes` y los mismos nodos); no hay
puerto entre módulos. **Reutiliza** `accessibleNodes(actor)`, `IQuotaRepository.lockUsage` (punto de serialización por dueño, §1), `NodeNotFoundError`, `FOLDER_CONFIG`-style
de configuración, `sonner` (ADR-0024) y la sección de la barra lateral de `app-layout.tsx`.

| Capa | Archivo (nuevo o cambiado) | Responsabilidad |
|---|---|---|
| storage/domain | `quick-access.ts` (nuevo) | Tipos `QuickAccessItem` (modelo de lectura: `type`, `id`, `name`, `kind?` para el ícono) y `QuickAccessList { pinned, recent, hasMoreRecent }` |
| storage/domain | `errors/quick-access.errors.ts` (nuevo) | `QuickAccessLimitError` (422, `details.maxPinned`) |
| storage/application | `quick-access.service.ts` (nuevo) | `QuickAccessService`: `list`, `pin`, `unpin`, `recordOpen`; `actor` primero; solo `pin` toma `lockUsage` y comprueba el tope |
| storage/application | `quick-access-config.ts` (nuevo) | `QUICK_ACCESS_CONFIG = { maxPinned, recentVisible }` (entorno) y la constante con nombre `RECENTS_STORED = 25` (colchón de poda; no es configuración) |
| storage/application/ports | `i-quick-access.repository.port.ts` (nuevo) | `IQuickAccessRepository`: `list`, `countPinned`, `findAccessibleNode` (tipo, id), `upsertPin`, `removePin`, `touchRecent`, `pruneRecents` |
| storage/infrastructure/persistence | `acceso-rapido.orm-entity.ts`, `typeorm-quick-access.repository.ts` (nuevos) | Mapeo y SQL; **toda lectura y escritura une `accessibleNodes(actor)` en la consulta** (por `tipo_nodo` y la FK que corresponda) |
| storage/presentation | `quick-access.controller.ts` (nuevo), `storage-validation.ts` (cambia) | Rutas de abajo, `@Roles(Role.CLIENT)`, pipes zod; `nodeIdPipe` existente y un pipe de `:nodeType` (`files`\|`folders`) compartido por las tres rutas con nodo |
| storage | `storage.module.ts`, `index.ts` | Proveedores y exportaciones |
| shared/config | esquemas de entorno, `.env.example` | `QUICK_ACCESS_MAX_PINNED` (api, 5, zod 1–20) y `QUICK_ACCESS_RECENT_VISIBLE` (**3**, 1–20; P-15); van a `pnpm env:check` |
| packages/contracts/storage | `quick-access-schemas.ts` (nuevo), `error-codes.ts` (cambia) | Esquemas de §9.2 y código `STORAGE_QUICK_ACCESS_LIMIT` |

- **Puerto nuevo**: `IQuickAccessRepository`, **dentro de `storage`**, regla b del Art. V (repositorio: dominio sin TypeORM). `QuickAccessService`
  es un servicio de aplicación, no una abstracción: sin interfaz. No se amplía `INodeRepository` (ISP: otro consumidor y otra tabla) ni se crea política: el tope es una
  comparación contra configuración. Sin puertos entre módulos ni dependencias externas nuevas.
- **Datos** (migración `20261003100000-crear-acceso-rapido.ts`, con `down`; RLS en la misma migración o en una segunda `…100100…`, como 005/006):
```sql
CREATE TABLE acceso_rapido (
  id uuid PRIMARY KEY,
  usuario_id uuid NOT NULL REFERENCES usuario(id),                          -- la cuenta dueña del acceso (no del nodo)
  archivo_id uuid REFERENCES archivo(id) ON DELETE CASCADE,                 -- dos FK con CHECK de exclusividad (ADR-0011)
  carpeta_id uuid REFERENCES carpeta(id) ON DELETE CASCADE,
  fijado_en timestamptz, abierto_en timestamptz,                            -- fijado ⇔ fijado_en IS NOT NULL
  creado_en timestamptz NOT NULL, actualizado_en timestamptz NOT NULL,
  CONSTRAINT ck_acceso_un_nodo CHECK ((archivo_id IS NULL) <> (carpeta_id IS NULL)),
  CONSTRAINT ck_acceso_util CHECK (fijado_en IS NOT NULL OR abierto_en IS NOT NULL),   -- sin marca no hay fila
  CONSTRAINT uq_acceso_archivo UNIQUE (archivo_id, usuario_id),             -- también sirven al CASCADE (empiezan por la FK)
  CONSTRAINT uq_acceso_carpeta UNIQUE (carpeta_id, usuario_id)              -- NULLS DISTINCT: no chocan entre tipos
);
CREATE INDEX idx_acceso_fijados ON acceso_rapido (usuario_id, fijado_en DESC, id DESC) WHERE fijado_en IS NOT NULL;
CREATE INDEX idx_acceso_recientes ON acceso_rapido (usuario_id, abierto_en DESC, id DESC) WHERE fijado_en IS NULL;
ALTER TABLE acceso_rapido ENABLE ROW LEVEL SECURITY; ALTER TABLE acceso_rapido FORCE ROW LEVEL SECURITY;
CREATE POLICY acceso_rapido_cliente ON acceso_rapido TO nimbo_app USING (rol CLIENT y usuario_id = actor) WITH CHECK (igual);  -- como archivo_cliente
-- down: DROP POLICY; DROP TABLE acceso_rapido;   (sin política de metadatos internos ni de mantenimiento: no hacen falta)
```
- **Integridad (dictamen de architect)**: dos FK con `CHECK` de exactamente una, como manda ADR-0011 para todo lo que referencia nodos (`comparticion`,
  `enlace_publico`), y no un `nodo_id` polimórfico. `ON DELETE CASCADE` borra las filas cuando `TrashPurger` borra el `archivo` o la `carpeta`:
  **no se toca `typeorm-trash.repository.ts`** (la papelera no conoce los accesos rápidos) y no puede quedar ninguna fila huérfana. Eliminar a la
  papelera es un `UPDATE`, así que las marcas siguen al restaurar. `usuario_id` (y no `propietario_id`) porque con 012 un cliente podrá tener
  acceso a un nodo ajeno compartido: la fila es de quien fija, no del dueño del nodo. Las ayudas de prueba que borran cuentas (`removeAccounts`)
  borran antes `acceso_rapido`.
- **Semántica**: el listado une `accessibleNodes(actor)`, que excluye la papelera: un nodo eliminado no aparece y **al restaurarlo las marcas siguen** (las filas
  no se tocan al eliminar). Al **purgar** el nodo, el `CASCADE` borra sus filas (hijos de una carpeta incluidos). Quitar un fijado que además fue abierto lo deja como reciente; si
  nunca se abrió, se borra la fila. Los recientes **excluyen los fijados**; `recordOpen` sobre un fijado solo actualiza `abierto_en`. Tras cada `recordOpen`,
  `pruneRecents` conserva los últimos `RECENTS_STORED` no fijados (colchón para los nodos en la papelera); el listado pide `recentVisible + 1` para saber si hay «Ver más».
- **Tope (dictamen de architect)**: solo `pin` toma `lockUsage(actor)` (el punto de serialización por dueño de §1; un candado propio o un disparador
  serían un segundo mecanismo para lo mismo) y, en esa transacción, comprueba el nodo, cuenta y escribe. `countPinned` cuenta **solo los fijados
  visibles** (misma unión con `accessibleNodes` que el listado): un fijado en la papelera no ocupa lugar. `PUT` sobre un nodo ya fijado responde `200`
  sin comprobar el tope ni cambiar `fijado_en` (idempotente, conserva el orden). Si al restaurar un nodo o al bajar `QUICK_ACCESS_MAX_PINNED` quedan
  más fijados visibles que el tope, el listado devuelve los `maxPinned` más recientes por `fijado_en` y el resto vuelve a verse al quitar uno (R-10).
  `unpin`, `recordOpen` y `list` no toman el candado (`touchRecent` es un `INSERT … ON CONFLICT ON CONSTRAINT uq_acceso_*`).
- **Estado «fijado» en el menú de fila**: `web` lo deriva de `pinned` de `GET /quick-access` (ya cargado por la barra lateral; ≤ `maxPinned` elementos).
  No se agrega `pinned` a `NodeSummary` ni se toca `FolderService`.
- **Contratos** (`/api/v1`, `@Roles(Role.CLIENT)`: roles internos `403 SHARED_FORBIDDEN`, sin token `401`; `:nodeType` ∈ `files|folders`, como `/trash/{files|folders}/:id`; otro valor o id no UUID ⇒ `404`):

| Método | Ruta | Request → Respuesta | Errores (`code`) |
|---|---|---|---|
| GET | `/quick-access` | → `200 { pinned: QuickAccessItem[], recent: QuickAccessItem[], hasMoreRecent }` (fijados por `fijado_en DESC`; recientes por `abierto_en DESC`) | — |
| PUT | `/quick-access/pins/:nodeType/:nodeId` | Idempotente; → `200 QuickAccessItem` | `404 STORAGE_NODE_NOT_FOUND` (ajeno, inexistente, en la papelera) · `422 STORAGE_QUICK_ACCESS_LIMIT` (`details.maxPinned`; nunca si ya estaba fijado) |
| DELETE | `/quick-access/pins/:nodeType/:nodeId` | → `204`; idempotente si no estaba fijado | `404` (mismo criterio) |
| POST | `/quick-access/recents/:nodeType/:nodeId` | Sin cuerpo → `204` | `404` (mismo criterio) |

  Mensaje del tope en `contracts` y `lib/error-catalog.ts`: «Ya fijaste {maxPinned} elementos. Quita uno para fijar otro.» El nodo ajeno responde el mismo `404` que
  el resto de §4 (CA-22, CA-28). Se usa `422` (regla de negocio del plan, como la profundidad) y no `409`.
- **Recientes: ruta explícita, no efecto de `GET /folders/contents` ni de `POST /files/:id/download-url`.** Razones: (1) `GET contents` es de lectura y lo usan el desglose
  (CA-26), el selector de «Mover a…» y las migas: registrar ahí contaría como «abrir» cosas que no se abrieron; (2) un efecto escondido acoplaría `FolderService` y `FileService`
  al nuevo servicio (SRP, y cada prueba existente cambiaría); (3) «abrir» es una decisión de UI (navegar a la carpeta, pedir la descarga), no de la API. Costo: una petición extra,
  de mejor esfuerzo (un fallo no se muestra al cliente) y que `web` debe llamarla; la prueba de componente lo asegura.
- **Auditoría y privacidad**: no se audita (no está en CA-24 ni es dato sensible); ningún evento, log ni métrica lleva nombres; los registros de error llevan solo UUID y `errorName`.
- **Web**: `quick-access-api.ts`; `components/quick-access-section.tsx` en `app-layout.tsx` (un solo componente para la barra de escritorio y el cajón móvil, DRY); entrada
  «Fijar en la barra lateral» / «Quitar de la barra lateral» en `file-row-menu` (carpetas y archivos, en cualquier nivel del desglose, sin color destructivo); **menú ⋮ en cada fijado**
  de la barra (escritorio y cajón móvil, mismo componente) con «Quitar de la barra lateral»; aviso del tope con `Alert` en tono de advertencia (ADR-0024: lo que no es confirmación va en
  `Alert`; ya no `sonner`), con una **variante `warning`** nueva en `components/ui/alert` (sin dependencia nueva; solo tokens de `ui-guidelines.md`). Elementos como enlaces: carpeta a `archivos/carpeta/[folderId]`, archivo con la descarga de 005, **nada se desglosa**; «Ver más» a `archivos` (raíz) solo si
  `hasMoreRecent`; sección oculta si no hay nada. Se muestran 5 fijados y 3 recientes (`QUICK_ACCESS_*`). La carpeta se registra como reciente al montar su página (por URL, «Ver más», migas o barra; no al expandir, Q-3) y el archivo al pedir la descarga. Estados: cargando, vacío (oculta), error discreto con «Reintentar».
  Revalida tras fijar, quitar y registrar. La web **no agrega** enlaces de navegación «Fijados» ni «Recientes» (solo los grupos de «Accesos rápidos»).

### 9.3 Pruebas por riesgo
| CA | Nivel | Archivo |
|---|---|---|
| CA-27, CA-28 (tope, `PUT` repetido en el tope ⇒ `200`, recientes sin fijados, poda, «Ver más», quitar con y sin apertura) | unit | `application/quick-access.service.spec.ts` |
| CA-27, CA-28 (una por ruta: feliz y error principal; papelera oculta, no ocupa tope y restaurar conserva; purga ⇒ `CASCADE` borra filas; tope concurrente `422`; `CHECK` de un nodo) | int | `test/int/storage/quick-access.int-spec.ts`; migración up/down ×3 en `folders-migrations.int-spec.ts` |
| CA-28 (RNF-05) | iso | `test/isolation/storage-quick-access.iso-spec.ts`: B contra A en las 4 rutas ⇒ `404` idéntico salvo `correlationId`; B nunca ve filas de A en `GET`; RLS niega `acceso_rapido` sin filtro; roles internos `403`, sin token `401` |
| CA-26 | web | `file-explorer.spec.tsx` (expandir/contraer, dos niveles, cargando/vacía/error por fila, `aria-expanded`), axe a 360 y 1440 px |
| CA-27, CA-28, CA-25 | web | `quick-access-section.spec.tsx` (5 + 3, mezcla, solo uno, «Ver más», oculta, menú ⋮ de fijados, `Alert` `warning` del tope, cajón móvil), `file-row-menu.spec.tsx` (Fijar/Quitar), `alert.spec.tsx` (variante), registro de apertura al montar la carpeta y al descargar; axe |

### 9.4 Riesgos, desviaciones y aprobación
- R-6 **Integridad referencial**: resuelta con dos FK `ON DELETE CASCADE` y `CHECK` (ADR-0011). Además, nunca se lee sin unir `accessibleNodes`. La unión
  por `tipo_nodo` + FK es una `OR` sobre ≤ ~30 filas por cuenta; `EXPLAIN` en T-13.
- R-7 **Concurrencia en el tope**: dos `PUT` simultáneos podrían pasar de 5. Se serializa con `lockUsage(actor)` solo en `pin`; lo prueba una integración.
  Costo menor: comparte candado con cargas y mutaciones del árbol del mismo dueño (una operación de milisegundos).
- R-10 **Más fijados visibles que el tope** (restaurar uno que estaba en la papelera, o bajar la configuración): el listado corta en `maxPinned`; sin pérdida de datos.
- R-8 **Densidad** (P-15, resuelta): 5 fijados y 3 recientes visibles; el valor es configuración, no hay que tocar código si cambia.
- R-9 **Sin API para CA-26**: carpetas muy grandes paginan por cursor; Q-2 resuelta: solo la primera página y fila «Ver más» a la carpeta.
- **DF-63** pasa de «Propuesto» a «Propuesto con plan (006 §9)»; texto registrado en `design-findings.md`: tabla `acceso_rapido` (usuario, `archivo_id`/`carpeta_id` con `CHECK` de exactamente uno y
  `ON DELETE CASCADE` según ADR-0011, fijado en, abierto en; RLS de cliente), `QuickAccessService` e `IQuickAccessRepository` internos de `storage`, `QuickAccessController` con 4 rutas bajo
  `/quick-access`, recientes por ruta explícita, `QUICK_ACCESS_MAX_PINNED` y `QUICK_ACCESS_RECENT_VISIBLE`; redibujar clases de M2 y el E-R y reflejarlo en `design-model.md` (PD-46). Un cambio de
  modelo, no de arquitectura entre módulos.
- **Decisiones de Adrián (2026-10-03; todas resueltas)**: **Q-1** sangría de 16 px por nivel a 360 px, repetida pasados 10 niveles. **Q-2** fila «Ver más» al final del nivel que redirige a `/archivos/carpeta/{id}`, sin «Cargar más».
  **Q-3** abrir una carpeta (URL, «Ver más», migas o barra) cuenta como reciente al montar su página; descargar un archivo también; expandir no. **P-15** 5 fijados y 3 recientes visibles.
  También: nada se desglosa en la barra; «Favoritos» pasa a «Fijados» sin enlaces ni páginas nuevas; menú ⋮ de fijados; `Alert` `warning` para el tope; token nuevo para las guías del desglose.
- **Aprobación de la adición**:
  - `architect`: **Aprobado con cambios (2026-10-03); los cambios ya están aplicados en §9.2 a §9.4 y en T-13/T-14 de `tasks.md`.**
    Fronteras, DAG y capas correctos: todo queda en `storage`, `access` solo aporta `accessibleNodes` (arista existente), no hay puerto entre módulos ni
    dependencia nueva, e `IQuickAccessRepository` cumple la regla b del Art. V.2. **No hace falta ADR**: se sigue ADR-0005 (autorización en la consulta y
    RLS), ADR-0011 (con el cambio 1) y el candado de §1. Cambios:
    1. `nodo_id` polimórfico sin FK ⇒ `archivo_id` y `carpeta_id` con `CHECK` de exactamente uno y `ON DELETE CASCADE` (ADR-0011). `typeorm-trash.repository.ts`
       ya no cambia: la papelera no conoce los accesos rápidos (SRP) y no pueden quedar huérfanas. `carga.archivo_id` no es precedente: allí es un id reservado antes de existir la fila.
    2. Sin la columna `fijado`: la deriva `fijado_en IS NOT NULL` (dato duplicado con un `CHECK` para mantenerlo igual).
    3. `propietario_id` ⇒ `usuario_id`: la fila es de quien fija; con 012 el nodo puede ser de otro.
    4. Recientes: `POST /quick-access/recents/:nodeType/:nodeId` sin cuerpo, con los mismos pipes que `pins`, en lugar de `{ type, id }` (un vocabulario y un
       esquema menos; desaparece el `400`). Ruta explícita y no efecto de lectura: **de acuerdo** con las tres razones.
    5. Tope: `lockUsage` solo en `pin` (**aceptado**; un candado o disparador propios serían un segundo mecanismo); se cuentan solo los fijados visibles; `PUT` repetido
       en el tope ⇒ `200`; el listado corta en `maxPinned` (R-10). `422` y no `409`: **de acuerdo** (límite de regla, como la profundidad; `409` queda para choques de nombre).
    6. `QUICK_ACCESS_RECENT_STORED` deja de ser variable de entorno: es una constante con nombre (`RECENTS_STORED`); ninguna spec pide ajustarla (YAGNI).
    7. `QuickAccessItem` sin `folderId?`, `pinnedAt?` ni `openedAt?`: nadie los consume (el orden lo da el servidor). El estado «fijado» del menú de fila sale de `GET /quick-access`; `NodeSummary` no cambia.
    Punto 5 del pedido: el listado y las escrituras unen `accessibleNodes(actor)` dentro de la consulta y la RLS sin política para roles internos es lo correcto
    (no tienen rutas, `403`; `accessibleNodes` les da vacío). Tras la aprobación de Adrián: actualizar `design-model.md` (M2 y tabla) y redibujar (PD-46).
  - Adrián: **Aprobado — Adrián, 2026-10-03**, con el dictamen del architect aplicado y las decisiones de arriba. T-13 a T-17 quedan desbloqueadas.
