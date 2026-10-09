# Tareas 014 — Versiones y restauración

> Spec: `./spec.md` · Plan: `./plan.md` (Aprobado, incluye D-12)
> 10 tareas verticales, de medio día a un día, un commit cada una (`feat(storage): … [014 T-xx]`).
> Toda tarea de lógica empieza por su prueba (roja) y termina en verde. Sin tareas de «cierre»: el PR integrado lo es.
> Rutas: código bajo `apps/api/src/modules/<modulo>/` (`storage/…`) y pruebas bajo `apps/api/test/`; `contracts` = `packages/contracts/src/`; web = `apps/web/src/`.

## Orden y paralelismo

```
T-01 ─┐
      ├─> T-03 ─┬─> T-04 ──────────┬─> T-09 (web, diálogo)
T-02 ─┘         ├─> T-05 ─> T-06 ──┼─> T-08 (web, ficha)
                │                  └─> T-07 (aislamiento)
                                   T-06 + T-08 + T-09 ─> T-10 (humana)
```

- En paralelo: **T-01 ∥ T-02** (sin archivos comunes); **T-04 ∥ T-05** tras T-03 (comparten solo el registro de proveedores en
  `upload-lifecycle.providers.ts` / `storage.module.ts`: integrar el segundo con rebase); **T-08 ∥ T-09 ∥ T-07** tras sus dependencias.
- T-06 va después de T-05 porque amplía el mismo controlador.

## Tareas

- [x] **T-01** Migración `20261008100000-versiones-numero-y-restauracion` (con `down`), entidades ORM, contratos y piezas transversales — CA: habilita CA-4, CA-13, CA-19 (sin CA propio observable)
  - Prueba primero: `test/int/storage/migrations.int-spec.ts` y `orm-entities.int-spec.ts` (columnas `numero`, `restaurada_de_numero`, `carga.reemplaza`, `uq_version_archivo_numero`, `ck_version_numero`, `up` → `down` → `up`; filas existentes quedan con `numero = 1`); `billing/…/plan-limits.adapter.spec.ts` (`versionesRetenidas` → `retainedVersions`); `audit-catalog` spec; `contracts/storage/schemas.spec.ts` (`replace` aceptado solo en `initUploadSchema`, rechazado en rename/move), `storage-error-codes.contract.spec.ts`, `storage-routes.contract.spec.ts`.
  - Archivos: `apps/api/src/migrations/20261008100000-versiones-numero-y-restauracion.ts`; `storage/infrastructure/persistence/version-archivo.orm-entity.ts`, `carga.orm-entity.ts`; `storage/application/plan-limits.ts` (`retainedVersions`); `billing/…/plan-limits.adapter.ts`; `audit/…/audit-action.ts`, `audit-catalog.ts` (`file.version_restored`, `file.version_pruned`); `contracts/storage/version-schemas.ts` (nuevo), `schema-fields.ts`, `schemas.ts`, `error-codes.ts` (`STORAGE_VERSION_NOT_FOUND`, `STORAGE_VERSION_ALREADY_CURRENT`), `index`; esquema de entorno y `.env.example` (`RATE_LIMIT_VERSION_RESTORE_PER_MINUTE`, verifica `pnpm env:check`).
  - Depende: —

- [x] **T-02** Dominio de versiones: numeración, retención e historial — CA: CA-6 (cálculo de `deltaBytes`, orden, `null` sin anterior retenida), CA-13 (qué sobra, nunca la actual), CA-5 (fábricas por origen), CA-10/CA-11 (errores de dominio)
  - Prueba primero: `domain/version-retention.spec.ts`, `domain/version-history.spec.ts`, ampliar la spec de `file-version.ts` y de `upload-session.ts` (`replacesFile`).
  - Archivos: `storage/domain/file-version.ts` (`number`, `restoredFromNumber`, `fromUpload(number)`, `fromRestoration`, `forOrigin`), `version-retention.ts`, `version-history.ts`, `upload-session.ts`, `errors/version.errors.ts`.
  - Depende: — (puede ir en paralelo con T-01; los tests de `upload-session` no necesitan la migración)

