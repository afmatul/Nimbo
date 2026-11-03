# ADR-0033 — Extracción de texto (`fflate`, `fast-xml-parser`, Ghostscript) y embeddings por REST; relay `index-status` del worker al api

| Campo | Valor |
|---|---|
| Estado | Aceptado |
| Fecha | 2026-10-21 |
| Decisores | Adrián (architect), equipo Nimbo |
| Specs relacionadas | 019 (plan §1, §2, §7; D-1, D-2), 020, 021b (reutilizará Ghostscript; 021 JPEG/PNG no lo usa), ADR-0001, ADR-0003, ADR-0007, ADR-0015, ADR-0029, ADR-0030, DF-78, PD-106 |

## Contexto

La 019 lee `.docx`, `.pdf`, `.txt`/`.md` y, como última tarea cortable, `.xlsx`/`.pptx`, y debe devolver la ubicación exacta de cada
fragmento (página, sección y párrafo, línea, hoja, diapositiva). Además vectoriza por lotes con `gemini-embedding` y avisa al
navegador el cambio de estado, aunque el trabajo corra en el `worker` y los sockets vivan en el `api` (ADR-0030). La constitución
exige un ADR por cada dependencia significativa. Restricciones: equipo de 4, `api` y `worker` en CommonJS, `worker` de 768 MB junto a
ONLYOFFICE (~4 GB) en 8 GB, y la clave del proveedor solo en el backend. Hay tres decisiones relacionadas.

## Opciones consideradas

### a) Lectura de OOXML (`.docx`, `.xlsx`, `.pptx`)

1. **`fflate` (zip) + `fast-xml-parser` (XML)**: lectura propia de `word/document.xml`, `styles.xml`, hojas y diapositivas.
   - Pros: dos paquetes pequeños, sin dependencias nativas, compatibles con CommonJS, con tope de bytes descomprimidos contra
     bombas de compresión; un `OoxmlReader` común sirve a los tres formatos y conserva el control de la ubicación.
   - Contras: se escribe el recorrido de los XML (encabezados por estilo/`outlineLvl`, celdas, orden de diapositivas).
2. **`mammoth` / `officeparser` / `xlsx`.**
   - Pros: menos código propio.
   - Contras: pensados para convertir a HTML o a texto plano y pierden o esconden la ubicación (párrafo, sección, hoja); `xlsx`
     tiene un historial de vulnerabilidades y licencia delicada; árbol de dependencias más grande.
3. **Apache Tika o LibreOffice headless.** Contras: JVM o ~500 MB de imagen en un servidor sin memoria libre.
4. **Posponer.** 019 no tendría los formatos que pide.

### b) Texto de PDF

1. **Ghostscript `txtwrite`** como proceso aparte, con tiempo límite (decisión D-1).
   - Pros: ya es parte del stack (021 lo usa para optimizar); una salida por página da la ubicación; falla aislada, sin cargar el PDF en el
     proceso de Node; sin dependencias npm.
   - Contras: binario en el Dockerfile del `worker`, en CI y en cada máquina de desarrollo (`GHOSTSCRIPT_BIN` en Windows); el orden
     de lectura de varias columnas puede ser pobre; licencia AGPL (se invoca como proceso, no se enlaza).
2. **`pdfjs-dist` / `unpdf`.** Pros: JavaScript puro. Contras: ESM contra un `api` CommonJS, se ejecuta en el mismo proceso y con
   archivos hostiles, dependencia mayor.
3. **`pdf-parse`.** Contras: sin mantenimiento y sin separación fiable por página.
4. **OCR** para escaneados: fuera de alcance (spec 019 §7).

### c) Cliente de embeddings

1. **REST con `fetch` detrás de `IEmbeddingProvider`** (sin SDK): lotes de hasta 100, `outputDimensionality` 768 y normalización L2,
   clave en la cabecera `x-goog-api-key`, tiempo límite, 429/5xx/red como error reintentable.
   - Pros: cero dependencias nuevas; superficie pequeña (un endpoint) que se prueba con un servidor HTTP local; control de la clave.
   - Contras: se mantienen a mano el formato de la petición y los errores.
2. **SDK oficial `@google/genai`.** Contras: dependencia grande en el camino de datos del cliente y de la clave, para una sola llamada;
   las pruebas necesitarían simular el SDK.
3. **Marco de IA (Vercel AI SDK, LangChain).** Descartado por ADR-0007.

### d) Aviso en vivo del cambio de estado cuando el productor es el `worker`

1. **Relay**: el `worker` encola `{ownerId, fileId, state, reason}` en la cola `index-status` y un procesador liviano del `api` lo
   retransmite con `IRealtimePublisher.toUser` (decisión D-2).
   - Pros: sin infraestructura nueva (BullMQ ya está); el `api` sigue siendo el único dueño de los sockets; la cola no lleva texto ni nombres.
   - Contras: segunda excepción acotada a ADR-0001 tras ADR-0029 (un procesador en el `api`); un salto más.
2. **`@socket.io/redis-adapter` (ADR-0030 opción 2).** Pros: el `worker` emitiría directo a las salas. Contras: dos clientes Redis y
   una dependencia para un solo productor, y obliga a que el `worker` cargue `realtime`; era la salida prevista si "019/020/022 necesitan
   emitir desde el worker", pero hoy basta el relay. Sigue siendo la salida si hay varias réplicas (PD-106).
3. **Sin aviso: el cliente consulta cada N segundos.** Contras: incumple CA-14 («se actualiza sin recargar») y carga el `api`.
4. **Posponer.** CA-14 queda sin cubrir.

## Decisión

- **a)** Opción 1: `fflate` y `fast-xml-parser` (versiones exactas) en `intelligence/infrastructure/extractors/ooxml-reader.ts`, con tope de
  bytes descomprimidos. **b)** Opción 1: Ghostscript `txtwrite` por `ICommandRunner` (sin shell, tiempo límite, salida acotada, directorio
  temporal 0700 y borrado en `finally`). `ICommandRunner` es interno de `intelligence` hasta que 021 lo reutilice. **c)** Opción 1:
  `GeminiEmbeddingProvider` por REST. **d)** Opción 1: relay `index-status`; se acepta como segunda excepción de ADR-0001 con el mismo
  criterio de ADR-0029 (trabajo liviano que necesita los sockets del `api`) y se resuelve la condición de reabrir de ADR-0030 sin
  agregar el adaptador de Redis.
- CI (`.github/workflows/ci.yml`) y `docs/operations/ambientes.md` instalan y documentan Ghostscript. El Dockerfile del `worker` aún no existe: instalarlo allí es PD-128.

## Consecuencias

- Positivas: dos dependencias npm pequeñas y un binario que 021 ya necesita; la ubicación exacta se conserva en cada formato; ningún SDK
  toca la clave; el aviso en vivo no suma infraestructura.
- Negativas / deuda aceptada: entorno de desarrollo con Ghostscript instalado; recorrido propio de OOXML; el relay no escala a varias
  réplicas sin revisar PD-106; el orden de lectura de PDFs de varias columnas puede ser pobre (la cita sigue siendo por página).
- Cómo sabremos si fue un error: si la extracción de PDF de 50 páginas excede 60 s (CA-11) o falla por entorno en CI; si aparecen formatos
  OOXML que el recorrido propio no cubre; si el relay pierde avisos de forma visible en staging; si el equipo necesita más de un productor
  en el `worker` → ADR-0030 opción 2.
