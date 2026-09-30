---
description: Descompone un plan aprobado en pocas tareas verticales, ordenadas y trazables
argument-hint: <NNN>
---

Spec: $ARGUMENTS

1. Verifica que `spec.md` no tenga preguntas `[ABIERTA]` bloqueantes y que `plan.md` diga «Aprobado» por Adrián.
   Si algo falta, detente.
2. Delega en `planner` en **Modo 3 — Descomponer** para producir `tasks.md` (plantilla `tasks-template.md`).
3. Comprueba tú mismo que:
   - hay entre 5 y 12 tareas, cada una vertical y de medio día a un día;
   - todo CA aparece en al menos una tarea;
   - hay una tarea de aislamiento si la spec toca datos de cliente;
   - no hay tareas de «cierre» ni más de una tarea humana (el recorrido de la demo).
   Si algo falla, pide al planner corregirlo.
4. Cambia el estado de la spec a `Lista` (si no lo estaba) y actualiza su fila en `specs/README.md`.
5. Siguiente paso: `/implement $ARGUMENTS` en la rama `feat/$ARGUMENTS-<slug>`.
