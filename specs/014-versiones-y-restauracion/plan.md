# Plan 014 — Versiones y restauración

> Spec: `./spec.md` · Estado del plan: Aprobado
> Obligatorio y ≤ 250 líneas. Dice **qué** archivos se tocan y **qué** se espera de cada uno; no es el código en
> prosa (sin cuerpos de funciones ni pseudocódigo). Lo aprueba Adrián antes de escribir código.

## 1. Resumen técnico

Todo vive en `storage` (M2), dueño del ciclo de vida de versiones (DF-17, ADR-0012). Hay **una sola operación de
escritura de versiones**, `FileVersionService.register`, que corre dentro de la transacción del llamador: toma
`lockUsage` (el mismo serializador por propietario de 005/006), numera, inserta la versión, mueve el puntero de
`archivo` y suma a `espacio_usado`. La usan dos caminos de 014: **reemplazar** (la carga de 005 que apunta a un archivo
existente, `UploadRegistrar`) y **restaurar** (copia del objeto + `register`). 016 y 021 la reutilizarán con otro
`origen` sin tocarla (OCP).

- **Numeración (CA-4):** `numero = MAX+1` calculado bajo `lockUsage`, con `UNIQUE (archivo_id, numero)` como red de
  seguridad. La versión actual siempre es la de mayor número, así que un número nunca se reutiliza tras una poda (RN-4).
- **Poda (CA-13, CA-14):** después del commit, `VersionPruner` borra cada excedente en su **propia** transacción
  (`lockUsage` → `purgeObject` → fila → `addUsedBytes(-bytes)`), igual que `TrashPurger`: si el objeto falla, la fila y el
  espacio no cambian y la poda siguiente lo reintenta. Un fallo de poda nunca falla el reemplazo ni la restauración.
- **Restaurar:** `copyObject` (nuevo método de `IObjectStorage`, copia en el servidor) **fuera** de la transacción, como
  los bytes de una carga; luego una transacción revalida y registra. Si falla, se purga la copia (Art. XI).
- **Reemplazar:** `onConflict: 'replace'` en `POST /uploads`; `carga.reemplaza` marca la sesión, que reserva el id del
  archivo existente y un `version_id` nuevo. Cuota, máximo por archivo y tipo real reutilizan 005 sin cambios.
- **Autoría:** la versión guarda `creado_por`. Nombres de usuario no se leen (frontera de `identity`): la API devuelve el
  id y la web pinta «Tú». El puerto de `identity` para nombres y los participantes de edición llegan con 016 (PD nuevo).

## 2. Módulos, archivos y diseño

