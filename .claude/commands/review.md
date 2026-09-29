---
description: Cierra una spec — verificación, seguridad y UI (si aplican) y revisión, todo en un solo review.md
argument-hint: <NNN>
---

Spec: $ARGUMENTS

1. Verifica que todas las tareas de `tasks.md` estén `[x]`. Si no, lista las pendientes y detente.
2. Cambia el estado a `En revisión`.
3. Si la sección «Verificación» de `specs/$ARGUMENTS-*/review.md` no existe o no está en verde, delega en
   `tester` para completarla (crea el archivo desde `docs/sdd/templates/review-template.md` si no existe).
3b. Si la spec toca autenticación, sesiones, roles, archivos, comparticiones, enlaces, agente, soporte/administración
    o bitácoras y la sección «Seguridad» falta o no está en verde, delega **en paralelo** en `security-auditor`.
3c. Si la spec tiene interfaz (sección 9) y la sección «UI» falta o no está en verde, delega **en paralelo** en
    `ui-designer` (Modo 3).
4. Delega en `reviewer` sobre el rango `main...HEAD` de la rama actual, para que complete bloqueantes, importantes,
   sugerencias, checklist y veredicto final en el mismo `review.md` (sin tocar las secciones de verificación/seguridad/UI).
5. Si el veredicto es ✅:
   - genera el cuerpo del PR a partir de `.github/pull_request_template.md` con los datos de la spec y de `review.md`;
   - recuerda que la aprobación debe darla un integrante distinto del autor (salvo los PRs del diseñador principal, `docs/sdd/workflow.md` §7.1), y que tras el merge la spec pasa a `Hecha` cuando esté en staging (en la Fase 1: integrada y demostrable en local, §7.2).
6. Si es 🔁: lista los bloqueantes y agrégalos a `tasks.md` como `T-FIX-n`; sugiere `/implement $ARGUMENTS`.
