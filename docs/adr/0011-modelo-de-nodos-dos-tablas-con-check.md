# ADR-0011 — Modelo de nodos: tablas separadas `archivo` y `carpeta`, con `CHECK` de exclusividad en lo que las referencia

| Campo | Valor |
|---|---|
| Estado | Aceptado (Adrián, 2026-10-17, con la aprobación de la spec 012); propuesto el 2026-09-28. Alineado con el E-R vigente; cierra DF-40 |
| Fecha | 2026-09-28 |
| Decisores | Adrián (architect), equipo Nimbo. El usuario decidió el 2026-09-28 seguir el E-R vigente |
| Specs relacionadas | 005 (crea `archivo`), 006 (crea `carpeta`), 012 y 013 (`comparticion`, `enlace_publico`); DF-40, DF-32; ADR-0005 |

## Contexto

El diagrama de clases modela `StorageNode` (Composite) con `Folder` y `File`. El E-R tiene dos tablas, `archivo` y `carpeta`, y
`comparticion` y `enlace_publico` apuntan a una **o** a la otra (dos FK), lo que pide una regla de exclusividad (DF-40). La 005 crea
`archivo`, `version_archivo` y `carga` y necesita fijar ya el modelo, porque `accessibleNodes(actor)` (DF-32) devuelve nodos de los dos tipos
y las políticas RLS de ADR-0005 se escriben por tabla. Restricciones: 4 personas, 10 semanas, migraciones reversibles a mano
(ADR-0002), servidor de 8 GB.

## Opciones consideradas

1. **Dos tablas (`archivo`, `carpeta`) con `CHECK` de exclusividad en `comparticion` y `enlace_publico`** (elegida; E-R vigente)
   - Pros: cada tabla tiene sus columnas propias sin nulos (archivo: tamaño, tipo, versión actual; carpeta: `ruta`, padre); el índice de
     nombre repetido por propietario es un índice parcial simple sobre `archivo`; RLS y permisos por tabla; ninguna migración toca el diseño
     ya entregado en el E-R. `accessibleNodes` devuelve `(nodo_id, tipo_nodo, nivel)` con un `UNION ALL` por tabla.
   - Contras: dos FK nulables con `CHECK ((archivo_id IS NULL) <> (carpeta_id IS NULL))` en dos tablas; consultas de árbol que mezclan tipos
     hacen `UNION`; la unicidad de nombres entre archivos y carpetas del mismo padre necesita un mecanismo aparte (006).
2. **Tabla única `nodo` con `tipo`**
   - Pros: una sola FK en comparticiones; el árbol y la herencia de permisos se consultan sin `UNION`.
   - Contras: columnas propias de cada tipo quedan nulables (o se separan en tablas de detalle, es decir, otra vez dos tablas);
     rehacer el E-R y el diagrama de clases ya entregados; la 005 (fecha del 30/09) pagaría el rediseño.
3. **Posponer**
   - Contras: la 005 no puede escribir sus migraciones ni sus políticas sin fijar esto; DF-40 bloquearía el plan.

## Decisión

Opción 1. `archivo` (005) y `carpeta` (006) son tablas separadas. `comparticion` y `enlace_publico` (012, 013) llevan `archivo_id` y
`carpeta_id` con `CHECK` de exactamente uno. En dominio, `StorageNode` sigue siendo el Composite (`File`, `Folder`); el mapeo ORM
↔ dominio queda en `infrastructure/persistence`. `accessibleNodes(actor)` (M3a) es la única definición de «qué ve el actor»:
005 escribe su rama de propiedad para `archivo`; 006 añade `carpeta`; 012 añade comparticiones directas y heredadas por `carpeta.ruta`.
Si la regla se repite en la política RLS, se extrae una función SQL `STABLE` versionada (ADR-0005).

## Consecuencias

- Positivas: el E-R y el diagrama de clases siguen vigentes; 005 avanza sin rediseño; las columnas de cada tabla son las que ese tipo necesita.
- Negativas / deuda aceptada: `UNION ALL` en `accessibleNodes` y en el listado del explorador (006); la unicidad de nombre entre archivo y carpeta
  hermanos se resuelve en 006 (no la garantiza un índice de una sola tabla); los `CHECK` de exclusividad se repiten en dos tablas.
- Cómo sabremos si fue un error: si la consulta del explorador o la de `accessibleNodes` supera el p95 de RNF-01 por el `UNION`, o si 012 termina
  duplicando la misma lógica para archivos y carpetas en más de un lugar; en ese caso se reabre con la opción 2 antes de la Fase 3.
