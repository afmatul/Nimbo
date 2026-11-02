# Revisión 014b — Original optimizado y cuota

> Una página. La escribe `reviewer` (con `security-auditor` solo si aplica, `workflow.md` §4) y la aprueba Adrián.

| Campo | Valor |
|---|---|
| Fecha | 2026-10-25 |
| Rango revisado | `origin/main..03cf0f0` (15 commits) y las correcciones de I-1, I-2, S-2 y S-3 |
| CI | No se usa como evidencia (GitHub Actions no funciona; decisión de Adrián). Local: `pnpm lint` ✅, `pnpm typecheck` ✅, `pnpm test` ✅, `pnpm test:isolation` ✅ 448/448, `pnpm test:int` 1515 ✅ / 1 ❌ ajeno (`dotenv-bootstrap.int-spec.ts` necesita los servicios de `docker compose`; el diff no lo toca). Tras las correcciones: unitarias de `storage` 873 ✅, integración `versions-optimization`, `usage-reconcile`, `versions-retention` ✅ y aislamiento `storage-versions` 28/28 ✅ |
| Veredicto | ✅ Aprobar |

## Verificación
| CA | Prueba | Estado |
|---|---|---|
| CA-1 | `domain/file-version.spec.ts`; `file-version.service.spec.ts › CA-1`; `test/int/storage/versions-optimization.int-spec.ts › CA-1` | ✅ |
| CA-2 | `file-version.service.spec.ts › CA-2`; `versions-optimization.int-spec.ts › CA-2` (cuenta llena) | ✅ |
| CA-3 | `file-version.spec.ts`; `file-version.service.spec.ts › CA-3`; `versions-optimization.int-spec.ts › CA-3` | ✅ |
| CA-4 | `versions-optimization.int-spec.ts › CA-4`; `version-schemas.spec.ts`; `file-version-summary.spec.ts`; `versions-migrations.int-spec.ts` | ✅ |
| CA-5 | `versions-optimization.int-spec.ts › CA-5` (con cuota y `422`) | ✅ |
| CA-6 | `usage-reconcile.int-spec.ts › 014b CA-6, CA-13`; `version-pruner.spec.ts`; `usage-reconcile.processor.spec.ts` | ✅ |
| CA-7 | `usage-reconcile.int-spec.ts › 014b CA-7` (falla MinIO; la pasada siguiente lo reintenta) | ✅ |
| CA-8 | `versions-retention.int-spec.ts › 014b CA-8, RN-5, RN-7`; `version-pruner.spec.ts` | ✅ |
| CA-9 | `usage-reconcile.int-spec.ts › 014b CA-9`; `space-kept-originals.int-spec.ts › CA-9, CA-10` y `› CA-9, RN-7` | ✅ |
| CA-10 | `space-kept-originals.int-spec.ts › CA-10` (medidor = `espacio_usado`); CA-6 sin ajuste de la conciliación | ✅ |
| CA-11 | `test/isolation/storage-versions.iso-spec.ts › ISO-9, ISO-11, ISO-12` | ✅ |
| CA-12 | `storage-versions.iso-spec.ts › ISO-10` (403) e ISO-7 de 014 (401; rutas sin cambios) | ✅ |
| CA-13 | `usage-reconcile.int-spec.ts › 014b CA-6, CA-13` (`file.version_pruned` con UUID, número y bytes; sin nombre ni clave) | ✅ |
| Demo (T-09) | Recorrido en local hecho por Adrián (2026-10-25) | ✅ |

## Seguridad
- Datos de cliente: sí. Aislamiento: ISO-9 a ISO-12 en `test:isolation` (448/448). `actor` + `accessibleNodes`/RLS: ✅ (`listExpiredKept` filtra dentro de la consulta con `accessibleNodes(actor)`, `propietario_id = actor.id` y `v.id <> version_actual_id`; `markKept` exige el par versión–archivo bajo `requireActorScope`; la pasada actúa como cada dueño, sin `BYPASSRLS`).
- RN-7 (sin doble resta): ✅ la poda resta solo si `countsInQuota`; `FILE_BYTES_SQL`, `FOLDER_BYTES_SQL` y `purgeTargets` comparten `COUNTED_VERSION_SQL`.
- Bytes sin cuota: ✅ la optimizada es estrictamente menor (dominio y `CHECK`); restaurar el original valida cuota y copia el objeto.
- Bitácoras sin contenido, nombres de archivo, tokens ni contraseñas: ✅ (UUID, número, bytes y `errorName`).
- Hallazgos: ninguno. `security-auditor` no aplica (spec fuera de 011, 012, 013, 020 y sin riesgo marcado).

## UI (si aplica)
- No aplica (spec §6). Los *fixtures* web solo suman `keptUntil: null`.

## Bloqueantes
- Ninguno.

## Importantes y sugerencias
- **[I-1]** ✅ Resuelto: `design-model.md` (M2 «con 014b» y la fila `version_archivo.conservada_hasta`).
- **[I-2]** ✅ Resuelto: `markKept` devuelve `boolean` y `register` lanza si no marcó la fila (la transacción se revierte y el contador no diverge); prueba `file-version.service.spec.ts › RN-7`.
- **[S-1]** Abierta, sin acción: la poda decide restar con la versión leída antes de su transacción; es seguro porque solo se marca la actual y la poda nunca la elige. Si cambia, usar `DELETE … RETURNING conservada_hasta`.
- **[S-2]** ✅ Resuelto: `maintain` devuelve lo purgado y `reconcilePage` acumula `failed` y `keptPurged` en el mismo lugar.
- **[S-3]** ✅ Resuelto: `TypeError` como los demás invariantes.
- Nota para 021 (PD-130): su registrador debe comparar, bajo `lockUsage`, la versión de origen con la actual (spec §7).

## DF y pendientes
- DF-21 Aceptado (lado `storage`; la tabla `optimizacion` queda para 021) · DF-38 actualizado · ADR-0013 Aceptado.
- `pendientes.md`: PD-46 suma el E-R `conservada_hasta`; PD-130 nueva para 021. `architecture.md` §7.6 y §8 y `design-model.md` actualizados.
