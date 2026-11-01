# Revisión 021 — Optimizador de imágenes

> Una página. La escribe `reviewer`; la aprueba Adrián. Se respeta la spec, el plan y las tareas tal como están (T-09 abierta).

| Campo | Valor |
|---|---|
| Fecha | 2026-11-01 |
| Rango revisado | `977d3ba..d43e63a` (base = merge-base con main; 31 commits, 196 archivos; PR #77) |
| CI | ⏳ `lint`, `typecheck` y `unit` ✅ en `d43e63a`; `integration` en curso al revisar (run 41267434636). Las otras puertas (`isolation`) no figuran como check separado |
| Veredicto | ✅ Aprobar (sin bloqueantes), sujeto a CI de integración en verde y a la acreditación de T-09 antes de cerrar la spec |

**Ejecutado aquí** (Node 22, `pnpm install --frozen-lockfile`): `pnpm lint` ✅ (ESLint 0 avisos + Prettier), `pnpm typecheck` ✅, `pnpm test` ✅ (config 255, contracts 632, api 3175 en 321 suites, web 2113 en 227). **No se pudo correr** `pnpm test:int` ni `pnpm test:isolation`: no hay daemon Docker para Testcontainers. Los resultados que declara la spec (integración 45–48/48, aislamiento optimizer 21/21) **no están reproducidos aquí**; dependen del CI. El fallo preexistente de Windows en `billing-renewal.iso-spec.ts:322` no aparece en Linux y no es de esta spec.

## Verificación
| CA | Prueba (archivo › nombre) | Estado |
|---|---|---|
| CA-1, 2 | `optimization-runner.spec.ts` › CA-1/CA-2; `test/int/optimizer/estimate-worker.int-spec.ts`; `optimization-card.spec.tsx` | ✅ |
| CA-3, 4 | `optimization.service.spec.ts` › CA-3/CA-4; `test/int/optimizer/estimate.int-spec.ts`; `versions-optimizer-facade.int-spec.ts` | ✅ |
| CA-5 | `image.optimizer.spec.ts`, `optimization-job.spec.ts`, `estimate.int-spec.ts` (bytes) y `estimate-worker.int-spec.ts` (píxeles, animada) | ✅ |
| CA-6 | `run.int-spec.ts`; `use-file-optimization.spec.tsx` (consulta, detención, relectura) | ✅ |
| CA-7, 8 | `run.int-spec.ts`; `image-integrity.validator.spec.ts`; `image.optimizer.spec.ts` (orientación, ICC, alfa, PNG idéntico) | ✅ |
| CA-9, 10, 11 | `optimization-runner-run.spec.ts`; `optimized-version.registrar.spec.ts`; `run.int-spec.ts` | ✅ |
| CA-12 | `optimized-version.registrar.spec.ts` (`duplicate`), `optimization.service.spec.ts`, `run.int-spec.ts` (doble clic) | ✅ |
| CA-13 | `optimization-card.spec.tsx` › CA-13 (aviso de poda y sin poda) | ✅ (solo UI, correcto: la poda es de 014) |
| CA-14 | `optimization.processor.spec.ts` (`giveUp`); `estimate-worker.int-spec.ts`; `worker-optimizer-health.int-spec.ts` | ✅ |
| CA-15, 16 | `versions-optimizer-facade.int-spec.ts`; `run.int-spec.ts`; `version-timeline.spec.tsx`; `file-detail-optimization.spec.tsx` | ✅ |
| CA-17, 18 | `estimate.int-spec.ts`; `subscription-expiry.int-spec.ts`; `optimization.service.spec.ts` | ✅ |
| CA-19, 20 | `test/isolation/optimizer.iso-spec.ts`; `optimizer-routes.contract.spec.ts` | ✅ (no reproducida aquí) |
| CA-21 | `test/int/optimizer/logs-and-audit.int-spec.ts`; `optimizer-audit.contract.spec.ts` | ✅ (int no reproducida) |
| CA-22 | `optimization-card.spec.tsx` › `CA-22: RTL + axe a 360/1440 px` | ⚠️ ver I-1 |

## Seguridad
- Datos de cliente: sí. Aislamiento: `optimizer.iso-spec.ts` (B→A `404` idéntico, internos `403`, sin token `401`); no reproducida aquí. `actor` en `OptimizationService` y en el `Runner` (`createActor(ownerId, CLIENT)`); archivo vía `OptimizableFileGateway` con `findAccessibleById` dentro de `withActor`; RLS en `optimizacion` solo para el dueño (`nimbo_actor_role()='CLIENT'` + `propietario_id = nimbo_actor_id()`), `FORCE` y sin política para internos: ✅. `:fileId` no UUID → mismo `404` (sin oráculo): ✅.
- Bitácoras y auditoría: solo UUID, bytes, motivo y `correlationId`; sin nombre, clave de objeto, URL ni ruta (`optimization-audit.ts`, `logOutcome`; el registrador no registra la clave): ✅. Sin clave de LLM involucrada. `sharp` con `limitInputPixels`, `timeout` y `concurrency(1)`, en `worker-optimizer` aislado (ADR-0038), entorno mínimo de 17 claves, rol `nimbo_app`: ✅. `sharp` tiene ADR-0037 aceptado; `synchronize` no se toca; bytes `bigint` (`bigint` en columnas y dominio; `Number()` solo en la vista/ bitácora, tamaño ≤ 40 MB); migración con `down` simétrico: ✅.
- **[SEC-1]** Baja · `optimization-runner.ts` (`ownerOf`) · el `worker` actúa como el `ownerId` que viene en el trabajo de Redis; la RLS y la fachada lo acotan al dueño real del archivo, igual que 019. Sin acción; basta tenerlo presente. No amerita `security-auditor` adicional: el aislamiento ya tiene su suite (T-06).

## UI
- Tarjeta de 8 estados, diálogo de confirmación con poda, marca «Original conservado hasta … · no ocupa tu espacio» en el historial; mensajes coinciden con spec §6. Sin hex ni valores arbitrarios nuevos (los `[3px]` y `/12` de `version-timeline.tsx` son preexistentes); `motion-reduce`, `progressbar` con nombre, foco estable en el botón: ✅. Mockup `storage/ficha-archivo/` con 14 estados y 28 capturas; los espacios finales de `ficha-archivo--optimizar-*.html` ya se quitaron (`9ed788f`, verificado: 0 restantes). Estados de carga/error/vacío: ✅.

## Bloqueantes
- Ninguno.

## Importantes y sugerencias
- **[I-1]** `optimization-card.spec.tsx:320` — el «axe a 360/1440 px» solo cambia `window.innerWidth` en jsdom: no hay layout ni cálculo de contraste, así que la evidencia responsiva real de CA-22 son las capturas/axe del mockup (PD-156), no la prueba. Renombrar el `describe` («axe estructural») y dejar la comprobación visual para T-09/`023`, o declarar la limitación en el plan.
- **[I-2]** T-09 (humana, descenso visual del medidor) sigue `[ ]`; tras la regresión del 2026-10-29 falta repetir el recorrido. Adrián autorizó revisar con ella abierta; la spec no puede pasar a Hecha sin acreditarla (nota en el PR).
- **[I-3]** `optimization.service.ts:63` (11 dependencias), `optimization-runner.ts:60` (9) y `optimized-version.registrar.ts` (10): superan el máximo de 3 parámetros (Art. VII.2) aunque es inyección y sigue el patrón de `EditedVersionRegistrar`. `OptimizationService` mezcla tasa, caducidad con auditoría/bitácora y flujo; extraer `latestFresh`/`expireLatest` a un colaborador bajaría la razón de cambio (SOLID, Art. IV). No bloquea.
- **[S-1]** `optimization-card.tsx` `ConservationNote`: dice «se conserva N días»; la spec §6 pide «hasta el {fecha}» (el diálogo sí lo hace). Unificar con `dayLabel`.

## DF y pendientes
- DF-87 y DF-88 (ADR-0038) registrados; DF-21 aceptado; DF-22 sigue abierto para 022b. ADR-0037 y ADR-0038 aceptados; PD-124 reformulado (fuera de 021).
- Pendientes nuevos en `pendientes.md`: PD-157 (redibujar arquitectura), PD-158, PD-160, PD-161 (CI no construye la imagen del worker), PD-162, PD-163; PD-128 y PD-159 cerrados. Falta: **acreditar T-09** y **CI `integration` en verde** (el CI estuvo detenido por límite de gasto de Actions; ahora corre). Registrar I-1 si se acepta como deuda.
