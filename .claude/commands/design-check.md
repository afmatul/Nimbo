---
description: Compara código, specs y diagramas, y actualiza el registro de hallazgos de diseño
argument-hint: [módulo | DF-xx | fase]
---

Alcance: $ARGUMENTS (vacío = todo el sistema)

1. Delega en `architect`:
   - lee `docs/sdd/design-model.md`, `docs/sdd/design-findings.md` y, si hace falta, los PDF de `docs/design/diagramas/`;
   - compara con el código (`apps/api/src/modules/**`, migraciones) y con los `plan.md` del alcance;
   - detecta: clases, puertos o tablas que existen en código y no en los diagramas (o al revés), firmas distintas, dependencias que rompen el DAG, tipos de columna que no cumplen `design-model.md` §5.
2. Para cada diferencia nueva, agrega un `DF-xx` con severidad y propuesta. Para los ya resueltos en código, cambia el estado a `Resuelto` e indica qué diagrama hay que redibujar.
3. Si el argumento es un `DF-xx` con decisión del equipo, registra la decisión, redacta el ADR si es estructural y actualiza `architecture.md` y `design-model.md`.
4. Resume al usuario: hallazgos nuevos, resueltos, bloqueantes para la siguiente entrega y la lista de diagramas a actualizar.
