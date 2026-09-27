# ADR-0016 — Representación de dinero en centavos y almacenamiento en bytes (DF-23, DF-24)

| Campo | Valor |
|---|---|
| Estado | Propuesto |
| Fecha | 2026-09-26 |
| Decisores | Juan Marcos, Adrián, Abel, Fátima |
| Specs relacionadas | 006a, 008, 009, 010 |

## Contexto
El diseño original presentaba discrepancias de tipos y unidades entre los diagramas E-R y de clases:
1. El dinero figuraba como `Plan.priceGtq: number` (clases), `precio int` (E-R) y `transaccion.monto numeric`. El uso de números de punto flotante en TypeScript genera errores de precisión binaria acumulativos.
2. El almacenamiento en el E-R usaba unidades mixtas (`cuota_gb`, `max_archivo_mb`), mientras que la clase `PlanLimits` y el motor de almacenamiento operan internamente en bytes. Esto forzaba conversiones en mappers y riesgo de desbordamiento (un archivo de 2 GB supera el límite de un `integer` de 32 bits, DF-06).

## Opciones consideradas
1. **Unificar a enteros mínimos en BD y dominio (centavos `integer` y bytes `bigint`)**:
   - Pros: Cero errores de redondeo de punto flotante; mapeo directo 1:1 entre base de datos, `PlanLimits` y lógica de almacenamiento; evita desbordamientos en Postgres con `bigint`.
   - Contras: Requiere formatear a Quetzales (Q) y GB únicamente en la capa de presentación (UI).
2. **Mantener tipos mixtos (`numeric` y GB/MB) y convertir en mappers**:
   - Pros: La base de datos es legible directamente por humanos en consultas manuales sin calcular bytes ni centavos.
   - Contras: Lógica de conversión propensa a errores dispersa en varios mappers; riesgo de inconsistencia entre módulos.
3. **No hacer nada / posponer**:
   - Pros: Ninguno.
   - Contras: Bloquea la creación de la tabla `plan` y los contratos de 006a.

## Decisión
Adoptar la **Opción 1**:
- El dinero se almacena y modela en **centavos enteros (`integer`)** con moneda GTQ (Quetzales). Q45.00 se almacena como `4500`. En TypeScript se maneja como valor entero tipado o value object `Money`.
- Toda cuota y tamaño se almacena y modela en **bytes (`bigint`)** en la base de datos (columna `cuota_bytes` y `max_archivo_bytes`) y como `bigint` o `number` entero seguro en `PlanLimits`.

## Consecuencias
- Positivas: Coherencia total entre la tabla `plan`, la entidad `Plan`, `PlanLimits` y los requisitos de almacenamiento. Cumple DF-06, DF-23 y DF-24.
- Negativas / deuda aceptada: Las respuestas REST públicas para visualización comercial o el frontend deberán encargarse de formatear `4500` a `Q45.00` y bytes a `GB`/`MB`.
- Cómo sabremos si fue un error: Si surgen inconsistencias en cálculos de facturación o necesidad repetida de conversiones complejas en el backend.
