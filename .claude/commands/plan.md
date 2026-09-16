---
description: Redacta el plan técnico de una spec aclarada y obtiene la aprobación de arquitectura
argument-hint: <NNN>
---

Spec: $ARGUMENTS

1. Abre `specs/$ARGUMENTS-*/spec.md`. Si su estado no es `Aclarada` o tiene preguntas `[ABIERTA]` bloqueantes, detente y lístalas.
2. Delega en `planner` en **Modo 2 — Planificar** para producir `plan.md`.
3. Delega en `architect` para revisar el plan y completar «Aprobación de arquitectura». Si requiere ADR, que lo redacte en estado `Propuesto`.
4. Si el veredicto es `Aprobado con cambios`, pide al `planner` que aplique los cambios y vuelve a pasar por `architect` (máximo 2 ciclos; si no converge, detente y resume el desacuerdo para el equipo).
5. Resume al usuario: módulos afectados, migraciones, contratos, riesgos, ADRs y veredicto.
6. Indica que un integrante debe confirmar el plan; después: `/tasks $ARGUMENTS`.
