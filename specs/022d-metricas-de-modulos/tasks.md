# Tareas 022d — Grupos de los módulos en el tablero de operación

> Spec: `./spec.md` · Plan: `./plan.md` (Aprobado 2026-11-08)
> 5 a 12 tareas verticales, un commit cada una (`feat(infra): … [022d T-xx]`). Cada tarea es una línea: criterio,
> prueba y de qué depende. Los archivos viven en `plan.md`. Sin tareas de «cierre». Esfuerzo ≈ 1 día-persona en total:
> las tareas son más cortas que medio día porque cada una es un grupo del tablero con su prueba.

- [ ] **T-01** Ayudantes de la prueba (paneles por fila, etiquetas usadas, rutas declaradas por los controladores) y grupo «Identidad» (paneles 16 a 19) (0,3 d) — CA: CA-1, CA-12 — Prueba: casos de CA-1 y de CA-12 en `scripts/observability.spec.ts`, en rojo primero; la aserción de rutas, también en rojo con una ruta inventada — Depende: 022 (PR #78) integrada en `main`, plan aprobado
- [ ] **T-02** Grupo «Almacenamiento»: cargas por ruta y código, enlaces de descarga y `429` por ruta (paneles 20 a 23) (0,1 d) — CA: CA-2, CA-12 — Prueba: casos de CA-2 en rojo primero; CA-12 los cubre sin cambios — Depende: T-01
- [ ] **T-03** Grupos «Indexación» y «Optimizador»: colas `indexing`, `index-reconcile` y `optimization` y solicitudes de estimar y optimizar (paneles 24 a 31) (0,15 d) — CA: CA-7, CA-8 — Prueba: casos de CA-7 y CA-8 en rojo primero — Depende: T-01
- [ ] **T-04** Grupo «Agente»: consultas por minuto, p50 y p95 y proporción de error de `POST /api/v1/agent/ask` (paneles 32 a 35) (0,1 d) — CA: CA-11 — Prueba: casos de CA-11 en rojo primero — Depende: T-01
- [ ] **T-05** Runbook (§4 tráfico por grupo, §5 paneles 16 a 35, §8 límites S-1 a S-4) y un solo tablero aprovisionado (0,1 d) — CA: CA-14, CA-15 (estático) — Prueba: casos «solo `operacion.json` en `dashboards/`» y «el runbook nombra las cinco filas», en rojo primero — Depende: T-02, T-03, T-04
- [ ] **T-06** **(humana)** Demo en local desde volúmenes vacíos: tráfico del runbook (inicios de sesión fallidos hasta el `429`, una carga completa y una rechazada, una descarga, una optimización, preguntas al agente), recorrer los cinco grupos con el Operador, comprobar que un anónimo no entra y que el *Viewer* ve y no guarda; confirmar la etiqueta real de `POST /api/v1/uploads` (plan R-3); capturas y hora en el PR (0,25 d) — CA: CA-1, CA-2, CA-7, CA-8, CA-11, CA-14, CA-15 — Depende: T-05

## Notas del developer
