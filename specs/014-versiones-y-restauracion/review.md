# Revisión 014: Versiones y restauración

| Campo | Valor |
|---|---|
| Fecha | 2026-10-10 |
| Rango revisado | `main...4c55e6d` (17 commits) |
| CI local | typecheck ✅ · unit ✅ (api 1706, web 1165, contracts 331, config 240) · isolation ✅ (18 suites, 316 pruebas) · int ⚠️ 972/973 · lint ❌ (B-1) |
| Veredicto | 🔁 Cambios requeridos (2 bloqueantes, ambos baratos) |

> Entorno: `pnpm lint` da 435 errores en `.claude/worktrees/**` (worktrees viejos que ESLint lee aunque Git los excluya); sin esa carpeta, solo falla prettier en un archivo de la rama (B-1). El fallo de int es `test/int/shared/dotenv-bootstrap.int-spec.ts:89` (`ECONNREFUSED 6379`, compose de Nimbo no levantado en esa corrida): ajeno a la 014.

## Verificación (CA → prueba)
| CA | Prueba | |
|---|---|---|
| 1 | `versions-replace.int-spec` CA-1; `upload-registrar.spec`; `name-conflict-dialog.spec` | ✅ |
| 2, 3 | `versions-replace.int-spec` CA-2, CA-3 | ✅ |
| 4 | `versions-concurrency.int-spec`; `versions-migrations.int-spec` (UNIQUE) | ✅ |
| 5 | `file-version.service.spec` (`it.each` por origen) | ✅ |
| 6, 7 | `versions-list.int-spec`; `version-history.spec`; `version-timeline.spec` (participantes llegan con 016, PD-89) | ✅ (7 parcial por diseño) |
| 8 | `versions-list.int-spec` CA-8, CA-19 | ✅ |
| 9–12 | `versions-restore.int-spec` | ✅ |
| 13 | `versions-retention.int-spec`; `version-pruner.spec`; `version-retention.spec` | ✅ |
| 14 | `version-pruner.spec` (solo unitaria; ver S-3) | ✅ |
| 15 | `versions-replace.int-spec`; `upload-manager.spec`; `restore-version-dialog.spec` | ✅ |
| 16–18 | `storage-versions.iso-spec` ISO-1 a ISO-8; `versions-list.int-spec` CA-16 | ✅ |
| 19 | `upload.service.spec`; `versions-restore/retention.int-spec` | ✅ |
| 20 | `file-detail-view.spec` (12 estados, axe 360 y 1440); `restore-version-dialog.spec` | ✅ |

## Seguridad
Toca datos de cliente. Aislamiento en verde; todo servicio resuelve el archivo con `findAccessibleById` y el repositorio usa `requireActorScope`. La tasa de restaurar se aplica antes de resolver el archivo (no es oráculo). Roles internos: `403` y sin filas. Bitácoras sin nombres, URLs ni claves. **No hace falta `security-auditor`.**

## UI
Solo tokens (`border-l-[3px]` es excepción permitida), español, axe sin violaciones, 12 estados del mockup. Única desviación: I-1.

## Bloqueantes
- **B-1** `apps/web/src/features/storage/components/uploads-provider.spec.tsx:269`: no cumple prettier (entró en 4c55e6d); falla `pnpm lint`/CI (Art. XIV). Corregir con `prettier --write`.
- **B-2** `apps/web/src/features/storage/components/restore-version-dialog.tsx:59-63`: el texto del `422` está escrito en el componente, fuera del catálogo (Art. VI.3). Reutilizar `lib/error-catalog.ts` (`STORAGE_QUOTA_EXCEEDED` con propósito `upload | restore`) y `storageMessage`.

## Importantes y sugerencias
- **I-1** `file-detail-view.tsx:158-160`: la ficha no muestra nombre, tipo ni carpeta del archivo (el mockup sí). Agregar `file: { name, kind, folderId }` a `FileVersionsResponse` (`VersionHistoryService.readVersions` ya tiene el `File`), o registrar la desviación en la spec §6 y un PD con aprobación de Adrián.
- **I-2** `version-restore.service.ts:281`: si la versión se poda entre `resolveRestorable` y `copyObject`, `NoSuchKey` sin mapear da `500`; el plan §7 prometía `STORAGE_VERSION_NOT_FOUND`. Revalidar tras el fallo y lanzar `VersionNotFoundError`.
- **I-3** Documentación del PR: commitear `spec.md`/`tasks.md`; ADR-0012 a «Aceptado»; estado de 014 en `specs/README.md`.
- **S-1** `version-history.ts:12-18` repite la regla de `VersionRetention` en la web y avisa de una sola versión; devolver `wouldPruneVersions` desde `GET …/versions`.
- **S-2** `upload.service.ts:212` (`reserve`) y `use-version-actions.ts:89` (`useRestoreFlow`) tienen 33 líneas (> 30, Art. VII.2).
- **S-3** CA-14 sin prueba de integración (el plan la pedía en `versions-retention.int-spec.ts`).

## DF y pendientes
DF-68 coherente con plan y `design-model.md`; DF-17, DF-18 y DF-38 actualizados; PD-89 y PD-90 correctos; PD-46 y PD-60 con nota. Falta el PD o nota de spec para I-1 y ADR-0012 en Aceptado.