| Módulo / capa | Archivo (nuevo o cambiado) | Responsabilidad |
|---|---|---|
| storage/domain | `file-version.ts` (cambia) | Agrega `number`, `restoredFromNumber`; fábricas `fromRestoration` y `forOrigin` (edición/optimización para 016/021); `fromUpload` recibe `number` |
| storage/domain | `version-retention.ts` (nuevo) | `VersionRetention.surplus(versions, retained)`: puras; devuelve las más antiguas que sobran, nunca la actual |
| storage/domain | `version-history.ts` (nuevo) | `VersionEntry` (versión + `deltaBytes` frente a la anterior retenida, `null` si no la hay) y el orden descendente; VO de lectura |
| storage/domain | `upload-session.ts` (cambia) | `replacesFile: boolean` en `start`/`snapshot`; con él `fileId` es el del archivo existente |
| storage/domain/errors | `version.errors.ts` (nuevo) | `VersionNotFoundError` (404), `VersionAlreadyCurrentError` (409), códigos `STORAGE_*` |
| storage/application | `file-version.service.ts` (nuevo) | `register(actor, command)` en la transacción del llamador; `afterCommit(actor, fileId)` tras el commit: dispara la poda |
| storage/application | `version-pruner.ts` (nuevo) | `prune(actor, fileId)`: lee `retainedVersions`, calcula `surplus`, borra una a una; audita `file.version_pruned`; traga y registra sus fallos |
| storage/application | `version-history.service.ts` (nuevo) | `list(actor, fileId)`: historial + `retainedVersions` del plan |
| storage/application | `version-restore.service.ts` (nuevo) | `restore(actor, fileId, versionId)`: tasa → validar (404/409/cuota) → `copyObject` → transacción (revalida, `register`) → `afterCommit` + auditoría |
| storage/application | `upload-registrar.ts` (cambia) | Si `session.replacesFile`: en lugar de insertar `archivo`, llama `register`; archivo ausente o en papelera ⇒ `destination_gone` (carga `cancelada`) |
| storage/application | `upload.service.ts` (cambia) | `init` con `replace`: busca el archivo vivo con ese nombre; si no hay, sube como nuevo. Con `ask` y conflicto, calcula `wouldPruneVersion` con `VersionRetention` (DRY) y lo pasa a `NameConflictError`. Tras `register`, `afterCommit` y la auditoría con `versionNumber` |
| storage/application | `file.service.ts` (cambia) | `getDownloadUrl(actor, fileId, versionId?)`: una sola ruta de URL firmada, tasa y auditoría (DRY); con `versionId` valida que sea del archivo |
| storage/application | `quota.service.ts` (cambia) | `assertFits(actor, bytes, limits)`: solo cuota (RN-9); `assertCanUpload` la reutiliza tras el chequeo de máximo |
| storage/application | `plan-limits.ts` (cambia) | `PlanLimits.retainedVersions: number` (mismo precedente que `trashRetentionDays`) |
| storage/application/ports | `i-version.repository.port.ts` (nuevo) | `IVersionRepository`: `list`, `find`, `nextNumber`, `insert`, `delete`; todo con `actor` |
| storage/application/ports | `i-node.repository.port.ts` (cambia) | `findLiveFileByName(actor, name, folderId)` y `updateCurrentVersion(actor, file)` |
| storage/application/ports | `i-object-storage.port.ts` (cambia) | `copyObject(sourceKey, targetKey)`; idempotente al reintentar |
| storage/infrastructure | `persistence/typeorm-version.repository.ts` (nuevo) | Consultas con `requireActorScope`; `list` ordenado por `numero DESC`; RLS de `version_archivo` ya existe |
| storage/infrastructure | `persistence/typeorm-node.repository.ts`, `version-archivo.orm-entity.ts`, `carga.orm-entity.ts`, `typeorm-upload-session.repository.ts` (cambian) | Columnas nuevas; `findLiveFileByName` compara `lower(nombre)` con `accessibleNodes`; `updateCurrentVersion` |
| storage/infrastructure | `minio-storage.adapter.ts` (cambia) | `copyObject` con `CopyObjectCommand` (límite 5 GB > 2 GB del plan más alto) |
| storage/presentation | `file-versions.controller.ts` (nuevo) | Tres rutas de §4; solo `CLIENT`; mapea a `FileVersionSummary` sin `clave_objeto` |
| storage | `upload-lifecycle.providers.ts`, `storage.module.ts`, `storage-worker.module.ts` (cambian) | Registran servicios y repositorio; el `worker` los necesita porque comparte `UploadService` |
| audit | `audit-action.ts`, `audit-catalog.ts` (+ specs) (cambian) | `FILE_VERSION_RESTORED = 'file.version_restored'`, `FILE_VERSION_PRUNED = 'file.version_pruned'` |
| billing | `plan-limits.adapter.ts` (+ spec) (cambia) | Mapea `versionesRetenidas` → `retainedVersions` (la columna ya existe) |
| shared | esquema de entorno y `.env.example` (cambian) | `RATE_LIMIT_VERSION_RESTORE_PER_MINUTE` (verifica `pnpm env:check`) |
| contracts | `storage/version-schemas.ts` (nuevo); `schema-fields.ts`, `schemas.ts`, `error-codes.ts`, `index` (cambian) | Tipos `FileVersionSummary`, `FileVersionsResponse`; `replace` solo en `initUploadSchema` (rename y move siguen con `ask`/`keep_both`) |
| web | ver «Frontend» | Ficha de archivo, diálogo de nombre repetido, confirmación de restaurar |