- [x] **T-03** Registro de versiones y poda: `FileVersionService.register`, `VersionPruner`, `IVersionRepository` — CA: CA-5, CA-4 (numeración consecutiva y `UNIQUE`), CA-13, CA-14, CA-19 (evento `file.version_pruned`)
  - Prueba primero: `application/file-version.service.spec.ts` (misma numeración, cuota y retención para `carga`, `restauracion` y un doble `edicion`/`optimizacion`; sin indexar ni publicar evento), `application/version-pruner.spec.ts` (borra de a una en su transacción; falla de objeto deja fila y espacio intactos y se reintenta; nunca falla al llamador), `test/int/storage/versions-retention.int-spec.ts` (Personal = 3, poda real en MinIO, `espacio_usado` baja, auditoría y bitácoras sin nombres ni claves).
  - Archivos: `storage/application/file-version.service.ts` (`register`, `afterCommit`), `version-pruner.ts`, `ports/i-version.repository.port.ts`, `ports/i-node.repository.port.ts` (`updateCurrentVersion`), `infrastructure/persistence/typeorm-version.repository.ts`, `typeorm-node.repository.ts`; `upload-lifecycle.providers.ts`, `storage.module.ts`, `storage-worker.module.ts`.
  - Documentación del diseño (misma tarea, porque aquí nacen las clases): `docs/sdd/design-findings.md` (DF-65 nuevo para M2, y DF-17, DF-18 parcial, DF-38), `docs/sdd/design-model.md` (tabla de mapeo con `FileVersionService`, `VersionPruner`, `VersionHistoryService`, `VersionRestoreService`, `IVersionRepository` en M2 y las columnas nuevas), `docs/sdd/pendientes.md` (PD-74 nombres de autor y participantes para 016; PD-75 evento `FileVersionCreated` para 019; PD-46 y PD-60 con la nota del plan).
  - Depende: T-01, T-02

- [x] **T-04** Reemplazar un archivo: `onConflict: 'replace'` de punta a punta — CA: CA-1, CA-2, CA-3, CA-4 (concurrencia), CA-19 (reemplazo), CA-15 (dato `wouldPruneVersion` en el `409`)
  - Prueba primero: ampliar `upload.service.spec.ts` y `upload-registrar.spec.ts` (replace sin archivo → sube como nuevo; `ask` con conflicto calcula `wouldPruneVersion` con `VersionRetention`, `null` si no poda; archivo ausente/en papelera al completar → `destination_gone`, carga `cancelada`, `404`); `test/int/storage/versions-replace.int-spec.ts` (feliz con descarga del contenido nuevo y de la anterior; tipo inválido sin versión nueva; cuota/tamaño `422` sin cambio); `versions-concurrency.int-spec.ts` (dos reemplazos y reemplazo + restauración, esta última se completa en T-06: dejar el caso marcado hasta entonces; números consecutivos únicos y `espacio_usado` exacto).
  - Archivos: `storage/application/upload.service.ts`, `upload-registrar.ts`, `quota.service.ts` (`assertFits`, `assertCanUpload` la reutiliza), `ports/i-node.repository.port.ts` y `typeorm-node.repository.ts` (`findLiveFileByName`), `typeorm-upload-session.repository.ts`, `contracts/storage/schemas.ts` (409 `details.wouldPruneVersion`).
  - Depende: T-03

- [x] **T-05** Historial y descarga de una versión — CA: CA-6, CA-7, CA-8, CA-11 (descarga), CA-16 (historial conservado al restaurar de la papelera), CA-19 (sin URLs ni claves en bitácoras)
  - Prueba primero: `test/int/storage/versions-list.int-spec.ts` (`GET /files/:fileId/versions`: orden, `deltaBytes`, `restoredFromNumber` tras poda, `isCurrent`, `retainedVersions`, autor solo `createdById`, sin `clave_objeto`; `POST …/download-url`: URL de 300 s con nombre; versión ajena/podada → `STORAGE_VERSION_NOT_FOUND`; archivo eliminado y restaurado de la papelera conserva el historial), unit de `VersionHistoryService`.
  - Archivos: `storage/application/version-history.service.ts`, `file.service.ts` (`getDownloadUrl(actor, fileId, versionId?)`, una sola ruta de URL firmada), `presentation/file-versions.controller.ts` (rutas `GET …/versions` y `POST …/download-url`, solo `CLIENT`), registro en módulos.
  - Depende: T-03

- [x] **T-06** Restaurar una versión — CA: CA-9, CA-10, CA-11, CA-12, CA-19 (restauración), CA-4 (reemplazo + restauración simultáneos)
  - Prueba primero: `application/version-restore.service.spec.ts` (orden: tasa → archivo → versión 404/409 → cuota → `copyObject` → transacción con revalidación y `register` → `afterCommit`; purga de la copia si falla la transacción; 429), `test/int/storage/versions-restore.int-spec.ts` (feliz con copia real en MinIO, versión nueva `restauracion` con `restoredFromNumber`, ninguna versión existente cambia, `espacio_usado` sube; `409` ya actual; `422` con mensaje de bytes faltantes; `404` versión de otro archivo), completar el caso de concurrencia de T-04.
  - Archivos: `storage/application/version-restore.service.ts`, `ports/i-object-storage.port.ts` (`copyObject`, idempotente), `infrastructure/minio-storage.adapter.ts` (`CopyObjectCommand`), `presentation/file-versions.controller.ts` (ruta `POST …/restore`), registro en módulos.
  - Depende: T-04, T-05

