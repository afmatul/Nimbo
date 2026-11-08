# Tareas 022d — Grupos de los módulos en el tablero de operación

> Spec: `./spec.md` · Plan: `./plan.md` (Aprobado 2026-11-08)
> 5 a 12 tareas verticales, un commit cada una (`feat(infra): … [022d T-xx]`). Cada tarea es una línea: criterio,
> prueba y de qué depende. Los archivos viven en `plan.md`. Sin tareas de «cierre». Esfuerzo ≈ 1 día-persona en total:
> las tareas son más cortas que medio día porque cada una es un grupo del tablero con su prueba.

- [x] **T-01** Ayudantes de la prueba (paneles por fila, etiquetas usadas, rutas declaradas por los controladores) y grupo «Identidad» (paneles 16 a 19) (0,3 d) — CA: CA-1, CA-12 — Prueba: casos de CA-1 y de CA-12 en `scripts/observability.spec.ts`, en rojo primero; la aserción de rutas, también en rojo con una ruta inventada — Depende: 022 (PR #78) integrada en `main`, plan aprobado
- [x] **T-02** Grupo «Almacenamiento»: cargas por ruta y código, enlaces de descarga y `429` por ruta (paneles 20 a 23) (0,1 d) — CA: CA-2, CA-12 — Prueba: casos de CA-2 en rojo primero; CA-12 los cubre sin cambios — Depende: T-01
- [x] **T-03** Grupos «Indexación» y «Optimizador»: colas `indexing`, `index-reconcile` y `optimization` y solicitudes de estimar y optimizar (paneles 24 a 31) (0,15 d) — CA: CA-7, CA-8 — Prueba: casos de CA-7 y CA-8 en rojo primero — Depende: T-01
- [x] **T-04** Grupo «Agente»: consultas por minuto, p50 y p95 y proporción de error de `POST /api/v1/agent/ask` (paneles 32 a 35) (0,1 d) — CA: CA-11 — Prueba: casos de CA-11 en rojo primero — Depende: T-01
- [x] **T-05** Runbook (§4 tráfico por grupo, §5 paneles 16 a 35, §8 límites S-1 a S-4) y un solo tablero aprovisionado (0,1 d) — CA: CA-14, CA-15 (estático) — Prueba: casos «solo `operacion.json` en `dashboards/`» y «el runbook nombra las cinco filas», en rojo primero — Depende: T-02, T-03, T-04
- [ ] **T-06** **(humana)** Demo en local desde volúmenes vacíos: tráfico del runbook (inicios de sesión fallidos hasta el `429`, una carga completa y una rechazada, una descarga, una optimización, preguntas al agente), recorrer los cinco grupos con el Operador, comprobar que un anónimo no entra y que el *Viewer* ve y no guarda; confirmar la etiqueta real de `POST /api/v1/uploads` (plan R-3); capturas y hora en el PR (0,25 d) — CA: CA-1, CA-2, CA-7, CA-8, CA-11, CA-14, CA-15 — Depende: T-05

## Notas del developer

- **T-01** (2026-11-08) Rojo: 6 casos nuevos de CA-1 y CA-12 fallaban por la fila «Identidad» ausente (sin consultas de
  grupo ni rutas citadas); la aserción de rutas, también en rojo con `POST /api/v1/auth/verificar-inventada` en una copia
  local del tablero (sin commitear). Verde: fila 16 y paneles 17 a 19. Se agregó un caso de R-2 que fija el lector de
  controladores (ruta sin barra final y plantillas con parámetros). R-3 deducido del código: Nest arma la ruta con
  `stripEndSlash` (`route-path-factory`), así que `@Post()` de `uploads` emite `POST /api/v1/uploads`; T-06 lo confirma.
- **T-02** (2026-11-08) Rojo: 3 casos de CA-2 fallaban por la fila «Almacenamiento» ausente. Verde: fila 20 y paneles
  21 a 23; CA-12 los cubre sin cambios (79/79 en `observability.spec.ts`).
- **T-03** (2026-11-08) Rojo: 4 casos de CA-7 y CA-8 fallaban por las filas ausentes. Verde: filas 24 y 28 y paneles
  25 a 27 y 29 a 31 (83/83). Los nombres de las colas salen de `INDEXING_QUEUE`, `INDEX_RECONCILE_QUEUE` y
  `OPTIMIZATION_QUEUE` del `api`.
- **T-04** (2026-11-08) Rojo: 4 casos de CA-11 fallaban por la fila «Agente» ausente. Verde: fila 32 y paneles 33 a 35
  (87/87). Caso extra: el grupo solo usa `job`, `route`, `status` y `le` (sin desglose por plan, PD-202). Las
  descripciones de 34 y 35 dicen la saturación en 10 s y los errores dentro del flujo (S-4, R-4, R-5).
- **T-05** (2026-11-08) Rojo: «el runbook nombra las cinco filas y los paneles 16 a 35» fallaba; «solo `operacion.json`
  en `dashboards/`» y «cinco filas en orden» ya pasaban con T-01 a T-04, así que el primero se comprobó en rojo con un
  `otro.json` temporal (borrado, sin commitear). Verde: runbook §4 (tráfico por grupo; curl de inicios de sesión
  fallidos hasta el `429`; web para cargas, descargas, optimización y agente; qué pasa sin clave de Gemini o sin
  corpus), §5 (paneles 16 a 35) y §8 (S-1 a S-4 y R-2). 90/90 en `observability.spec.ts`; 131/131 en el Jest raíz.
  Desviación menor: la prueba exige además las cinco filas en orden en el tablero (CA-15 estático), sin cambiar el plan.