- **Puertos nuevos:** solo `IVersionRepository` (frontera de capa, como `INodeRepository`). El evento
  `FileVersionCreated` y su puerto se difieren a 019, su primer consumidor (Art. V.2, decisión de Adrián). `copyObject` y `PlanLimits.retainedVersions` **amplían** puertos
  existentes. No se agrega interfaz sin frontera real: `FileVersionService`, `VersionPruner`, `VersionHistoryService` y
  `VersionRestoreService` son clases concretas (SRP: registrar / podar / leer / restaurar).
- **Nombres de los diagramas:** el diagrama pone `VersionHistoryService` e `IVersionRepository` en M5 y duplica la
  restauración en `FileService.restoreVersion`. Aquí quedan en M2 (DF-17) y `FileService` no restaura; 016 solo aportará
  la autoría. Se registra en DF-68.
- **Dependencias nuevas entre módulos:** ninguna. `storage` no importa `editing`; 016 consumirá `FileVersionService` (su plan
  decide cómo se exporta). Hoy `storage/index.ts` no exporta nada nuevo (YAGNI).
- **Frontend (`apps/web`, tokens de `ui-guidelines.md`, sin colores a mano):**
  - Ruta `app/(app)/(cliente)/archivos/archivo/[fileId]/page.tsx` (hermana de `archivos/carpeta/[folderId]`) con la
    ficha; entrada desde el menú ⋮ de la fila de archivo («Ver historial», `components/node-rows.tsx`).
  - `components/nimbo/version-timeline.tsx` (componente del inventario `VersionTimeline`, §4 de `ui-guidelines.md`):
    versión, fecha, autor, tamaño, cambio, origen y acciones por versión. Participantes con anillo de avatar llegan con 016.
  - `features/storage/`: `versions-api.ts`, `hooks/use-file-versions.ts`, `components/file-detail-view.tsx`,
    `components/restore-version-dialog.tsx` (confirmación con espacio y versión que se elimina, CA-15).
  - Diálogo de 005: `name-conflict-dialog.tsx` con «Reemplazar (nueva versión)», título nuevo y aviso de poda (tres botones, foco
    inicial en «Conservar ambos»; con «Aplicar a los demás» pregunta de nuevo por cada archivo en su límite) y
    `upload/upload-manager.ts` / `components/uploads-provider.tsx` para reenviar `onConflict: 'replace'`.
  - Mockups completos en `storage/ficha-archivo/` y `storage/carga/` (spec §6). La versión actual no muestra «Restaurar».

## 3. Datos

```sql
-- Migración 20261008100000-versiones-numero-y-restauracion (una sola, reversible)
ALTER TABLE version_archivo
  ADD COLUMN numero          integer NOT NULL DEFAULT 1,           -- cada archivo tiene hoy exactamente 1 versión
  ADD COLUMN restaurada_de_numero integer;                         -- número, no FK: sobrevive a la poda (los números no se reutilizan)
ALTER TABLE version_archivo ALTER COLUMN numero DROP DEFAULT;
ALTER TABLE version_archivo ADD CONSTRAINT ck_version_numero CHECK (numero > 0 AND (restaurada_de_numero IS NULL OR restaurada_de_numero BETWEEN 1 AND numero - 1));
CREATE UNIQUE INDEX uq_version_archivo_numero ON version_archivo (archivo_id, numero);
ALTER TABLE carga ADD COLUMN reemplaza boolean NOT NULL DEFAULT false;
```

