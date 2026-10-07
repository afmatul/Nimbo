# Revisión 005 — Carga y descarga

> Una página. La escribe `reviewer`. 005 toca aislamiento: las pruebas ISO ya están en `main` y esta pasada las contrasta con el código; no hace falta una auditoría nueva.

| Campo | Valor |
|---|---|
| Fecha | 2026-10-07 |
| Rango revisado | `main` @ `76a8a8f`. PR-A…PR-F ya integrados (#36…#41). El comportamiento de 005 sigue en el árbol tras 006, 007, 002 y 004 |
| CI | Local, registrado en `tasks.md` (2026-09-30) y reejecutado dentro de las revisiones posteriores hasta 004 (2026-10-05). Esta pasada no volvió a correr la suite |
| Veredicto | ✅ Aprobar (sin bloqueantes). T-55, el recorrido humano, sigue abierta: la spec queda en `En revisión`, no en `Hecha` |

## Verificación
| CA | Prueba | Estado |
|---|---|---|
| CA-1, CA-2 | `uploads-simple.int-spec.ts`, `uploads-multipart.int-spec.ts` (SHA-256); `upload.service.spec.ts`; web `upload-manager.spec.ts` | ✅ |
| CA-3, CA-4, CA-23 | `uploads-limits.int-spec.ts`, `uploads-quota-concurrency.int-spec.ts`; `quota.service.spec.ts` | ✅ |
| CA-5, CA-7 | `uploads-validation.int-spec.ts`; `upload.service.spec.ts` | ✅ |
| CA-6 | `uploads-name-conflict.int-spec.ts` («Ñ»/«ñ», papelera, dos completes); web `upload-manager.spec.ts`, `name-conflict-dialog` | ✅ |
| CA-8, CA-10, CA-22 | `uploads-resume.int-spec.ts`, `uploads-cancel.int-spec.ts` (carrera `complete` ∥ `cancel`); `upload.service.spec.ts` | ✅ |
| CA-9 | `upload-cleanup.int-spec.ts` (410, reserva liberada, carrera con `complete`); `storage-maintenance.iso-spec.ts` | ✅ |
| CA-11, CA-12, CA-24 | `uploads-file-type.int-spec.ts`; `magic-bytes.detector.spec.ts` | ✅ |
| CA-13, CA-14, CA-15 | `download.int-spec.ts`; `minio-storage.adapter.int-spec.ts` (TTL 2 s, una sola clave, `attachment`) | ✅ |
| CA-16, CA-17 | `storage.iso-spec.ts` (404 idéntico, RLS sin `accessibleNodes`, 403 ×3, 401) | ✅ |
| CA-18 | Retirado (solo lectura → 010) | — |
| CA-19, CA-20 | `rate-limit.int-spec.ts`; `audit-and-logs.int-spec.ts` (sin nombre, URL, firma ni `suggestedName`) | ✅ |
| CA-21 | `upload-panel.spec.tsx`, `file-row-menu.spec.tsx`, `file-explorer.spec.tsx`, `a11y.spec.tsx` (axe a 360 y 1440 px) | ✅ código · T-55 humana abierta |

## Seguridad
- Datos de cliente: sí. Filtro con `actor` y `accessibleNodes` dentro de la consulta; RLS en `archivo`, `version_archivo` y `carga`. Roles internos 403; sin token 401.
- `carga_expiradas` es `SECURITY DEFINER` del dueño; `storage-maintenance.iso-spec.ts` falla si ese dueño es superusuario. El escáner no sale de `storage/index.ts`.
- Bitácoras: `upload.*` y `audit.record` sin nombre, contenido, URL ni clave. `details` no entra al sink. 004 sustituyó el adaptador provisional; `record` sigue sin lanzar.
- Hallazgos SEC: ninguno.

## UI
- Estados de §9 presentes en componentes y en `a11y.spec.tsx`. «Ver planes» sigue oculto (008 no está). «Liberar espacio» del rechazo por cuota apunta a `/espacio` (007 ya existe).
- La cifra `{máximo}` del vacío y del arrastre sale del resumen de 007 (`maxFileLabelOf`). Cierra la propuesta del registro de cambios del 2026-09-29 sin un contrato nuevo en 005.
- La barra lateral ya muestra carpetas y papelera: es 006, no un retroceso de 005.

## Constitución
- SOLID: `UploadService` recorre el ciclo; `QuotaService` decide si cabe; `FileService` lista y firma; `MagicBytesDetector` solo detecta; `UploadRegistrar` cierra el alta. `IPlanLimitsProvider` lo declara `storage` y lo implementa `billing`. El worker no inventa umbrales: `UPLOAD_CONFIG` lanza al leerse.
- DRY: `formatBytes` y el catálogo de errores son la fuente de los textos. `IQuotaRepository` es el único escritor de `espacio_usado` en el alta de 005 (007 concilia el mismo contador).
- YAGNI: sin `IIdGenerator`, métricas, cola de carga ni evento de dominio. Sin «Reemplazar», sin lista de pendientes, sin antivirus.

## Bloqueantes
Ninguno.

## Importantes y sugerencias
- **[I-1]** T-55 sigue sin el recorrido humano (subir simple y por partes, cortar la red, pausar, cancelar, descarga que caduca a los 5 min, 360 y 1440 px). No bloquea el código. La spec no pasa a `Hecha` hasta anotarlo.
- **[S-1]** `upload.service.ts`: `reject` y `resumeResponse` pasan de 30 líneas (guía del Art. VII). El resto del servicio está partido en métodos cortos.

## Decisiones de las notas del developer
Confirmadas: `expire` abre su propio `withActor` (no se anida durante el borrado en MinIO); `complete` ∥ `cancel` no deja archivo sin objeto; el cliente de firma del worker apunta al endpoint interno; `I_PLAN_LIMITS_PROVIDER` se enlaza en `WorkerModule`.

## DF y pendientes
Sin DF nuevo. PD-66…PD-68 son de 004. La propuesta de `{máximo}` queda cerrada por 007.
