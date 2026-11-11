# Revisión 017 — Previsualización

> Una página. Borrador de auditoría y seguimiento (2026-10-30); lo aprueba Adrián. **No sustituye** la demo humana T-11 ni el CI con Docker.

| Campo | Valor |
|---|---|
| Fecha | 2026-10-30 |
| Rango revisado | `origin/main..feat/017-previsualizacion` (base = merge-base `8676659`) más el seguimiento de este documento |
| CI | Sin CI con Docker en esta revisión. Local: typecheck ✅, eslint ✅ en lo cambiado, prettier ✅, unit api 2865/2865 ✅, web 2695/2695 ✅, contracts 570/570 ✅, `env:check` ✅. **int, iso y E2E no se ejecutaron aquí**; Adrián confirma (2026-11-11) que las pruebas con Docker salieron bien. Tras integrar `main` (2026-11-11): unit api 3386/3386, web 3089/3089, contracts 682/682, typecheck y eslint limpios |
| Veredicto | ✅ Aprobada por Adrián (2026-11-11): T-04 y T-11 cerradas con sus pruebas humanas; sin bloqueantes de código |

## Verificación
| CA | Prueba | Estado |
|---|---|---|
| CA-1 | `readers/*-reader.spec`, `TextPreview.spec` (incluye relectura Windows-1252), `PreviewPage.readers.spec` | ✅ unit |
| CA-2 | `preview-failure.spec`, `PreviewStates.spec`, `TextPreview.spec` | ✅ unit |
| CA-3 · CA-4 · CA-5 | `test/isolation/storage-preview.iso-spec.ts`, `preview.service.spec`, `storage-preview.facade.spec` | ✅ unit · ⏳ iso (requiere Docker) |
| CA-6 · CA-7 | `PreviewPage.spec`, `my-files.spec`, `preview.int-spec` | ✅ unit · ⏳ int |
| CA-8 · CA-11 | `signed-download.spec`, `preview-delivery.int-spec`, `env.schema.spec` (hostname de objetos distinto del de la web en staging/producción) | ✅ unit · ⏳ int · ⏳ host aislado real (T-04/T-11) |
| CA-9 | `PreviewPage.spec` (axe), `PreviewStates.spec` | ✅ unit · ⏳ E2E 360/1440 |
| CA-10 | `preview.service.spec`, `preview-operation.int-spec` | ✅ unit · ⏳ int |
| CA-12 | `preview.service.spec`, `preview-operation.int-spec` | ✅ unit · ⏳ int |

## Seguridad
- Datos de cliente: sí. `actor` + `findAccessibleById` dentro de la consulta; ajeno e inexistente dan el mismo 404; roles internos 403 en controlador, servicio y fachada (defensa en profundidad deliberada: el servicio falla antes de consumir tasa).
- El controlador copia `file` campo a campo **a propósito** (lista blanca; `preview.controller.spec` verifica que no salgan `objectKey` ni `token`).
- Bitácoras solo con `fileId` y códigos. `fetch` con `credentials: 'omit'`.
- **[SEC-1]** `compose`/dev: objetos en `localhost:9000` comparten hostname con la web, así que no es origen aislado. Mitigado en código: en staging/producción el `api` ya no arranca si `MINIO_PUBLIC_ENDPOINT` comparte hostname con `WEB_PUBLIC_URL`. Falta comprobarlo en DevTools (T-11).

## UI
Mockup en `docs/design/mockups/storage/vista-previa/`; axe cubierto en unit. Pendiente la revisión humana a 360/1440 px (T-11).

## Bloqueantes
- Ninguno. T-04 (host aislado real) y T-11 (demo humana con 403 de un rol interno real) cerradas el 2026-11-11 por atestación de Adrián.

## Seguimiento de la auditoría
- **Auditoría SOLID/DRY/YAGNI (2026-11-11):** se eliminó `PreviewTooManyRequestsError` (copia de `StorageTooManyRequestsError`, ahora exportado por el barrel de `storage`), el tipo `ReaderProps` es único para los lectores y `AccessibleFileUrlIssuer` reutiliza el `signDownload`/`currentVersionObject` de `main` (se retiró `signed-download.ts`). Menores sin cambio: `failAttempt`/`disposeAttempt` por lector (regla de tres), `RATE_LIMIT_WINDOW_SECONDS` en tres servicios.
- **Corregidos:** prettier de `pdfjs-runtime.ts`; texto Latin-1/Windows-1252 ya no es «corrupto» (se relee una vez como Windows-1252); lista de tipos previsualizables única en `@nimbo/contracts`; `useLatestCallbacks` y `releaseHeldReader` sustituyen la copia en Imagen/Texto/PDF/OOXML; funciones del módulo de vista previa ≤ 30 líneas; import de `preview-errors.ts`; regla de hostname aislado; espacio en blanco ajeno en `specs/000-fundaciones/verification.md`.
- **Se mantienen a propósito:** triple verificación de rol (ver Seguridad); copia campo a campo del controlador; `commandTimeout` de Redis (los usos de `REDIS_CLIENT` son GET/EXISTS/SET/EVAL, sin comandos bloqueantes); `useFileDownload` usa `useUploads()` porque ese proveedor es la `StorageApi` de toda la pestaña (también lo usa accesos rápidos); `account-menu` (WCAG 2.5.3) y `.claude/**` en eslint, ajenos a 017 pero ya revisados y sin efecto en otros módulos.
- **[I-1] Riesgo aceptado:** un `.txt` o imagen muy grande se lee entero a memoria y el texto se pinta en un `<pre>` (la spec prohíbe inventar un límite distinto del de carga, CA-2). Decidir con Adrián un tope o virtualización si se mide un problema.
- **[I-2] Complejidad:** ~5 mil líneas de producción en web (lectores OOXML/PDF propios, máquinas de estado de cancelación). Se conserva por exigencia de seguridad y cancelación (ADR-0026); no se simplifica sin spec.

## DF y pendientes
- DF-96 registrado (renumerado desde DF-84, que `main` ya usa para `IShareeDirectory`; igual PD-129 → PD-206). T-04 y T-11 `[x]` en `tasks.md`.
