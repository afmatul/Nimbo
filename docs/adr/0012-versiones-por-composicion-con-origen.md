# ADR-0012 — Versiones por composición: una sola `version_archivo` con `origen`, y `storage` como dueño de su ciclo de vida

| Campo | Valor |
|---|---|
| Estado | Aceptado (2026-10-10, Adrián) con la spec 014 (propuesto el 2026-09-28). Alineado con el E-R vigente; cierra DF-17 y la parte de DF-18 que toca a 014 (el resto, `sesion_edicion_id` y autores, llega con 016) |
| Fecha | 2026-09-28 |
| Decisores | Adrián (architect), equipo Nimbo. El usuario decidió el 2026-09-28 seguir el E-R vigente |
| Specs relacionadas | 005 (`origen = carga`), 014 (restaurar y podar), 016 (`origen = edicion`), 021 (`origen = optimizacion`); DF-05, DF-17, DF-18, DF-21 |

## Contexto

El diagrama de clases hace que `DocumentVersion` (M5 `editing`) herede de `FileVersion` (M2 `storage`), duplica los autores
(`authorIds` frente a `Participant`) y deja dos dueños de la restauración (`FileService.restoreVersion` y
`VersionHistoryService.restore`). El E-R tiene una sola `version_archivo` con `origen` (`carga`, `edicion`, `restauracion`, `optimizacion`).
La herencia entre módulos crearía la dependencia `storage → editing` o una jerarquía que cruza fronteras (ADR-0010, Art. VIII).
La 005 crea `version_archivo` y su `origen` y debe fijar la forma ahora. Restricciones: 4 personas, 10 semanas, DAG de módulos.

## Opciones consideradas

1. **Composición: una `version_archivo` con `origen`; `storage` es dueño del ciclo de vida (registrar, restaurar, podar); `editing` aporta la autoría** (elegida; E-R vigente)
   - Pros: una tabla y un dueño; el DAG se mantiene (`editing → storage`); las versiones de carga, edición, restauración y optimización se listan en una línea de
     tiempo con una consulta; `sesion_edicion_id UNIQUE` en la misma tabla da la idempotencia en base de datos (DF-05); los autores se derivan de `participacion`.
   - Contras: columnas propias de una `origen` quedan nulables (`sesion_edicion_id` solo con `edicion`); las reglas por `origen` viven en dominio y `CHECK`.
2. **Herencia: `version_documento` como tabla o clase hija de `version_archivo`**
   - Pros: fiel al diagrama de clases original.
   - Contras: `editing` extendería una clase de `storage` (acoplamiento por herencia entre módulos); dos tablas de versiones, dos sitios para restaurar y podar (DF-17);
     los autores duplicados. Más migraciones para lo mismo.
3. **Posponer hasta 014/016**
   - Contras: 005 escribe `version_archivo` y `archivo.version_actual_id` ya; sin decidir, 014 y 016 tendrían que migrar datos existentes.

## Decisión

Opción 1. `version_archivo` (005) lleva `origen` con `CHECK` (`carga`, `edicion`, `restauracion`, `optimizacion`) y `creado_por`. 005 solo escribe `origen = 'carga'`.
Las versiones son inmutables: una restauración (014) y una optimización (021, DF-21) crean una **versión nueva**, nunca sobrescriben el objeto. `storage` es el
único que registra, restaura y poda versiones; `editing` (016) agrega `sesion_edicion_id` (`UNIQUE`, DF-05) cuando exista y la autoría se deriva de `participacion`, sin
`DocumentVersion` heredado. `archivo.version_actual_id` apunta a la vigente (FK diferida por el ciclo `archivo ↔ version_archivo`). Cada `version_archivo` tiene su objeto
en `u/{propietario}/{archivo}/{version}`.

## Consecuencias

- Positivas: una sola línea de tiempo y un solo dueño; sin herencia entre módulos; 014, 016 y 021 solo agregan un `origen` y sus reglas.
- Negativas / deuda aceptada: la tabla crece con columnas de 016 (nulables por `origen`); `CHECK` por `origen` que hay que mantener; el diagrama de clases de M5
  hay que redibujar (`DocumentVersion` desaparece; PD-36 y la lista de la 005).
- Cómo sabremos si fue un error: si el `CHECK` por `origen` se vuelve una tabla de excepciones en 014/016, o si la consulta de la línea de tiempo necesita
  uniones por `origen` con más de dos tablas auxiliares; en ese caso se reabre con la opción 2 antes de la Fase 3.
