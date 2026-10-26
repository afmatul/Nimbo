# Guía rápida: cómo sale una spec en Nimbo

Una página para quien arranca su primera spec. El detalle está en `workflow.md`; las reglas que no se negocian, en
`constitution.md` y en las «Prohibiciones duras» de `CLAUDE.md`.

## Los pasos

| # | Qué haces | Comando | Resultado | Tiempo de referencia |
|---|---|---|---|---|
| 1 | Describes la necesidad | `/spec "…"` | `spec.md`, `plan.md` y `tasks.md` en `Borrador`. Spec ≤ 150, plan ≤ 250, 5–12 tareas de una línea | 2 h |
| 2 | **Adrián aprueba el resumen** (≤ 15 líneas) | — | plan «Aprobado» y spec en `Lista`. Si no objeta en el día, queda Aprobado | el mismo día |
| 3 | Implementas en **una** rama `feat/NNN-slug` | `/implement NNN` | un commit por tarea, pruebas primero | 1–3 días |
| 4 | Cierras | `/review NNN` | `review.md` de una página | 1 h |
| 5 | Abres el PR | — | CI verde → Adrián aprueba → squash merge → `Hecha` | — |

`/plan` y `/tasks` solo completan un artefacto que falte. Una carpeta que ya tiene `spec.md` no se reescribe.
Si un paso tarda más del doble, avisa a Adrián en vez de seguir.

## Lo que Adrián revisa en el resumen

- Los archivos que tocas son de **tu** módulo (`specs/README.md`); si necesitas otro módulo, se lo pides a su dueño o usas un puerto.
- Los servicios reciben `actor: Actor` y las consultas filtran con `accessibleNodes(actor)` o RLS.
- La migración es reversible y los tamaños son `bigint`.
- Hay prueba de aislamiento si tocas datos de un cliente.
- Las desviaciones de los diagramas están en `design-findings.md` y lo que queda fuera, en `pendientes.md`.

## Pruebas, por riesgo

Unitarias para reglas de dominio · una de integración por endpoint (feliz + error principal) · aislamiento si hay
datos de cliente · componentes web para los estados de la pantalla · E2E solo para los flujos de la demo.

## Ejemplo a imitar

`specs/006a-catalogo-y-limites/`: spec de 143 líneas, plan de 234 y 12 tareas en 28 líneas.
