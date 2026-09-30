---
description: Crea o actualiza la spec (qué y por qué) de una funcionalidad de Nimbo
argument-hint: <descripción de la necesidad> | <NNN> <cambio a aplicar>
---

Necesidad o cambio: $ARGUMENTS

1. Delega en el subagente `planner` en **Modo 1 — Especificar** (≤ 150 líneas, sin detalles de implementación).
   - Si el argumento empieza con un número de spec existente, actualiza esa spec y registra el cambio en «Registro de cambios».
   - Si no, crea la siguiente spec libre en `specs/`.
2. Si el planner concluye que la necesidad no rastrea a ningún RF/RNF o está en «Fuera de alcance», no crees la spec: explícalo al usuario.
3. Muestra al usuario la ruta, los requisitos cubiertos, los CA en una línea cada uno y las preguntas `[ABIERTA]`,
   bloqueantes primero, numeradas para responderlas en un solo mensaje.
4. Siguiente paso: `/plan NNN` (el plan es obligatorio). La spec pasa a `Lista` cuando Adrián aprueba spec y plan.
