---
description: Redacta el plan técnico (obligatorio) de una spec y lo prepara para la aprobación de Adrián
argument-hint: <NNN>
---

Spec: $ARGUMENTS

1. Abre `specs/$ARGUMENTS-*/spec.md`. Si tiene una pregunta `[ABIERTA]` con `bloquea: sí`, detente y lístala.
   Un supuesto o una pregunta con `bloquea: no` no detienen el plan.
2. Delega en `planner` en **Modo 2 — Planificar** para producir `plan.md` (≤ 250 líneas, plantilla
   `docs/sdd/templates/plan-template.md`). Si `tasks.md` no existe, sigue con el **Modo 3** en este turno.
3. Solo si el plan agrega un puerto entre módulos, una tecnología nueva o cambia la arquitectura, delega en
   `architect` para su veredicto en «Aprobación» (máximo 2 ciclos con el planner; si no converge, resume el
   desacuerdo). Si requiere ADR, que lo redacte en estado `Propuesto`.
4. Resume para Adrián, en ≤ 15 líneas: archivos y módulos, migraciones, contratos, pruebas de aislamiento, riesgos,
   DF y pendientes que toca, y lo que te parezca discutible.
5. La spec pasa a `Lista` cuando Adrián anota «Aprobado» en el plan (o cuando pasa el día sin objeción y el dueño
   lo anota). Después: `/implement $ARGUMENTS`.
