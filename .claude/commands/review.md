---
description: Cierra una spec — una sola pasada de revisión con verificación y seguridad en un review.md de una página
argument-hint: <NNN>
---

Spec: $ARGUMENTS

1. Verifica que todas las tareas de `tasks.md` estén `[x]`. Si no, lista las pendientes y detente.
2. Cambia el estado a `En revisión`.
3. Delega en `reviewer` sobre `main...HEAD` de la rama de la spec. Escribe `review.md` (plantilla
   `docs/sdd/templates/review-template.md`, una página): verificación CA → prueba, seguridad, UI si aplica,
   bloqueantes, DF y pendientes. Corre `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:int` y, si la spec
   toca datos de cliente, `pnpm test:isolation` (o toma el resultado del CI cuando exista).
4. Solo en specs de compartición, enlaces públicos, administración/soporte o el agente (011, 012, 013, 020), o si el
   reviewer marca un riesgo de seguridad, delega **en paralelo** en `security-auditor` para la sección «Seguridad».
5. Si el veredicto es ✅, genera el cuerpo del PR desde `.github/pull_request_template.md` y recuerda que lo aprueba
   Adrián (sus PRs: `workflow.md` §7.1). Tras el squash merge, la spec pasa a `Hecha`.
6. Si es 🔁, agrega los bloqueantes a `tasks.md` como `T-FIX-n` y sugiere `/implement $ARGUMENTS`.
