---
description: Implementa tareas de una spec planificada con pruebas primero
argument-hint: <NNN> [T-xx | T-xx..T-yy]
---

Argumentos: $ARGUMENTS  (primer valor = spec; resto = tareas opcionales)

1. Verifica que la spec esté `Lista` o `En curso`, que `plan.md` esté aprobado y que `tasks.md` exista. Si no, detente.
2. Trabaja en **una sola rama** `feat/NNN-slug` para toda la spec (dos como máximo: `api` y `web`). No abras ramas por tarea o bloque.
3. Si no se indicaron tareas, toma las siguientes pendientes cuyas dependencias estén completas.
4. Delega en `developer` con la lista exacta de tareas: rojo → verde → refactor, un commit por tarea, y pruebas
   según la estrategia del plan (por riesgo, `workflow.md` §4.5).
5. Si es la primera tarea, cambia el estado de la spec a `En curso`.
6. Cuando el developer termine:
   - muestra tareas completadas, commits, resultado de pruebas y desviaciones;
   - si reportó ambigüedad o cambio de alcance, **no continúes**: sugiere `/spec NNN <cambio>`;
   - si surgió un DF o un pendiente, confirma que quedó en `design-findings.md` o `pendientes.md`.
7. Si todas las tareas están `[x]`, sugiere `/review` con el número de spec.
