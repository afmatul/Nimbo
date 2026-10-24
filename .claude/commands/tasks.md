---
description: Descompone un plan aprobado en pocas tareas verticales, ordenadas y trazables
argument-hint: <NNN>
---

Spec: $ARGUMENTS

1. Verifica que `spec.md` no tenga preguntas `[ABIERTA]` con `bloquea: sí` y que exista `plan.md`.
   El plan puede decir «Propuesto»: las tareas se escriben igual. Si falta la spec o el plan, detente.
2. Delega en `planner` en **Modo 3 — Descomponer** para producir `tasks.md` (plantilla `tasks-template.md`).
3. Comprueba tú mismo que:
   - hay entre 5 y 12 tareas, cada una vertical, de medio día a un día y de una línea (CA, prueba, depende de);
   - todo CA aparece en al menos una tarea;
   - hay una tarea de aislamiento si la spec toca datos de cliente;
   - no hay tareas de «cierre» ni más de una tarea humana (el recorrido de la demo);
   - los archivos no se repiten: viven en la tabla del plan.
   Si algo falla, pide al planner corregirlo.
4. Si el plan dice «Aprobado», cambia el estado de la spec a `Lista` (si no lo estaba) y actualiza su fila en
   `specs/README.md`. Si sigue «Propuesto», déjala en `Borrador`: falta el visto bueno de Adrián.
5. Siguiente paso: `/implement $ARGUMENTS` en la rama `feat/$ARGUMENTS-<slug>`, cuando el plan esté aprobado.
