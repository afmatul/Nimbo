---
description: Descompone un plan aprobado en tareas pequeñas, ordenadas y trazables
argument-hint: <NNN>
---

Spec: $ARGUMENTS

1. Verifica que `specs/$ARGUMENTS-*/spec.md` esté aprobada (sin preguntas `[ABIERTA]` bloqueantes). Si existe
   `plan.md`, verifica que tenga «Aprobación de arquitectura» con veredicto `Aprobado`. Si algo falta, detente.
2. Delega en `planner` en **Modo 3 — Descomponer** para producir `tasks.md`.
3. Comprueba tú mismo que:
   - todo CA de la spec aparece en al menos una tarea (no hace falta una matriz aparte, basta revisarlo);
   - hay tareas de aislamiento si la spec toca datos de cliente, y de métricas/bitácoras y documentación;
   - ninguna tarea supera ~4 h.
   Si algo falta, pide al planner corregirlo.
4. Cambia el estado de la spec a `Lista` (si no lo estaba ya) y actualiza `specs/README.md`.
5. Muestra al usuario el resumen de bloques, las tareas que se pueden repartir entre integrantes y el comando siguiente: `/implement $ARGUMENTS`.
