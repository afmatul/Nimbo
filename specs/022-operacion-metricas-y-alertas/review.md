# Revisión 022 — Operación: métricas, tablero de operación y alertas

> Una página. La escribe `reviewer`; la aprueba Adrián.

| Campo | Valor |
|---|---|
| Fecha | 2026-11-10 |
| Rango revisado | `main...HEAD` (PR #78, cabeza `64e5e16` tras integrar `main`; segunda pasada el 2026-11-10) |
| CI | No consultado desde esta sesión. Local tras integrar `main`: `lint`, `typecheck`, `test` (api 3325, scripts 110, contracts 661, config 255; web 2216/2217: `file-row-menu.spec.tsx` falló una vez y pasa aislado 23/23, archivo ajeno a 022) y `env:check` en verde. `test:int` no ejecutado aquí (sin Docker) |
| Veredicto | ✅ Aprobar (sin bloqueantes; 4 importantes; CA-3 parcial aceptado por Adrián) |

## Verificación
| CA | Prueba | Estado |
|---|---|---|
| CA-1 | `metrics-endpoint.int-spec.ts` › CA-1 (HTTP, colas, espera y ejecución, todas las colas); paneles en `observability.spec.ts` | ✅ (int no ejecutado aquí) |
| CA-2 | `metrics-endpoint.int-spec.ts` › CA-2 (404 públicos, worker fuera de `/api/v1`); `observability.spec.ts` › CA-2 (sin `ports:`, sin Traefik) | ✅ |
| CA-3 | `observability.spec.ts` › CA-3; `dependency-metrics.collector.spec.ts`. Disco por contenedor (panel 15) sin datos en WSL2: **PD-173**, abierto | ⚠️ Parcial, aceptado |
| CA-5 | `metrics-endpoint.int-spec.ts` › CA-5 (sin UUID, correo, consulta ni errores); `observability.spec.ts` › CA-5 | ✅ |
| CA-6 | `observability.spec.ts` › CA-6; demo T-09 (15 paneles) | ✅ |
| CA-9 | `observability.spec.ts` › CA-9; demo T-09 (34/34 comprobaciones, capturas 01–04) | ✅ |
| CA-10 | `observability.spec.ts` › CA-10; demo desde volúmenes vacíos (capturas 05–06) | ✅ |
| CA-11 | `alert-rules.int-spec.ts` (5xx); demo 5xx con correo en Mailpit (capturas 14–16) | ✅ |
| CA-12 | `alert-rules.int-spec.ts` (p95, exclusión S-5); `metrics-endpoint.int-spec.ts` › CA-12 | ✅ |
| CA-13 | `alert-rules.int-spec.ts` (colas); `observability.spec.ts` › CA-13 | ✅ |
| CA-14 | `alert-rules.int-spec.ts` (disco, incluidos tmpfs, overlay y loop); `observability.spec.ts` › CA-14 | ✅ |
| CA-15 | `metrics-endpoint.int-spec.ts` › CA-15 y RN-4; regla 5 en el banco | ✅ |
| CA-16 | Regla 6 en el banco y en `observability.spec.ts`; sin pasada de renovación real (la cascada de la demo la disparó) | ✅ |
| CA-18 | Demo T-09 (Redis detenido, correos de disparo y resolución; capturas 10–13) | ✅ |
| CA-4, 7, 8, 17 | Trasladados a 022d (spec §3) | n/a |

## Seguridad
- Datos de cliente: no. Aislamiento: no aplica. `actor` + `accessibleNodes`/RLS: n/a (022 no agrega rutas de cliente).
- `/metrics` sin UUID, correos, nombres de archivo ni mensajes de error (plantilla de ruta, etiquetas de conjunto cerrado). Bitácoras solo con `queue` y `errorClass`: ✅
- cAdvisor sin `privileged`, montajes `:ro`; Grafana en `127.0.0.1`, sin anónimo, registro, públicos ni instantáneas externas: ✅
- **[SEC-1]** baja · `.env.example` · `GRAFANA_ADMIN_PASSWORD` por defecto débil, aceptable en local; sumar a PD-167 (d) para staging.

## UI
- Sin UI de `apps/web`; el tablero es de Grafana (spec §6). Evidencia visual en `evidencias/t09/`: ✅

## Bloqueantes
- Ninguno.

## Importantes y sugerencias
- ~~**[I-1]**~~ ✅ resuelto 2026-11-10 · `spec.md` §10 y `plan.md` — registrar `GF_PUBLIC_DASHBOARDS_ENABLED`, `GF_SNAPSHOTS_EXTERNAL_ENABLED` y `GF_USERS_VIEWERS_CAN_EDIT` (T-08), autorizadas por Adrián el 2026-11-05 junto con `GF_SERVER_ROOT_URL`. `.env.example` y `env:check`: ✅
- ~~**[I-2]**~~ ✅ resuelto 2026-11-10 · DF-29 nombra `metrics-server.ts`, que no existe (es `metrics.module.ts`). Nombre corregido; al integrar: DF-29 a Resuelto y PD-166 a Cerrados.
- ~~**[I-3]**~~ ✅ resuelto 2026-11-10 · Anotar en la spec «CA-3 parcial hasta PD-173; si staging tampoco da datos, se retira el panel 15».
- ~~**[I-4]**~~ ✅ resuelto 2026-11-10 · `evidencias/t09/README.md:8` y cabecera de `spec.md` desactualizados (T-09 ya está `[x]`; fecha 2026-11-03).
- **[S-1]** reflujar el comentario de `startWorker` en `worker-bootstrap.ts`. **[S-2]** `health.ready` cada 15 s con una dependencia caída (PD-189, antes PD-174). **[S-3]** `queue-metrics.collector.ts` sin prueba unitaria propia.

## DF y pendientes
- DF-29 sigue Abierto (I-2). Sin DF nuevos. `pendientes.md`: PD-165 a 169, 172, 173 y 189 abiertos (PD-174 pasó a PD-189 al integrar main); PD-170 y 171 cerrados. Excepción de tamaño del plan aceptada (aprobada 2026-11-03).
