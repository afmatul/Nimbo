# Guía rápida: cómo sale una spec en Nimbo

Una página para quien arranca su primera spec. El detalle está en `workflow.md`; las reglas que no se negocian, en
`constitution.md` y en las «Prohibiciones duras» de `CLAUDE.md`.

## Los pasos

| # | Qué haces | Comando | Resultado | Tiempo de referencia |
|---|---|---|---|---|
| 1 | Describes la necesidad | `/spec "…"` | `spec.md` en `Borrador`, ≤ 150 líneas | 1 h |
| 2 | Respondes las preguntas `[ABIERTA]` | — | spec sin bloqueantes | — |
| 3 | Pides el plan | `/plan NNN` | `plan.md`, ≤ 250 líneas | 2 h |
| 4 | **Adrián aprueba spec y plan** | — | spec en `Lista` | 30 min |
| 5 | Pides las tareas | `/tasks NNN` | `tasks.md`, 5–12 tareas verticales | 30 min |
| 6 | Implementas en **una** rama `feat/NNN-slug` | `/implement NNN` | un commit por tarea, pruebas primero | 1–3 días |
| 7 | Cierras | `/review NNN` | `review.md` de una página | 1 h |
| 8 | Abres el PR | — | CI verde → Adrián aprueba → squash merge → `Hecha` | — |

Si un paso tarda más del doble, avisa a Adrián en vez de seguir.

## Lo que Adrián revisa en tu plan

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
