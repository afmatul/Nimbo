---
description: Crea o actualiza la spec (qué y por qué) de una funcionalidad de Nimbo
argument-hint: <descripción de la necesidad> | <NNN> <cambio a aplicar>
---

Necesidad o cambio: $ARGUMENTS

1. Delega en el subagente `planner` en **Modo 1 — Especificar**.
   - Si el argumento empieza con un número de spec existente, actualiza esa spec y registra el cambio en «Registro de cambios».
   - Si no, crea la siguiente spec libre en `specs/`.
2. Si el planner concluye que la necesidad no rastrea a ningún RF/RNF o está en «Fuera de alcance», no crees la spec: explícalo al usuario.
3. Muestra al usuario:
   - ruta de la spec, requisitos cubiertos y el resumen de «Enfoque técnico» (módulos, tablas, contratos, riesgos);
   - las preguntas `[ABIERTA]`, bloqueantes primero, numeradas para que pueda responderlas en un solo mensaje.
4. Recuérdale que la spec pasa a `Lista` solo cuando un integrante la aprueba (incluido el «Enfoque técnico»).
   Si es transversal, agrega un puerto entre módulos, tecnología nueva o cambia la arquitectura, el siguiente paso
   es `/plan NNN`; si no, `/tasks NNN` directo.
