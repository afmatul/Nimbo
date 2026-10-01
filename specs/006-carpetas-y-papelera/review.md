# Revisión 006 — Carpetas y papelera

| Campo | Valor |
|---|---|
| Fecha | 2026-10-01 |
| Rango revisado | `main..feat/006-carpetas-y-papelera` (T-01 a T-10) |
| CI | local: `pnpm lint`, `typecheck` y `test` en verde (api 1339, web 723, contracts 253); `test:isolation` 12 suites / 163 pruebas en verde. `test:int` completo sin repetir aquí (ver I-1) |
| Veredicto | ✅ Aprobar, con 3 importantes antes del cierre de fase. T-11 (humana) sigue pendiente |

## Verificación
| CA | Prueba | Estado |
|---|---|---|
| CA-1, CA-5 | `test/int/storage/folders.int-spec.ts` (POST /folders, GET /folders/contents) · web `archivos/**/page.spec.tsx` | ✅ |
| CA-2 | `folder-schemas.spec.ts`, `folder-name.vo.spec.ts`, `folders.int-spec.ts` (400) · `new-folder-dialog.spec.tsx` | ✅ |
| CA-3 | `folders.int-spec.ts` (409, tipo distinto sí convive), `folders-migrations.int-spec.ts` (índice «Ñ/ñ») | ✅ |
| CA-4 | `files-organize.int-spec.ts` · `rename-dialog.spec.tsx` (extensión fija en la UI) | ✅ |
| CA-6 | `uploads-folder.int-spec.ts` (destino y carrera a la papelera), `upload.service.spec.ts` | ✅ |
| CA-7 | `folders.int-spec.ts`, `files-organize.int-spec.ts` · `move-dialog.spec.tsx` | ✅ |
| CA-8, CA-9 | `folder-path.spec.ts`, `folders.int-spec.ts` (422) · `move-dialog.spec.tsx` | ✅ |
| CA-10, CA-11 | `trash.int-spec.ts` (descarga 404, `espacio_usado` igual, suma `bigint`) · `use-move-to-trash.spec.tsx` | ✅ |
| CA-12 | `trash.int-spec.ts` (orden, paginación, resumen) · `papelera/page.spec.tsx` | ✅ |
| CA-13, CA-14, CA-15 | `trash.service.spec.ts`, `trash.int-spec.ts` (original, «(n)», raíz, R-5, 422) · `restore-result.spec.tsx` | ✅ |
| CA-16 | `trash.int-spec.ts`, `trash-purge.int-spec.ts` | ✅ |
| CA-17 | `restore-result.spec.tsx`, `papelera/page.spec.tsx` | ✅ |
| CA-18 | `trash-purge.int-spec.ts` (manual y vaciar 202 + trabajo) · `purge-confirm-dialog.spec.tsx` | ✅ |
| CA-19 | `trash-purge.int-spec.ts` (vencida sí, no vencida no, cuenta no activa), `trash-state.spec.ts`, `plan-limits.adapter*.spec.ts` | ✅ (cuenta vencida real depende de 004, I-3) |
| CA-20 | `trash-purger.spec.ts`, `trash-purge.processor.spec.ts`, `trash-purge.int-spec.ts` (fallo MinIO y reintento) | ✅ |
| CA-21 | `trash-purge.int-spec.ts` (eliminar → restaurar → eliminar → purgar) | ✅ |
| CA-22, CA-23 | `test/isolation/storage-folders.iso-spec.ts`, `storage-maintenance.iso-spec.ts`, `accessible-nodes.spec.ts` | ✅ |
| CA-24 | `trash.service.spec.ts`, `trash.int-spec.ts`, `trash-purge.int-spec.ts`, `log-audit-logger.spec.ts` | ✅ |
| CA-25 | `features/storage/a11y.spec.tsx`, specs de diálogos y `papelera/page.spec.tsx` (axe 360/1440) | ✅ |
| T-11 | Recorrido manual con Docker, capturas en el PR | ⏳ pendiente humano |

