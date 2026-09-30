# ADR-0023 — SDD express desde la Fase 2: plan obligatorio, artefactos cortos y un PR por spec

| Campo | Valor |
|---|---|
| Estado | Aceptado (2026-09-30, Adrián) |
| Fecha | 2026-09-30 |
| Decisores | Adrián (diseñador principal), con el cambio del Art. I.2 de la constitución |
| Specs relacionadas | todas desde la Fase 2; reemplaza a ADR-0009 |

## Contexto

ADR-0009 adoptó Crystal Clear + SDD para cuatro personas y diez semanas. Al cerrar la Fase 1 (30/09/2026) solo
habían trabajado dos personas y ninguna spec del hito quedó `Hecha`. La medición del repositorio muestra dónde se
fue el tiempo:

- Cada spec cargaba ~2.500 líneas de documentos antes del código (001: spec 658 + plan 1.098 + tareas 932) y de 56 a
  105 tareas de 0,5–1 h. 006a, con 12 tareas en 28 líneas, se hizo en una fracción del tiempo.
- El «Enfoque técnico» de la spec y el `plan.md` se duplicaban; el plan, «opcional», se escribió en todas las specs.
- Una spec se partía en hasta 6 PRs y ramas (005: PR-A…PR-F; 22 ramas locales vivas), con rebases en cadena.
- `/review` lanzaba cuatro agentes y producía revisiones de 100–425 líneas.
- Las pruebas eran el 65 % del código TS, con el mismo CA probado en varias capas.

Queda un mes para la entrega final, con ~20 specs y ahora cuatro personas (entran Abel y Juan Marcos), dos de ellas
sin contexto del código. El equipo considera el plan revisado antes del código una práctica valiosa y quiere
conservarlo, igual que `design-findings.md` y `pendientes.md`.

## Opciones consideradas

1. **SDD express: plan obligatorio y aprobado, todo lo demás acotado**
   - Pros: conserva la compuerta que más protege (saber qué se construye y cómo antes de codificar) y le da a los
     nuevos integrantes una revisión temprana; elimina la duplicación spec/plan; menos tareas, ramas y agentes.
   - Contras: la aprobación de planes y PRs se concentra en una persona (Adrián); los topes de longitud obligan a
     resumir y pueden dejar huecos que aparezcan al implementar.
2. **Plan opcional, solo spec y tareas** (propuesta inicial del análisis)
   - Pros: el camino más corto por spec.
   - Contras: los nuevos integrantes codificarían sin revisión del cómo; el equipo lo rechazó.
3. **Mantener ADR-0009 sin cambios**
   - Contras: al ritmo medido no caben las specs restantes en el plazo.

## Decisión

Opción 1. Reglas (detalle en `docs/sdd/workflow.md` §1–5 y `docs/sdd/guia-rapida.md`):

- Flujo: `/spec` → `/plan` → **aprobación de Adrián** → `/tasks` → `/implement` → `/review` → PR con CI verde →
  aprobación de Adrián → squash merge. `architect` solo opina antes si el plan agrega un puerto entre módulos, una
  tecnología nueva o cambia la arquitectura.
- Artefactos: spec ≤ 150 líneas (qué y por qué, sin enfoque técnico), plan obligatorio ≤ 250 líneas (archivos,
  contratos, datos, pruebas y riesgos, sin el código en prosa), 5–12 tareas verticales de medio día a un día,
  `review.md` de una página. Sin tareas de «cierre». Se elimina `/verify`.
- Una spec = una rama = un PR (dos como máximo, `api` y `web`), rama de ≤ 3 días, merge por *squash*.
- Pruebas por riesgo, manteniendo el Art. III: unitarias para reglas, una de integración por endpoint (feliz + error
  principal), aislamiento siempre que haya datos de cliente, componentes para los estados de UI, E2E solo para los
  flujos de la demo.
- Revisión en una pasada del `reviewer`; `security-auditor` solo en 011, 012, 013, 020 o por riesgo marcado.
- `design-findings.md` y `pendientes.md` se actualizan en el mismo PR que descubre la desviación o el pendiente.
- Un módulo, un dueño, de punta a punta (`specs/README.md`); Adrián aprueba planes y PRs del equipo y los suyos
  siguen la autoaprobación de `workflow.md` §7.1.
- La constitución cambia solo en el Art. I.2 (el plan pasa a ser obligatorio). Se mantiene el resto de ADR-0009:
  trunk-based, Conventional Commits en español, entregas por fase y comunicación osmótica.

## Consecuencias

- Positivas: la documentación por spec baja a ~400 líneas; los nuevos integrantes tienen una compuerta clara y un
  ejemplo (006a); menos ramas y rebases; el revisor humano ve un plan corto y un PR por spec.
- Negativas / deuda aceptada: Adrián es cuello de botella de aprobación (mitigado: Claude prepara el resumen de cada
  plan y PR); menos pruebas redundantes, compensado con aislamiento obligatorio y CI como compuerta.
- Cómo sabremos si fue un error: si una spec de la Fase 2 pasa de 3 días de implementación por falta de detalle en
  el plan, si aparecen fallos de aislamiento que una prueba omitida habría detectado, o si los planes esperan más de
  un día la aprobación.
