# ADR-0003 — PostgreSQL con pgvector para los vectores; `vector(768)` fijo e índice HNSW

| Campo | Valor |
|---|---|
| Estado | Propuesto |
| Fecha | 2026-10-21 |
| Decisores | Adrián (architect), equipo Nimbo |
| Specs relacionadas | 000 (extensión `vector`), 019 (primer uso), 020 (recuperación híbrida), ADR-0005 (RLS), ADR-0007, DF-14 |

## Contexto

La inteligencia documental (RF-30 a RF-34) guarda un vector por fragmento y busca por similitud. Los fragmentos son
**datos de cliente**: solo los puede alcanzar quien ya ve el archivo (RNF-05, DF-14), así que la búsqueda vectorial debe
poder filtrar por `accessibleNodes(actor)` **antes** de ordenar, y estar protegida por RLS (ADR-0005). Restricciones: equipo
de 4, 10 semanas, un servidor de 8 GB con ONLYOFFICE (~4 GB), cientos o pocos miles de fragmentos por cuenta de demo, y un
Postgres que ya existe. La imagen `pgvector/pgvector:pg17` está en compose, CI y Testcontainers, y la migración
`20260915120000-crear-extension-vector` ya crea la extensión (spec 000). Falta decidir el modelo de almacenamiento y el índice.

## Opciones consideradas

1. **pgvector dentro de PostgreSQL, columna `vector(768)` en `fragmento`, índice HNSW coseno.**
   - Pros: la autorización sigue en la misma consulta y bajo la misma RLS (sin copiar permisos a otro sistema); una sola
     transacción para el cambio de versión (borrar fragmentos viejos e insertar nuevos, CA-10); `tsvector` para la parte
     léxica de la recuperación híbrida en el mismo motor; cero servicios nuevos; ya está en la infraestructura.
   - Contras: HNSW con filtro posterior puede devolver menos resultados que el límite pedido; el índice ocupa memoria; la
     dimensión queda atada a la columna.
2. **Base vectorial aparte (Qdrant, Weaviate).**
   - Pros: filtrado y escalado pensados para vectores.
   - Contras: otro contenedor (memoria que no hay con ONLYOFFICE), permisos duplicados que habría que sincronizar (la fuga entre
     cuentas pasaría a depender de esa sincronización), borrado no transaccional con Postgres; desproporcionado para la escala del curso.
3. **Sin índice vectorial: escaneo exacto (`<=>` sin índice) o similitud en la aplicación.**
   - Pros: sin tuning ni índice.
   - Contras: solo es aceptable cuando el filtro por archivo acota mucho; la aplicación tendría que traer vectores a memoria
     (y filtrar después, que está prohibido). Se mantiene como **plan B de 020** si el planificador no usa HNSW con el filtro.
4. **IVFFlat en lugar de HNSW.**
   - Pros: índice más pequeño y de construcción rápida.
   - Contras: exige entrenar listas con datos ya cargados (una tabla vacía al migrar da mal recall) y reentrenar al crecer;
     HNSW no necesita datos previos y se puede crear en la migración.
5. **Posponer.** 019 guarda fragmentos con vector; sin decisión no hay esquema.

## Decisión

Opción 1. `fragmento.embedding vector(768) NOT NULL` con `USING hnsw (embedding vector_cosine_ops)` y `fragmento.archivo_id` /
`version_archivo_id` desnormalizados para la RLS y el filtro previo. Reglas:

- **Dimensión 768 fija** (`gemini-embedding` con `outputDimensionality` 768 y vectores normalizados L2). Cambiar de modelo o de
  dimensión exige una migración y reindexar todo (la conciliación de 019 lo permite); `IEmbeddingProvider` (ADR-0007) oculta el proveedor.
- Toda consulta vectorial filtra con `fragmento.archivo_id IN (accessibleNodes(actor))` antes de `ORDER BY embedding <=> $q`, y la
  tabla tiene RLS con `FORCE`. Ningún rol interno tiene política: 0 filas.
- El `down` de la migración borra políticas y tablas antes de que se revierta la extensión.
- Si con el filtro HNSW devuelve menos de lo esperado, 020 decide entre `hnsw.iterative_scan` y escaneo exacto, y lo mide.

## Consecuencias

- Positivas: una sola fuente de verdad para permisos y datos; sin infraestructura nueva; aislamiento probable con las pruebas de
  `test/isolation`; defendible en la exposición como «el vector hereda la seguridad del dato».
- Negativas / deuda aceptada: la dimensión es una decisión de esquema; HNSW consume memoria de Postgres (el corpus de demo es chico);
  la calidad del recall con filtro se mide en 020.
- Cómo sabremos si fue un error: si la consulta filtrada excede el presupuesto de latencia de 020/023 con el corpus de carga, o si
  `postgres` (`mem_limit` 1 GB) se queda sin memoria con el índice; entonces se pasa a escaneo exacto por archivo o se revisa la opción 2.