- **Sin `UPDATE` de respaldo:** antes de 014 ningún camino crea una segunda versión (005 solo escribe `origen = 'carga'`),
  así que `DEFAULT 1` es correcto para toda fila existente y evita un `UPDATE` bajo `FORCE ROW LEVEL SECURITY`.
- **RLS:** sin cambios; las columnas nuevas heredan `version_archivo_cliente` y `carga_cliente`. Los roles internos siguen
  sin filas de `version_archivo`.
- **Índices:** `uq_version_archivo_numero` sirve también para listar por `numero DESC` y para `MAX(numero)`.
  `idx_version_archivo_archivo` existente queda.
- `carga.archivo_id` sin FK (como hoy): con `reemplaza = true` es el id de un archivo existente.
- `down`: `DROP INDEX uq_version_archivo_numero`, `DROP COLUMN restaurada_de_numero`, `numero` (y su `CHECK`) y
  `carga.reemplaza`. Probado por la prueba de reversión de migraciones (RNF-10).
- Tamaños `bigint`; `espacio_usado` se mantiene con `addUsedBytes` (positivo al registrar, negativo al podar); la
  conciliación de 007 ya suma todas las versiones y no cambia.

## 4. Contratos

| Método | Ruta | Rol | Request → Respuesta | Errores (`code`) |
|---|---|---|---|---|
| POST | `/uploads` (existente) | CLIENT | `onConflict: 'replace'` → `InitUploadResponse` con el nombre del archivo existente; sin archivo con ese nombre se comporta como nuevo. Con `ask`, el `409` `STORAGE_NAME_CONFLICT` suma a `details` `wouldPruneVersion: number \| null` (versión que podaría «Reemplazar»; solo en cargas, no en renombrar/mover) | los de 005; `STORAGE_NODE_NOT_FOUND` si la carpeta ya no existe |
| POST | `/uploads/:id/complete` (existente) | CLIENT | → `CompleteUploadResponse` con el `FileSummary` actualizado | los de 005; `404` `STORAGE_NODE_NOT_FOUND` si el archivo ya no está vivo |
| GET | `/files/:fileId/versions` | CLIENT | → `{ file: { name, kind, folderId }, items: FileVersionSummary[], retainedVersions }` (`file` para el encabezado y los detalles de la ficha, T-FIX-4) (`id`, `number`, `origin`, `sizeBytes`, `deltaBytes: string \| null`, `restoredFromNumber: number \| null`, `createdAt`, `createdById`, `isCurrent`) | `STORAGE_NODE_NOT_FOUND` (404) |
| POST | `/files/:fileId/versions/:versionId/restore` | CLIENT | → `FileVersionSummary` de la versión nueva | `STORAGE_NODE_NOT_FOUND`, `STORAGE_VERSION_NOT_FOUND` (404), `STORAGE_VERSION_ALREADY_CURRENT` (409), `STORAGE_QUOTA_EXCEEDED` (422), `STORAGE_TOO_MANY_REQUESTS` (429) |
| POST | `/files/:fileId/versions/:versionId/download-url` | CLIENT | → `DownloadUrlResponse` (300 s) | `STORAGE_NODE_NOT_FOUND`, `STORAGE_VERSION_NOT_FOUND` (404), `STORAGE_TOO_MANY_REQUESTS` (429) |

- Sin paginación: el plan más alto retiene 100 versiones. Roles distintos de CLIENT: `403` `SHARED_FORBIDDEN`; sin token, `401`.
- Sin eventos en 014: `FileVersionCreated` lo agrega 019 junto a su consumidor. No hay Socket.IO.

## 5. Seguridad y operación

- **`actor` y aislamiento:** todo método recibe `actor`; cada consulta de `IVersionRepository` y `INodeRepository` pasa por
  `requireActorScope(actor)`, y el archivo se resuelve con `findAccessibleById` (une `accessibleNodes(actor)`) **antes**
  de tocar versiones; una versión de otro archivo es `STORAGE_VERSION_NOT_FOUND`, un archivo ajeno o en papelera es
  `STORAGE_NODE_NOT_FOUND` (CA-16, CA-17). RLS de `version_archivo` es la segunda barrera.
