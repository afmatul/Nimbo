# Revisión 022d — Grupos de los módulos en el tablero de operación

> Una página. La escribe `reviewer` (sin `security-auditor`: no toca datos de cliente) y la aprueba Adrián.

| Campo | Valor |
|---|---|
| Fecha | 2026-11-10 |
| Rango revisado | `origin/main (409c5f7)..feat/022d-tableros-de-modulos (c144c25)`, PR #106 (borrador), 16 commits |
| CI | Sin ejecuciones registradas en `c144c25` (PR en borrador). Local: `pnpm lint` ✅ · `pnpm typecheck` ✅ · `pnpm test` ✅ (api 3329, contracts 663, config 255, web 2314; la web falló primero por un `dist` viejo de `packages/contracts`, ajeno a la rama, y pasó al recompilarlo) · `npx jest scripts --forceExit` ✅ 133/133 · `pnpm test:int`: no ejecutable localmente (sin demonio Docker); se toma del CI del PR #106 · `pnpm test:isolation`: no aplica (spec §5) |
| Veredicto | ✅ Aprobar (sin bloqueantes; I-1, I-2, I-3 y S-2 resueltos antes de pasar el PR a «listo») |

## Verificación
| CA | Prueba (`scripts/observability.spec.ts › 022d`) + demo T-06 | Estado |
|---|---|---|
| CA-1 | `T-01 › CA-1:` diez rutas por `route, status`; login por `status`; `403` por `route` · evidencias 09-11, 15 | ✅ |
| CA-2 | `T-02 › CA-2:` cargas, enlaces `2..`, `429` por ruta; `R-2` (R-3 confirmado, captura 13) | ✅ |
| CA-7 | `T-03 › CA-7:` completados, fallidos por intento, p95 y profundidad por estado | ⚠️ Parcial (decisión de Adrián: sin clave de Gemini, plan R-6) |
| CA-8 | `T-03 › CA-8:` solicitudes por código y señales de la cola `optimization` | ✅ |
| CA-11 | `T-04 › CA-11:` consultas/min, p50 y p95, proporción con `or vector(0)`, sin desglose por plan | ⚠️ Parcial (ídem; el `429` probado es el de tasa) |
| CA-12 | `T-01 › CA-12:` etiquetas cerradas, rutas cruzadas con controladores, sin UUID ni `@` · registro 38 | ✅ |
| CA-14 | `T-05 › CA-14:` solo `operacion.json` + casos de 022 (`editable: false`, sin anónimo) · registro 37 | ✅ |
| CA-15 | `T-05 › CA-15:` cinco filas en orden; runbook nombra filas y paneles 16-35 · evidencia 02 | ✅ |
| R-4 / H-2 | `R-4: … 256, 768 y 128 MiB` y `022d H-2: … GOMEMLIMIT al 90 %` | ✅ |

## Seguridad
- Datos de cliente: no (solo Prometheus, RN-5). Aislamiento: no aplica. `actor`/`accessibleNodes`: no aplica (sin código en `apps/`).
- Paneles 16-35: solo `job, route, status, queue, state, attempts_made, le`; rutas por plantilla. Sin puertos, hosts ni tableros nuevos.
- Evidencias: sin UUID, correos, tokens ni contraseñas en `.txt`, README ni capturas revisadas (10, 31); canarios contados, no impresos. ✅

## UI
- No aplica: no toca `apps/web`; los paneles son de Grafana (spec §6).

## Bloqueantes
- Ninguno.

## Importantes y sugerencias
- **[I-1] ✅ resuelto** `plan.md:91` dice «sin cambios en `compose.yml`», pero `plan.md:31` y R-8 (`:138`) lo cambian por H-2; y `plan.md:19` y `specs/README.md:76` siguen diciendo «3 archivos». Viola: los artefactos no se contradicen (CLAUDE.md). Corrección: «sin cambios de acceso en `compose.yml` (solo memoria de Grafana, R-8)» y «3 archivos de autor + `compose.yml` y nota en ADR-0040 por H-2».
- **[I-2] ✅ resuelto** `evidencias/t06/README.md` quedó con el estado previo a la decisión: `:7` («pendiente de la decisión de Matul», «T-06 sigue sin marcar»), `:247` («no se modificaron el runbook ni los límites versionados»), `:280` (H-2 «mitigado solo en local»), `:288` (H-9 runbook «cambio preparado»; `:314` dice que se corrigió) y `:308` (rama `feat/022d-metricas-de-modulos`; la real es `feat/022d-tableros-de-modulos`, PR #106). Corrección: actualizar esas filas o marcar el encabezado como «estado al 2026-11-08; ver Decisiones».
- **[I-3] ✅ resuelto (PD-204)** H-1, H-3, H-5 (4 casos de 022 en Windows), H-7, H-8 y H-10 quedan «sin decidir» sin fila en `pendientes.md`: se pierden al integrar. Corrección: una fila PD-204 (dueño Abel, línea de 022) que los liste con «cambio preparado». Ninguno contradice un CA de 022d: H-7 es propio de `rate()` y H-8 es lectura del panel 25.
- **[S-1]** H-7 y H-8 tocan la lectura de paneles de 022d: sumar en runbook §8 que un evento aislado no eleva `rate()` y que «completados» de `indexing` incluye documentos en `fallido` (detalle en PD-200).
- **[S-2] ✅ resuelto** `spec.md:12`: «Última actualización» sigue en 2026-11-08; el registro de cambios llega al 2026-11-10.
- **[S-3]** Rama `feat/022d-tableros-de-modulos` frente a `feat/NNN-slug` (`conventions.md:64`; slug `metricas-de-modulos`). Sin acción si el PR ya está abierto; anotarlo en el PR.

## DF y pendientes
- DF-xx: ninguno nuevo (sin desviación de diagramas; DF-28 (e) y DF-29 siguen como en 022).
- Filas nuevas: PD-200, PD-201, PD-202 (renumeradas; sin referencias de 022d a números viejos salvo la evidencia 38, aclarada en el README `:238`) y PD-203 (staging de Grafana). Sin duplicados nuevos; los existentes (PD-51, PD-170 a PD-173, PD-188, PD-192) vienen de `main`.
- H-2 trazado: `compose.yml:211-217`, ADR-0040 (nota 2026-11-10; 8576 + 512 = 9088 MiB y 690/768 ≈ 90 % cuadran), plan R-8, spec registro de cambios, runbook §1, prueba R-4 y PD-203. Coherente.

## Lo que está bien hecho
- La prueba cruza cada ruta del tablero con los controladores del `api`: renombrar una ruta rompe CI en vez de dejar un panel en 0 (R-2), y el lector ya acepta `\` (H-5).
- Recorte honesto a solo tableros: lo que exige código va a PD-200 con su motivo, y los paneles 18, 21, 34 y 35 dicen sus límites en la descripción.
- Demo con evidencia verificable (consultas reales, canarios, límites declarados) y decisión de cierre parcial registrada en spec, tareas y README.
