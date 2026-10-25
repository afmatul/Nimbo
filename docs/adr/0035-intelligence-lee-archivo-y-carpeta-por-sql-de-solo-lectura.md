# ADR-0035 — `intelligence` lee `archivo` y `carpeta` por SQL de solo lectura para recuperar con filtro en la consulta

| Campo | Valor |
|---|---|
| Estado | Aceptado (Adrián, 2026-10-25, al aprobar el plan 020); enmendado el 2026-10-25 (PD-134) |
| Fecha | 2026-10-25 |
| Decisores | Adrián (architect), equipo Nimbo |
| Specs relacionadas | 020 (plan D-2), 019, DF-81, ADR-0005 (autorización en la consulta), ADR-0010 (fronteras), `architecture.md` §3 reglas 3 y 6 |

## Contexto

La recuperación del agente (020) debe aplicar en **una sola consulta** tres filtros: nodos accesibles del actor
(`accessibleNodes(actor)`, de `access`), versión vigente (`archivo.version_actual_id`) y ámbito de carpeta
(`carpeta.ruta LIKE <ruta>%`). `fragmento` solo guarda `archivo_id` y `version_archivo_id`, así que la consulta debe unir
`archivo` y `carpeta`, tablas de `storage`. La búsqueda vectorial con filtro posterior perdería recall y filtrar después de
consultar está prohibido (ADR-0005, CLAUDE.md). Hasta hoy hay dos excepciones a «cada módulo es dueño de sus tablas»:
`access` (lectura) y `storage → usuario.espacio_usado` (regla 6, que exige DF y ADR para copiar el patrón).
Restricciones: equipo de 4, Fase 3, un `api` en 8 GB, corpus de pocos miles de fragmentos por cuenta.

## Opciones consideradas

1. **Lectura SQL de solo lectura de columnas acotadas desde `SqlChunkRepository`** (`archivo.id`, `carpeta_id`,
   `version_actual_id`; `carpeta.id`, `ruta`), dentro de `withActor`, junto a `accessibleNodes(actor)`.
   - Pros: filtro único en la misma consulta (ADR-0005); sin puerto ni arista nueva; igual que `access`, que ya lo hace.
   - Contras: `intelligence` conoce columnas de `storage`; un renombre en `storage` rompe la consulta (se detecta con la prueba de integración).
2. **Fachada o puerto de `storage`** (`INodeMetadataReader` u otro) que devuelva ids de archivos del ámbito.
   - Pros: sin acoplamiento a columnas.
   - Contras: `INodeMetadataReader` es de metadatos para roles internos (011) y no filtra por `accessibleNodes` ni por ruta; la lista de ids
     saldría de la consulta (miles de ids de vuelta a `fragmento`), es decir, filtrar fuera de la consulta; un puerto nuevo para un único consumidor (YAGNI).
3. **Fragmento SQL exportado por `storage`** (`liveFileScope(scope)`, al estilo de `accessibleNodes`).
   - Pros: `storage` conserva el conocimiento de sus columnas y el filtro sigue en la misma consulta.
   - Contras: agrega una API pública y una arista de uso nueva hacia `storage` para un único consumidor; sin segundo uso hoy. Es el camino si otro módulo repite el patrón (regla de tres).
4. **Desnormalizar** (`fragmento` guarda `carpeta_ruta` y `vigente`).
   - Contras: mover una carpeta o restaurar una versión obliga a reescribir fragmentos y a escuchar eventos de `storage`; más estado que conciliar.
5. **Posponer**: 020 no puede cumplir CA-9/CA-17 sin esto.

## Decisión

Opción 1, como **tercera excepción acotada** a «cada módulo es dueño de sus tablas»: `intelligence` solo lee, por SQL, las columnas
`archivo(id, carpeta_id, version_actual_id)` y `carpeta(id, ruta)`; nunca escribe, nunca importa `storage`, y la lectura vive en un solo
archivo (`chunk-sql.ts`). Siempre en `withActor`, con `accessibleNodes(actor)` en la misma consulta. Una prueba de integración
(`sql-chunk.repository.int-spec.ts`) falla si cambia el nombre de esas columnas. Si un segundo módulo necesita el mismo ámbito, se migra a la opción 3.
Es defendible porque repite el razonamiento de `access` (la autorización se resuelve dentro de la consulta) con el mínimo de columnas.

## Consecuencias

- Positivas: recuperación correcta (recall y aislamiento) con una consulta; sin puertos ni dependencias nuevas.
- Negativas / deuda aceptada: acoplamiento de `intelligence` a cinco columnas de `storage`; `architecture.md` §3 gana la regla 7.
- Cómo sabremos si fue un error: si `storage` cambia esas columnas y la prueba falla con frecuencia, o si aparece un segundo lector (pasar a la opción 3).

## Enmienda 2026-10-25 (PD-134, Adrián)

El evento `citation` de `POST /agent/ask` lleva `fileName` (plan 020 §4, S-1) y nada de lo aceptado lo provee. Se suma la columna
`archivo.nombre` a las que `intelligence` puede leer, en la misma consulta de `chunk-sql.ts` que ya filtra con `accessibleNodes(actor)`:
sin puerto nuevo ni otra ida a la base (RNF-03). Se descartó `namesOf(actor, fileIds)` en `storage` (una consulta y un puerto más para
un solo consumidor). El nombre solo viaja en el evento `citation`: nunca entra al prompt (S-1) ni a bitácoras. La prueba de columnas
(`chunk-search.int-spec.ts`) suma `nombre`; el acoplamiento pasa a seis columnas.