- **Tasa:** la restauración copia hasta 2 GB, por eso tiene límite propio (`RATE_LIMIT_VERSION_RESTORE_PER_MINUTE`, vía
  `IRateLimiter`, antes de resolver el archivo para no dar oráculo). Descarga de versión y reemplazo reutilizan los de 005.
- **Auditoría (`IAuditLogger`, de mejor esfuerzo como 005):** reemplazo = `file.upload_completed` con
  `attributes { sizeBytes, mode, replaced: true, versionNumber }`; restauración = `file.version_restored`
  `{ versionNumber, restoredFromNumber, sizeBytes }`; poda = `file.version_pruned` `{ versionNumber, sizeBytes }`.
  `resourceId` = UUID del archivo. Nunca nombres, claves de objeto, URLs ni `upload_id` (CA-19).
- **Bitácoras técnicas (Pino):** `version.registered`, `version.restored`, `version.pruned`, `version.prune_failed`
  (solo `fileId`, `versionId`, `errorName`; el mensaje de un error de S3 puede traer la clave). Métricas: diferidas a 022.
- **Compensaciones:** restaurar purga la copia si falla la transacción; reemplazar usa el descarte de 005; la poda deja la
  fila intacta si falla el objeto. Un objeto huérfano sin fila no cuenta en la cuota (como 005 R-7).

## 6. Estrategia de pruebas (por riesgo)

| CA | Nivel | Archivo |
|---|---|---|
| CA-13 (qué sobra, nunca la actual) | unit | `domain/version-retention.spec.ts` |
| CA-6 (`deltaBytes` y nulo sin anterior retenida, orden) | unit | `domain/version-history.spec.ts` |
| CA-5 (numeración, origen, `register` sin conocer 016/021) | unit | `application/file-version.service.spec.ts` (repositorios y almacén dobles; origen `edicion` con doble) |
| CA-9, CA-10, CA-12 (orden de pasos, compensación al fallar) | unit | `application/version-restore.service.spec.ts` |
| CA-13, CA-14 (reintento tras fallo de objeto) | unit | `application/version-pruner.spec.ts` |
| CA-1, CA-2, CA-3 (reemplazo; archivo ausente al completar) | unit | `application/upload.service.spec.ts`, `upload-registrar.spec.ts` (se amplían) |
| CA-1, CA-3, CA-8, CA-16 | int (Testcontainers + MinIO) | `test/int/storage/versions-replace.int-spec.ts` (feliz + tipo inválido; descarga del contenido nuevo y de la anterior) |
| CA-9, CA-10, CA-11, CA-12 | int | `test/int/storage/versions-restore.int-spec.ts` (feliz + cuota; copia real en MinIO, `espacio_usado`) |
| CA-13, CA-14, CA-19 | int | `test/int/storage/versions-retention.int-spec.ts` (poda real con plan Personal = 3; objeto borrado; auditoría y bitácoras sin nombres) |
| CA-4 | int | `test/int/storage/versions-concurrency.int-spec.ts` (dos reemplazos y reemplazo + restauración simultáneos: números consecutivos únicos, `espacio_usado` exacto) |
| CA-6, CA-7 | int | `test/int/storage/versions-list.int-spec.ts` (una ruta, autor sin nombres) |
| Migración y `down` | int | `test/int/storage/migrations.int-spec.ts` y `orm-entities.int-spec.ts` (se amplían) |
| CA-17, CA-18, CA-16 | iso (bloqueante) | `test/isolation/storage-versions.iso-spec.ts`: B lista, descarga, restaura y reemplaza archivo de A ⇒ `404` idénticos; roles internos `403`; archivo en papelera ⇒ `404` |
| CA-15, CA-20 | web (componentes) | `version-timeline.spec.tsx`, `restore-version-dialog.spec.tsx`, `file-detail-view.spec.tsx` (estados: una versión, restaurando, error, aviso de poda; axe) |
| CA-1, CA-15 (diálogo «Reemplazar», aviso con `wouldPruneVersion`, «Aplicar a los demás» vuelve a preguntar en el límite) | web | `name-conflict-dialog.spec.tsx`, `upload-manager.spec.ts` (se amplían) |
| Contratos | unit | `contracts/storage/schemas.spec.ts` (el caso «`replace` rechazado» pasa a «aceptado solo en init»), `storage-error-codes.contract.spec.ts`, `storage-routes.contract.spec.ts` |
| Recorrido de la demo | e2e (tarea humana) | subir, reemplazar, restaurar y ver la poda |

