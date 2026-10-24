# ADR-0034 — SDD express en un pase: spec, plan y tareas juntos

| Campo | Valor |
|---|---|
| Estado | Propuesto |
| Fecha | 2026-10-23 |
| Decisores | Adrián (diseñador principal) |
| Specs relacionadas | las que todavía no tienen carpeta; enmienda la secuencia de ADR-0023 |

## Contexto

ADR-0023 fijó artefactos cortos y el plan aprobado antes del código. La secuencia siguió en tres
comandos (`/spec`, `/plan`, `/tasks`) y Adrián releía el plan completo. Medido contra el techo de
~400 líneas, 001–003 y 005 siguen en 1.700–2.700 líneas; 006a, 007 y 014 caben. Las carpetas que ya
existen, en `main` o en una rama, tienen plan aprobado o código en curso.

El Art. I.2 se mantiene: la spec dice qué y por qué, el plan cómo, las tareas en qué orden, y el
plan se aprueba antes del código.

## Opciones consideradas

1. **Un pase para las specs nuevas, sin tocar las carpetas existentes**
   - Pros: quita dos esperas; Adrián lee el resumen de ≤ 15 líneas; el trabajo en curso no se reabre.
   - Contras: el mismo cuello de botella, ahora con plazo de un día.
2. **Reescribir las specs ya escritas al formato corto**
   - Contras: gasta el tiempo que se quiere ahorrar y mueve planes ya aprobados.
3. **Dejar la secuencia de ADR-0023**
   - Contras: cada spec nueva vuelve a pagar tres sesiones antes del código.

## Decisión

Opción 1. Detalle en `docs/sdd/workflow.md` y `docs/sdd/guia-rapida.md`.

- `/spec` escribe `spec.md`, `plan.md` y `tasks.md` en una pasada. `/plan` y `/tasks` solo completan un artefacto que falte.
- Adrián aprueba el resumen de ≤ 15 líneas. Si no objeta en el día, el dueño anota «Aprobado» en el plan con esa fecha.
- Bloquea solo una pregunta que cambie el comportamiento observable o un RF/RNF. Lo demás va a «Supuestos».
- Cada tarea es una línea: criterio, prueba y de qué depende. Los archivos viven en la tabla del plan.
- La spec cita la anterior del módulo («igual que NNN») y escribe el delta.
- Si el esbozo pasa de 12 archivos o de una pantalla, se parte en dos specs antes de redactar.
- No se reescriben las carpetas `specs/NNN-slug/` que ya tienen `spec.md`.

## Consecuencias

- Positivas: la preparación de una spec nueva cabe en una sesión de ~2 h; la cola de Adrián es un resumen.
- Negativas / deuda aceptada: un supuesto mal clasificado aparece al implementar y se corrige en el registro de cambios, con su nueva aprobación.
- Cómo sabremos si fue un error: si una spec creada después de este ADR espera más de un día la aprobación, o si al implementarla hay que reabrir el plan por un supuesto que sí cambiaba el comportamiento.
