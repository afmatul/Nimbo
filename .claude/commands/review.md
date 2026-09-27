---
description: Revisión de código de una spec contra spec, constitución y arquitectura
argument-hint: <NNN>
---

Spec: $ARGUMENTS

1. Confirma que existe `verification.md` (y `security.md` y `ui-review.md` si aplican). Si faltan o están en ❌, adviértelo; la revisión los marcará como bloqueantes.
2. Cambia el estado a `En revisión`.
3. Delega en `reviewer` sobre el rango `main...HEAD` de la rama actual.
4. Guarda el reporte que devuelva el reviewer en `specs/$ARGUMENTS-*/review.md` sin modificar su contenido.
5. Si el veredicto es ✅:
   - genera el cuerpo del PR a partir de `.github/pull_request_template.md` con los datos de la spec, verificación y revisión;
   - recuerda que la aprobación debe darla un integrante distinto del autor (salvo los PRs del diseñador principal, `docs/sdd/workflow.md` §7.1), y que tras el merge la spec pasa a `Hecha` cuando esté en staging (en la Fase 1: integrada y demostrable en local, §7.2).
6. Si es 🔁: lista los bloqueantes y agrégalos a `tasks.md` como `T-FIX-n`; sugiere `/implement $ARGUMENTS`.
