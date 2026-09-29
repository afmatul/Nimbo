---
description: Muestra el estado del backlog de specs y lo que sigue por integrante
argument-hint: [fase]
---

Filtro opcional de fase: $ARGUMENTS

1. Lee `specs/README.md` y el encabezado (tabla de metadatos) de cada `specs/*/spec.md`.
2. Para cada spec calcula: estado, dueño, tareas completadas/total (de `tasks.md`), veredictos de verificación,
   seguridad y UI (secciones de `review.md`) y veredicto final de revisión.
3. Si el estado declarado no coincide con la evidencia (p. ej. `Hecha` sin `review.md` ✅), márcalo como inconsistencia.
4. Presenta:
   - tabla por fase con avance real vs. el hito del curso (30 % / 50 % / 80 %) y fecha límite de `CLAUDE.md`;
   - specs bloqueadas y por qué;
   - siguiente acción concreta por integrante;
   - riesgos para la próxima entrega.
5. No modifiques archivos salvo que el usuario lo pida; si lo pide, sincroniza `specs/README.md` con la evidencia.
