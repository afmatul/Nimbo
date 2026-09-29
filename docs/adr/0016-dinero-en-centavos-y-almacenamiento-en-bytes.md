# ADR-0016 — Representación de dinero en centavos y almacenamiento en bytes (DF-23, DF-24)

| Campo | Valor |
|---|---|
| Estado | Propuesto |
| Fecha | 2026-09-26 |
| Decisores | Fátima (redacta). Aceptación pendiente de un revisor distinto |
| Specs relacionadas | 006a, 008, 009, 010 |

## Contexto

El diseño original presentaba discrepancias de tipos y unidades entre los diagramas E-R y de clases:

1. El dinero figuraba como `Plan.priceGtq: number` (clases), `precio int` (E-R) y `transaccion.monto numeric`. El punto flotante en TypeScript acumula error de precisión.
2. El almacenamiento en el E-R usaba unidades mixtas (`cuota_gb`, `max_archivo_mb`), mientras que `PlanLimits` y el motor de almacenamiento operan en bytes. Un archivo de 2 GB (2 147 483 648 bytes) no cabe en un `integer` de 32 bits (DF-06).

## Opciones consideradas

1. **Unificar a enteros mínimos en base de datos y dominio (centavos `integer` y bytes `bigint`)**:
   - Pros: no hay error de redondeo; el mapeo entre la tabla, `PlanLimits` y el almacenamiento es directo; `bigint` cubre el archivo de 2 GB.
   - Contras: la interfaz formatea a quetzales y a GB.
2. **Mantener tipos mixtos (`numeric` y GB/MB) y convertir en mappers**:
   - Pros: una consulta manual se lee en unidades humanas.
   - Contras: la conversión queda repartida y cada módulo puede usar una base distinta (1000 o 1024).
3. **No hacer nada / posponer**:
   - Pros: ninguno.
   - Contras: bloquea la tabla `plan` y los contratos de 006a.

## Decisión

Adoptar la opción 1.

- El dinero se guarda en centavos enteros (`integer`, moneda GTQ). Q45.00 se guarda como `4500`. 006a no introduce el value object `Money`. Si 009 lo necesita, usa estos mismos centavos.
- Toda cuota y todo tamaño se guardan en bytes `bigint`, en la base (`cuota_bytes`, `max_archivo_bytes`) y en `PlanLimits` (`storageBytes`, `maxFileSizeBytes`). 1 MB = 1024², 1 GB = 1024³, 1 TB = 1024⁴. No se usa `number` para bytes.

## Consecuencias

- Positivas: la tabla `plan`, `PlanLimits` y el almacenamiento comparten unidad. Cumple DF-06, DF-23 y DF-24.
- Negativas / deuda aceptada: la interfaz formatea `4500` a `Q45.00` y los bytes a GB o MB. `Money` queda para 009.
- Cómo sabremos si fue un error: si la facturación necesita otra unidad, o si el backend vuelve a convertir entre GB y bytes en más de un lugar.
