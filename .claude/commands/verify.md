---
description: Opcional — adelanta la verificación de una spec contra sus criterios de aceptación antes de /review
argument-hint: <NNN>
---

Spec: $ARGUMENTS

Opcional: `/review` ya corre este mismo trabajo al cerrar la spec. Usa `/verify` solo para adelantar hallazgos
antes de que todas las tareas estén listas.

1. Delega en `tester` para completar pruebas faltantes, ejecutar las suites y escribir la sección «Verificación» de
   `specs/$ARGUMENTS-*/review.md` (créalo desde `docs/sdd/templates/review-template.md` si no existe).
2. Si la spec toca autenticación, sesiones, roles, archivos, comparticiones, enlaces, agente, soporte/administración o bitácoras,
   delega **en paralelo** en `security-auditor` para escribir pruebas ISO y la sección «Seguridad».
2b. Si la spec tiene interfaz (sección 9), delega **en paralelo** en `ui-designer` (Modo 3) para escribir la sección «UI».
3. Consolida:
   - ✅ todos → indica que se puede seguir con `/implement` o pasar a `/review` cuando todas las tareas estén `[x]`;
   - ❌ alguno → lista hallazgos priorizados (seguridad crítica primero, luego accesibilidad) y sugiere `/implement $ARGUMENTS` con tareas de corrección.
     Si las correcciones no están en `tasks.md`, agrégalas como `T-FIX-n` al final, trazadas al hallazgo.