## Seguridad
- Datos de cliente: sí. Aislamiento: 163 pruebas ISO en verde; B contra A da 404 idéntico en todas las rutas, RLS de `carpeta` sin filtro, roles internos 403 y sin token 401. `actor` + `accessibleNodes`/`ownedTrashedNodes` dentro de cada consulta: ✅ (`typeorm-trash.repository.ts` los usa en cada rama y en `isDueRoot`/`carriedBy`; todos los joins de `nodo_id` filtran por `tipo_nodo`). Roles internos reciben conjunto vacío: ✅.
- Bitácoras sin nombres, claves ni contenido: ✅ (auditoría y logs solo UUID, tipo, conteo, bytes y `errorName`; `trash.service.ts:349`, `trash-purger.ts:80`). Purga programada: la función `papelera_vencida` devuelve solo `(tipo, id, propietario)`, `SECURITY DEFINER` con `search_path` fijo, límite 1000 y sin `BYPASSRLS`. ✅
- Migraciones: las 3 tienen `down` y se prueban up/down ×3 (`folders-migrations.int-spec.ts`). ✅ Tamaños: SQL con `SUM` en `numeric` y `BigInt(...)` en `typeorm-trash.repository.ts:78,108`. ✅
- Sin hallazgos SEC bloqueantes.

## UI
- Coincide con los mockups de `explorador/` y `papelera/` y sus estados; solo tokens (las únicas medidas arbitrarias, `border-l-[3px]` y `border-[1.5px]`, están permitidas por `ui-guidelines.md:221`); axe sin serios; textos en español; `sonner` con `role="status"`: ✅.

## Bloqueantes
- Ninguno.

## Importantes y sugerencias
- **[I-1]** `apps/api/test/int/shared/dotenv-bootstrap.int-spec.ts:89` — al repetirla aquí falla («api» sale antes de responder `health/live`; sin Postgres/Redis locales). Probablemente es de entorno y ajena a 006, pero la corrida completa de `test:int` no terminó y hubo «Cannot log after tests are done». Antes del PR: confirmar en CI que `test:int` completo está verde y que el aviso viene de pruebas de worker (`bootstrap/worker-health` ahora cierran el `Worker` de `trash-purge`).
- **[I-2]** `trash-purger.ts:56-74` (desviación 1) — aceptable y mejor que el plan (evita la carrera restaurar/purgar), pero retiene la fila del dueño y una conexión mientras MinIO responde, y bloquea sus cargas. Con una carpeta grande el bloqueo crece con N archivos × versiones. Aceptar con registro: añadir fila en `pendientes.md` para medir con k6 (spec 021/022) y, si hace falta, purgar por archivo en transacciones separadas. Además, si un error de BD (no de MinIO) aborta la transacción tras borrar objetos de archivos anteriores, esos registros se revierten con objeto ya borrado: poco probable, pero conviene la misma fila.
- **[I-3]** Desviaciones 2, 3 y 4 ya constan en «Notas del developer», pero `plan.md` §2 y `design-findings.md` (DF-61) no mencionan `ITrashRepository.schedulePurgeOfAll` ni `TRASH_LIFECYCLE_PROVIDERS`/`worker.module.ts`; DF-61 sí cita `suspendida`. Agregar `schedulePurgeOfAll` al plan §2 / DF-61. La desviación 3 (CA-19 con `usuario.estado = 'suspendida'`) es válida mientras no exista suscripción (004): dejar una fila en `pendientes.md` para sumar el caso de suscripción vencida cuando exista.
- **[S-1]** `trash.service.ts:87-100` — 11 dependencias en el constructor; `TrashService` junta eliminar, restaurar, purgar y vaciar. Si en 011 (restauración por Soporte) crece más, separar `TrashRestorer`.
- **[S-2]** `trash.service.ts:240,344` — `Number(bigint)` en atributos de auditoría; sigue la convención de 005 y el contrato, pero la regla «bytes siempre `bigint`» sugiere serializar como `string` cuando llegue a la bitácora de 004.

## DF y pendientes
- DF-61 y PD-59 agregados. Faltan: filas en `pendientes.md` por I-2 (medir bloqueo de purga) e I-3 (caso de suscripción vencida) y la mención de `schedulePurgeOfAll` en plan/DF-61.

## Lo que está bien hecho
- Una sola vía de borrado (`TrashPurger`) compartida por manual y programada; idempotente y sin nombres ni claves en errores.
- `ownedTrashedNodes` y `accessibleNodes` con las mismas columnas y `tipo_nodo`; restauración sin `Folder.rehydrate` tras R-5, probada.
- Índices extra de raíz justificados con `EXPLAIN` en la prueba de migración; migraciones reversibles.
- Pruebas de aislamiento amplias (rutas, RLS, `papelera_vencida`) y pruebas web con axe en ambos anchos.