No se repite un CA en tres capas: las reglas puras van en unitarias; cada endpoint tiene una integración con el camino
feliz y su error principal; el aislamiento va solo en `test/isolation`.

## 7. Riesgos y coherencia con el diseño

- **Poda y restauración con S3 dentro del lock** (PD-60 aplica): se mitiga podando una versión por transacción y copiando
  fuera de la transacción. Medir con k6 en 023 si pesa.
- **Rutas de carrera:** el archivo pasa a la papelera o se purga entre `init` y `complete` de un reemplazo ⇒ la carga queda
  `cancelada`, se borra lo subido y se responde `404`. La versión a restaurar se poda mientras se copia ⇒ la copia falla o
  la revalidación no la encuentra ⇒ `STORAGE_VERSION_NOT_FOUND`.
- **Retención efectiva retrasada:** si la poda falla, el archivo queda con más versiones que su plan hasta la siguiente
  poda (cuentan en la cuota; no hay pérdida). Bajar de plan no poda de inmediato (010).
- **Autoría sin nombres:** «Tú» solo es verdadero mientras solo el propietario actúa (D-5); 016 agrega el puerto de
  `identity` para resolver nombres de autor y participantes (PD nuevo).
- **Decidido por Adrián (08/10):** el evento `FileVersionCreated` se difiere a 019 (YAGNI); se mantiene la tasa propia de
  restaurar; nombres de autor con 016; historial sin paginar; el reemplazo reutiliza `file.upload_completed`; la poda por
  bajar de plan es de 010. `copyObject` en el servidor tiene tope de 5 GB en S3, que cubre el máximo de 2 GB.
- **Desviaciones de los diagramas:** DF-68 (nuevo): `FileVersionService`, `VersionPruner`, `VersionHistoryService`,
  `VersionRestoreService` e `IVersionRepository` en M2; columnas `version_archivo.numero`, `restaurada_de_numero` y
  `carga.reemplaza`. Se actualizan DF-17, DF-18 (parcial: sin `sesion_edicion_id`, que trae 016) y DF-38 (014 ajusta
  `espacio_usado`) y la tabla de mapeo de `design-model.md`.
- **Pendientes (`pendientes.md`):** PD-46 (redibujar M2 con las clases de 014 y el E-R); PD nuevo: resolución de nombres de
  autor y participantes (016); PD nuevo: evento `FileVersionCreated` (019); PD nuevo: mockups `ficha-archivo` y `nombre-repetido` completos; PD-60 (suma el
  costo de la poda).
- **ADR requeridos:** ninguno. ADR-0012 (Propuesto) ya cubre la composición con `origen`; hay que pasarlo a Aceptado al
  integrar.

## 8. Aprobación

- `architect`: no aplica. Sin puerto nuevo entre módulos (el evento se difirió a 019), sin tecnología nueva ni cambio de
  arquitectura.
- Adrián: **Aprobado** (2026-10-08); ajuste de contrato tras los mockups (D-12 de la spec) aprobado el mismo día.