- [ ] **T-07** Aislamiento y roles de las rutas de versiones — CA: CA-16, CA-17, CA-18 (RNF-05, bloqueante en `pnpm test:isolation`)
  - Prueba primero: `test/isolation/storage-versions.iso-spec.ts`: B lista, descarga, restaura y reemplaza un archivo de A ⇒ `404` idénticos salvo `correlationId` (comparado contra un id inexistente); archivo de A en la papelera ⇒ `404` `STORAGE_NODE_NOT_FOUND` en historial, descarga y restauración; Administrador, Soporte y Operador ⇒ `403` `SHARED_FORBIDDEN` en las tres rutas y en el reemplazo; sin token ⇒ `401` `SHARED_UNAUTHENTICATED`; sin filas de `version_archivo` visibles para roles internos. Si falla, se corrige el código de T-04 a T-06 (la tarea no cambia las reglas).
  - Archivos: `test/isolation/storage-versions.iso-spec.ts` (más ajustes mínimos en el código si la prueba revela una fuga).
  - Depende: T-04, T-05, T-06

- [x] **T-08** Web: ficha de archivo con historial, restaurar y descargar — CA: CA-6, CA-7, CA-15 (aviso de poda al restaurar), CA-20
  - Prueba primero (componentes, con axe): `components/nimbo/version-timeline.spec.tsx`, `features/storage/components/restore-version-dialog.spec.tsx`, `file-detail-view.spec.tsx`. Estados del mockup `storage/ficha-archivo/`: default, una-version, cargando, error con «Reintentar», confirmar-restauracion (con espacio), aviso-de-poda, restaurando (> 2 s), restaurada, error-cuota, error-version-no-encontrada, no-encontrado, descarga-preparando; la versión actual sin «Restaurar»; «Tú» por `createdById`; 360 y 1440 px, español, solo tokens.
  - Archivos: `app/(app)/(cliente)/archivos/archivo/[fileId]/page.tsx`, `components/nimbo/version-timeline.tsx`, `features/storage/versions-api.ts`, `hooks/use-file-versions.ts`, `components/file-detail-view.tsx`, `components/restore-version-dialog.tsx`, `components/node-rows.tsx` (entrada «Ver historial» del menú ⋮).
  - Depende: T-05, T-06 (puede arrancar tras T-01 contra los contratos y cerrarse con las rutas reales)

- [ ] **T-09** Web: «Reemplazar (nueva versión)» en el diálogo de nombre repetido — CA: CA-1, CA-15
  - Prueba primero: ampliar `name-conflict-dialog.spec.tsx` (tres acciones, foco inicial en «Conservar ambos», título «Ya tienes un archivo con este nombre», aviso con `wouldPruneVersion`, estados `nombre-repetido`, `nombre-repetido-varios`, `nombre-repetido-poda`) y `upload-manager.spec.ts` (reenvía `onConflict: 'replace'`; con «Aplicar a los demás» + «Reemplazar», cada archivo en su límite vuelve a preguntar con su aviso).
  - Archivos: `features/storage/components/name-conflict-dialog.tsx`, `upload/upload-manager.ts`, `components/uploads-provider.tsx`.
  - Depende: T-04

- [ ] **T-10** **(humana)** Recorrido de la demo en local y nota en el PR — CA: los visibles (CA-1, CA-6, CA-8, CA-9, CA-13, CA-15, CA-20)
  - Subir un archivo, reemplazarlo hasta llegar al límite de Personal (3) viendo el aviso, restaurar una anterior, descargar una versión y comprobar la poda; a 360 y 1440 px.
  - Depende: T-07, T-08, T-09

## Trazabilidad CA → tarea

| CA | Tareas | | CA | Tareas |
|---|---|---|---|---|
| CA-1 | T-04, T-09 | | CA-11 | T-05, T-06 |
| CA-2 | T-04 | | CA-12 | T-06 |
| CA-3 | T-04 | | CA-13 | T-02, T-03 |
| CA-4 | T-03, T-04, T-06 | | CA-14 | T-03 |
| CA-5 | T-02, T-03 | | CA-15 | T-04, T-08, T-09 |
| CA-6 | T-02, T-05, T-08 | | CA-16 | T-05, T-07 |
| CA-7 | T-05, T-08 | | CA-17 | T-07 |
| CA-8 | T-05 | | CA-18 | T-07 |
| CA-9 | T-06 | | CA-19 | T-03, T-04, T-05, T-06 |
| CA-10 | T-02, T-06 | | CA-20 | T-08 |

## Notas del developer

1. DF-64 era de 004: el hallazgo de 014 es **DF-65** (ya corregido en `plan.md`). PD nuevos: PD-74 (016) y PD-75 (019); el PD de «mockups completos» no se crea porque ya están completos.
2. <Desviaciones, DF o pendientes que surjan, con enlace al registro de cambios de la spec.>
