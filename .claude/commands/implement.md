---
description: Implementa tareas de una spec planificada con pruebas primero
argument-hint: <NNN> [T-xx | T-xx..T-yy]
---

Argumentos: $ARGUMENTS  (primer valor = spec; resto = tareas opcionales)

1. Verifica que la spec esté `Planificada` o `En implementación` y que el plan esté aprobado. Si no, detente.
   Si no existe `package.json` raíz y la spec no es la 000, detente: «bloqueado por 000».
2. Si no se indicaron tareas, selecciona la siguiente tarea pendiente cuyas dependencias estén completas (máximo un bloque por invocación).
3. Delega en `developer` con la lista exacta de tareas. Recuérdale el ciclo rojo → verde → refactor y un commit por tarea.
4. Si es la primera tarea, cambia el estado de la spec a `En implementación`.
5. Cuando el developer termine:
   - muestra tareas completadas, commits, resultado de pruebas y desviaciones;
   - si reportó ambigüedad o cambio de alcance, **no continúes**: sugiere `/spec NNN <cambio>`;
   - si reportó necesidad de cambio arquitectónico, sugiere consultar a `architect`.
6. Si todas las tareas están `[x]`, sugiere `/verify` con el número de spec.
