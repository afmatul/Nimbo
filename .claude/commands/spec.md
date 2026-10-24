---
description: Crea o actualiza la spec (qué y por qué) de una funcionalidad de Nimbo y, si la carpeta es nueva, también el plan y las tareas
argument-hint: <descripción de la necesidad> | <NNN> <cambio a aplicar>
---

Necesidad o cambio: $ARGUMENTS

1. Si el argumento empieza con un número de spec que ya tiene carpeta, delega en `planner` en **Modo 1** solo para
   actualizar `spec.md` y el «Registro de cambios». No regeneres `plan.md` ni `tasks.md` salvo que el cambio de
   alcance lo exija, y no reescribas la carpeta para el formato de ADR-0033.
2. Si la carpeta no existe, delega en `planner` en **Modo 1, 2 y 3** en este mismo turno (≤ 150, ≤ 250, 5–12 tareas
   de una línea). Si el esbozo pasa de 12 archivos o de una pantalla, parte en dos specs antes de redactar.
3. Si el planner concluye que la necesidad no rastrea a ningún RF/RNF o está en «Fuera de alcance», no crees la spec: explícalo al usuario.
4. Muestra la ruta, los requisitos, los CA en una línea cada uno, los supuestos y las preguntas `[ABIERTA]` con
   `bloquea: sí` (solo si cambian el comportamiento o un RF/RNF).
5. Resume para Adrián, en ≤ 15 líneas: archivos y módulos, migraciones, contratos, pruebas de aislamiento, riesgos,
   DF y pendientes, y lo discutible. La spec sigue en `Borrador` hasta que anote «Aprobado» en el plan (si no objeta
   en el día, el dueño anota «Aprobado» con la fecha). Después: `/implement NNN`.
