# Revisión 005 — Carga y descarga de archivos

| Campo | Valor |
|---|---|
| Fecha | 2026-10-07 |
| Rango revisado | `9990914^..379395c` (PR-A…PR-F, #36–#41), sobre el árbol de `chore/cierre-fase-1`; lo agregado por 006/007 no se atribuye a 005 |
| CI | Sin CI todavía; local (Windows 11, Docker 29.4.0): lint ✅ (\*), typecheck ✅, unit ✅ (\*\*), int 940/941 (\*\*\*), iso 298/298 ✅ |
| Veredicto | 🔁 Cambios requeridos (B-1) |

(\*) `pnpm lint` falla en local solo por `.claude/worktrees/` (S-3); con `--ignore-pattern ".claude/**"` y `prettier --check` queda en verde. (\*\*) Solo fallas de entorno: `packages/contracts/dist` desactualizado (verde al reconstruirlo) y `redact-deep.spec.ts`, intermitente conocido (sola, 12/12). (\*\*\*) `dotenv-bootstrap` necesita `docker compose up` (Redis 6379) y `worker-health` venció su `afterAll` por la carga (sola pasa); ninguna es de 005. `test/int/storage` completo en verde.

## Verificación

| CA | Prueba (`apps/api/test/…` salvo indicación) | Estado |
|---|---|---|
| CA-1 | `int/storage/uploads-simple` (4) | ✅ |
| CA-2 · CA-10 | `uploads-multipart` (SHA-256; 409 y sigue reanudable) | ✅ |
| CA-3 · CA-4 · CA-23 | `uploads-limits`, `uploads-quota-concurrency`; «Liberar espacio» y sin «Ver planes» en `upload-panel.spec.tsx` | ✅ (con doble del proveedor, I-2) |
| CA-5 · CA-7 | `uploads-validation` (400 con `fields`, 422 vacío, SIZE_MISMATCH y FILE_TOO_LARGE al completar) | ✅ |
| CA-6 | `uploads-name-conflict` («Ñ», papelera, simultáneas → «(1)»); `name-conflict-dialog.spec.tsx` | ✅ |
| CA-8 · CA-22 | `uploads-resume`, `uploads-cancel` (incluye `complete` ∥ `cancel`); `upload-manager.spec.ts`, `cancel-upload-dialog.spec.tsx` | ✅ |
| CA-9 | `upload-cleanup.int-spec` (410 y la carrera con `expire`), `isolation/storage-maintenance` | ✅ |
| CA-11 · CA-12 · CA-24 | `uploads-file-type` (purga con bucket versionado), `magic-bytes.detector.spec.ts` | ✅ |
| CA-13 · CA-14 · CA-15 | `download.int-spec`, `minio-storage.adapter.int-spec` (TTL, `attachment`, host aislado, SHA-256) | ✅ |
| CA-16 · CA-17 | `isolation/storage.iso-spec` (404 idénticos, RLS sin el JOIN, 3 roles internos 403, 401 sin token) | ✅ |
| CA-19 | `rate-limit.int-spec` (Redis real, `Retry-After`, por actor) | ✅ |
| CA-20 | `audit-and-logs.int-spec` | ❌ falta el tamaño en el rechazo y en la descarga (B-1) |
| CA-21 | `a11y.spec.tsx` (360/1440, sin violaciones serias), `file-row-menu`, `file-explorer`, `explorer-error-state`, `upload-panel` | ✅ |

## Seguridad

- Datos de cliente: sí. `actor` en `UploadService` y `FileService`; la descarga resuelve con `findAccessibleById` (`accessibleNodes` dentro de la consulta) y las cargas con `findOwned` + RLS en `carga`. El barrido sin actor está confinado a `IExpiredUploadScanner` / `carga_expiradas`, no se exporta y su prueba corre con dueño NOSUPERUSER. ✅
- URL de descarga de 300 s a un solo objeto, con `attachment`, `octet-stream` y `no-store` firmados contra `MINIO_PUBLIC_ENDPOINT` (`minio-storage.adapter.ts:137-149`). ✅ Límite de tasa antes de resolver el recurso. ✅ Tipo real con los ejecutables primero y `complete` idempotente con CAS. ✅
- Bitácoras sin nombres, URLs firmadas, firmas, claves ni `details`/`suggestedName`. ✅
- Sin hallazgos SEC. 005 no está en la lista de specs con `security-auditor` dedicado.

## UI

Tokens sin colores a mano, textos de §9, «Liberar espacio» lleva a `/espacio` (007), «Ver planes» oculto (008 no integrada). Estados de `mockups/storage/carga` y `explorador` cubiertos, axe sin violaciones serias. ✅ Quedan UI-6 (esqueleto del listado) y las sugerencias UI-9…UI-15 de la auditoría del PR-F (I-4).

## Bloqueantes

- **[B-1]** `apps/api/src/modules/storage/application/upload.service.ts:456-467`, `file.service.ts:163-175` y `apps/api/src/modules/audit/application/audit-catalog.ts:33-38`. `file.upload_rejected` solo lleva `{ reason, mode }` y `file.download_url_issued` no lleva atributos; el catálogo de 004 fija esa lista blanca sin `sizeBytes`. Viola CA-20 («… identificador de recurso, **tamaño** y `correlationId`») y plan §5 Eventos (`attributes: sizeBytes, mode`). Corrección: `sizeBytes: Number(session.declaredBytes)` en el rechazo y `sizeBytes: Number(file.sizeBytes)` en la descarga; `sizeBytes: 'number'` en ambas entradas de `AUDIT_CATALOG`; afirmarlo en `audit-and-logs.int-spec.ts`. Alternativa: que Adrián enmiende CA-20.

## Importantes y sugerencias

- **[I-1]** `apps/api/src/shared/infrastructure/config/env.schema.ts:173`: `UPLOAD_COMPLETE_TIMEOUT_SECONDS` se valida pero nada lo aplica (ni `requestTimeout` del servidor, ni `respondingTimeouts` de Traefik, ni el `fetch` de `complete`). Viola plan §6 paso 4 / R-9 y Art. V. Aplicarlo en el arranque HTTP de `api` y en Traefik, o quitar la variable y abrir un PD si se difiere a 023.
- **[I-2]** PD-56: ninguna carga pasa por `PlanLimitsBindingModule` sin *override* (`test/int/storage/storage-http.ts:246`). Agregar una prueba de integración con la semilla de `plan` (p. ej. > 50 MB en Personal → 422) o anotar el resultado de T-55 en `tasks.md`, y cerrar PD-56.
- **[I-3]** `spec.md`: el registro de cambios del 2026-09-29 sigue «pendiente de Adrián» (lo resolvió 007: `GET /storage/summary` expone `maxFileBytes`, `my-files.tsx:82`); «Última actualización» y §10 desactualizados.
- **[I-4]** `pendientes.md`: faltan filas para UI-6 y UI-9…UI-15, `viewportFit: 'cover'` (sin él `pb-safe` no tiene efecto), la guarda inestable de `redact-deep` (medir contra una referencia) y el `EXPLAIN` inestable de `node.repository.int-spec.ts`.
- **[S-1]** `file.service.ts:128` rearma la clave con `ObjectKey.of(...)` en vez de leer `version_archivo.clave_objeto`; leer la columna antes de que 014/021 creen versiones.
- **[S-2]** `upload.service.ts`: `reject`, `completeParts` y `checkObjectSize` reciben 4 parámetros (Art. VII, ≤ 3); agrupar `actor` y `session`. El archivo mide 690 líneas: vigilarlo cuando 014 sume versiones.
- **[S-3]** ESLint no ignora `.claude/**` (Prettier sí; ya corregido en `feat/017-previsualizacion`, 3a9f6a4). La API en `jest` resuelve `@nimbo/contracts` desde `dist`: mapearlo a `src` evita fallos por un `dist` viejo.

## Lo que está bien hecho

- «CAS primero, borrar después» en `cancel`, `expire` y `reject`; la recuperación de un multipart ya cerrado (`NoSuchUpload` + `headObject`) probada con MinIO real y carreras.
- La función `SECURITY DEFINER` es mínima y endurecida; su prueba con dueño NOSUPERUSER falla en voz alta si el dueño es superusuario.
- Detector de tipo propio, sin dependencias, que lee el ZIP por rangos sin descomprimirlo.
- Pruebas nombradas por CA contra Postgres, Redis y MinIO reales.

## DF y pendientes

Sin DF nuevos (DF-16, DF-38, DF-51, DF-52, DF-59 y DF-60 cerrados o aceptados). Sigue abierto PD-46 (redibujar M2, T1, T2 y E-R). PD-56 se cierra con I-2. Filas nuevas: las de I-4, y la de I-1 si se difiere.
