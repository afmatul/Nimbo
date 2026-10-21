# Revisión 014: Versiones y restauración

| Campo | Valor |
|---|---|
| Fecha | 2026-10-15 |
| Rango revisado | `origin/main...ec63456` (25 commits; incluye los merges 404e7cb y 174f4aa, que trae la 008) |
| CI local | lint ✅ (sin `.claude/worktrees/**`) · typecheck ✅ · env:check ✅ · unit ✅ (api 1724, web 1203, contracts 337, config 240, raíz 34) · int ✅ (107 suites, 979 pruebas) · isolation ✅ (18 suites, 316 pruebas) |
| Veredicto | ✅ Aprobar (sin bloqueantes) |

> Historial: la primera revisión (2026-10-10, `main...4c55e6d`) dio 🔁 con B-1, B-2 e I-1…I-3, corregidos en T-FIX-1…T-FIX-5 (65df387, a113615, c66ff16, 685a8d6, 7f73021). Entorno: `pnpm lint` da 22 075 errores en `.claude/worktrees/**` (worktrees viejos de agentes), ajenos a la rama. La primera corrida de unit falló en api porque `packages/contracts/dist` estaba desactualizado (construido por la 008); tras `pnpm --filter @nimbo/contracts build`, todo en verde.

## Verificación (CA → prueba)
| CA | Prueba | |
|---|---|---|
| 1 | `versions-replace.int-spec` CA-1; `upload-registrar.spec`; `name-conflict-dialog.spec` | ✅ |
| 2, 3 | `versions-replace.int-spec` CA-2, CA-3 | ✅ |
| 4 | `versions-concurrency.int-spec`; `versions-migrations.int-spec` (UNIQUE) | ✅ |
| 5 | `file-version.service.spec` (`it.each` por origen) | ✅ |
| 6, 7 | `versions-list.int-spec`; `version-schemas.spec`; `version-timeline.spec` (participantes con 016, PD-89) | ✅ (7 parcial por diseño) |
| 8 | `versions-list.int-spec` CA-8, CA-19 | ✅ |
| 9–12 | `versions-restore.int-spec`; `version-restore.service.spec` (poda antes y durante la copia → 404); `error-catalog.spec` 014 CA-12 | ✅ |
| 13 | `versions-retention.int-spec`; `version-pruner.spec`; `version-retention.spec` | ✅ |
| 14 | `version-pruner.spec` (solo unitaria; S-3) | ✅ |
| 15 | `versions-replace.int-spec`; `upload-manager.spec`; `restore-version-dialog.spec` | ✅ |
| 16–18 | `storage-versions.iso-spec` ISO-1 a ISO-8; `versions-list.int-spec` CA-16 | ✅ |
| 19 | `upload.service.spec`; `versions-restore/retention.int-spec` | ✅ |
| 20 | `file-detail-view.spec` (estados, nombre/tipo/ubicación, axe 360 y 1440); `restore-version-dialog.spec` | ✅ |

## Seguridad
Toca datos de cliente; aislamiento en verde. `VersionHistoryService` y `VersionRestoreService` (incluido el nuevo `rejectMissingSource`) resuelven el archivo con `findAccessibleById` dentro de `withActor`. El `file` de `GET …/versions` sale de ese mismo archivo resuelto y `versionedFileSchema` es `.strict()` (rechaza `objectKey`, prueba CA-20). Bitácoras sin nombres ni claves: `copyObject` devuelve `false` sin registrar. Sin riesgos nuevos; **no hace falta `security-auditor`.**

## UI
La ficha muestra chip de tipo, nombre como `h1`, «Tipo» y «Ubicación», como el mockup; la ubicación es un enlace sin el nombre de la carpeta (desviación aprobada en el registro de cambios, 2026-10-10). Solo tokens, español, axe sin violaciones. El `422` de restaurar sale de `storageMessage(…, { purpose: 'restore' })`.

## Bloqueantes
Ninguno (B-1 y B-2 cerrados).

## Importantes y sugerencias
- **I-1 cerrado**: `FileVersionsResponse.file` (`versionedFileSchema` = `fileSummarySchema.pick`), con pruebas en contracts, api, int y web.
- **I-2 cerrado**: `IObjectStorage.copyObject` devuelve `false` ante `NoSuchKey` (unitaria y contra MinIO); el servicio revalida y lanza `VersionNotFoundError`.
- **I-3 cerrado**: ADR-0012 «Aceptado» (ADR, `docs/adr/README.md` y cabecera de la spec); 014 «En revisión» en `specs/README.md`.
- **S-1 (abierta)** `apps/web/src/features/storage/version-history.ts:12` (`versionToPrune`) repite la regla de `VersionRetention` que el servidor ya calcula (`upload-target.ts:61-79`); exponer `wouldPruneVersion` en `GET …/versions`.
- **S-2 (abierta)** `upload.service.ts:212` (`reserve`) y `use-version-actions.ts:89` (`useRestoreFlow`) pasan de 30 líneas físicas (el linter no cuenta blancos ni comentarios); extraer el retorno de `useRestoreFlow`.
- **S-3 (abierta)** CA-14 sin prueba de integración en `versions-retention.int-spec.ts` (fallo de `purgeObject` que deje fila y espacio intactos y reintente).
- **S-4 cerrada**: fila del 2026-10-15 en el registro de cambios de la spec.

## DF y pendientes
DF-17 y DF-18 (parcial) en Aceptado; DF-68 vigente. Sin choque de numeración tras la 008 (PD-89/90 de 014, PD-91/92 de 008; el PD-51 duplicado viene de `main`). `RATE_LIMIT_VERSION_RESTORE_PER_MINUTE` en `.env.example` y `ambientes.md`. PD-91 (base única de bytes) alcanzará a la 014 al cierre de fase; el 422 de restaurar sin enlace a planes es coherente con PD-92.

## Veredicto
✅ **Aprobar.** S-1 a S-3 son opcionales (PD o 20 % de refactor de la fase). Adrián aprueba el PR según `workflow.md` §7.1.
