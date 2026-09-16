---
description: Verifica una spec implementada contra sus criterios de aceptación y su seguridad
argument-hint: <NNN>
---

Spec: $ARGUMENTS

1. Verifica que todas las tareas de `tasks.md` estén `[x]`. Si no, lista las pendientes y detente.
2. Cambia el estado a `En verificación`.
3. Delega en `tester` para completar pruebas faltantes, ejecutar las suites y escribir `verification.md`.
4. Si la spec toca autenticación, sesiones, roles, archivos, comparticiones, enlaces, agente, soporte/administración o bitácoras,
   delega **en paralelo** en `security-auditor` para escribir pruebas ISO y `security.md`.
4b. Si la spec tiene interfaz (sección 9), delega **en paralelo** en `ui-designer` (Modo 3) para escribir `ui-review.md`.
5. Consolida:
   - ✅ todos → sugiere `/review $ARGUMENTS`;
   - ❌ alguno → lista hallazgos priorizados (seguridad crítica primero, luego accesibilidad) y sugiere `/implement $ARGUMENTS` con tareas de corrección.
     Si las correcciones no están en `tasks.md`, agrégalas como `T-FIX-n` al final, trazadas al hallazgo.
