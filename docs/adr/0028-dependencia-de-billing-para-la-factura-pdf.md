# ADR-0028 — Dependencia de `billing` para la factura PDF: `pdfkit` detrás de `IInvoiceGenerator` (ADR menor)

| Campo | Valor |
|---|---|
| Estado | Aceptado (2026-10-15, Adrián); propuesto el 2026-10-14 |
| Fecha | 2026-10-14 |
| Decisores | Adrián (architect), Juan Marcos (dueño de la 009) |
| Specs relacionadas | 009 (T-07, CA-6; plan §7 «PDF pesado en memoria») |

## Contexto

La T-07 de la 009 genera la factura PDF de cada pago aprobado. El puerto ya existe: `IInvoiceGenerator` →
`PdfInvoiceGenerator` (`architecture.md` §5, `design-model.md` M4). `InvoiceService.issue` lo llama después del commit,
sube el resultado con `IObjectStorage.putObject` a `invoices/{usuario_id}/{factura_id}.pdf` y, si algo falla, el trabajo
`invoice-retry` del `worker` lo repone. Por eso el generador corre en **dos procesos** (`api` y `worker`), ambos
contenedores Node 22 sin navegador.

Qué tiene que dibujar: una página con el número `NB-AAAA-NNNN`, la fecha del pago, el plan, subtotal, IVA 12 %, total en
GTQ (de centavos enteros, ADR-0016), NIT o «CF» y el correo del comprobante, en español con tildes, «ñ», «¿» y «¡».
Sin logotipos ni imágenes externas (plan §7). No se rellenan PDF existentes, no se firma y no se extrae texto.

Node no trae nada para escribir PDF, así que hace falta una librería. `CLAUDE.md` exige ADR para toda dependencia
significativa y Adrián dejó este ADR menor como compuerta previa al código de T-07 (plan §7). Ghostscript y qpdf están
previstos para el optimizador (M7) y transforman PDF existentes; no componen documentos, así que no sirven aquí.

Restricciones: equipo de 4, una tarea (T-07) para PDF y reintento, servidor de 8 GB con ~4 GB para ONLYOFFICE, y la
constitución (Art. V YAGNI, Art. VIII capas: el dominio no conoce librerías, Art. XII degradación).

Criterios: peso de la dependencia y del contenedor; binarios nativos o scripts de instalación (pnpm 10 los bloquea fuera
de `onlyBuiltDependencies`); licencia; mantenimiento; tildes y «ñ» sin archivos de fuente propios; tipos TypeScript;
determinismo para pruebas; memoria por factura.

> Las versiones, tamaños y fechas citados salen de `npm view` del 2026-10-14. Se vuelven a verificar al instalar, y la
> versión se fija exacta como el resto del repo.

## Opciones consideradas

1. **`pdfkit` (0.20.x, MIT)**: API imperativa de Node para componer PDF (texto con ajuste de línea, tablas simples, líneas).
   - Pros:
     - JavaScript puro. Sus dependencias (`fontkit`, `linebreak`, `png-js`, `fflate`, `@noble/*`) no traen binarios ni
       script de instalación, así que la imagen `node:22` no cambia.
     - Trae las 14 fuentes estándar de PDF (Helvetica, Times, Courier) como métricas AFM dentro del paquete, codificadas en
       WinAnsi, que cubre á é í ó ú ü ñ Ñ ¿ ¡. No hay que versionar archivos `.ttf` y el visor no necesita fuentes incrustadas.
     - Mantenimiento activo (publicaciones en 2026). `pdfmake` está construido sobre esta misma librería.
     - Escribe en un *stream* y una página de texto pesa pocos KB, así que la memoria por factura es despreciable al lado
       del `api`.
     - Determinista si se le pasa `info.CreationDate`: el `/ID` del archivo se calcula con un hash de `info`, así que con la
       misma fecha y los mismos datos sale el mismo PDF. La fecha del sistema solo se usa si se omite.
   - Contras:
     - No trae tipos propios: hay que usar `@types/pdfkit` (dev), que va detrás (0.17.x frente a 0.20.x). Hay que comprobar
       que cubre lo que se usa.
     - API imperativa con coordenadas: el diseño de la página vive en código.
     - Lee los AFM desde su carpeta en tiempo de ejecución. Funciona con el build actual de Nest (`tsc`, sin *bundler*);
       si un día se empaqueta con webpack, hay que copiar esos archivos.
     - El texto queda en el PDF como cadenas hexadecimales dentro de flujos comprimidos: una prueba no puede buscar
       «NB-2026-0001» en los bytes crudos (ver Pruebas).
2. **`pdf-lib` (1.17.1, MIT)**: crea y modifica PDF; también corre en el navegador.
   - Pros: JavaScript puro, tipos incluidos, fuentes estándar con WinAnsi, sin binarios.
   - Contras:
     - Sin publicaciones desde 2022: es el peor dato de mantenimiento de las cuatro opciones para algo que va a producción.
     - API de bajo nivel: no ajusta líneas ni mide bloques, así que habría que escribir a mano un mini-motor de maquetación.
       Eso contradice la regla de no reinventar con un equipo de 4.
     - Su ventaja real (editar PDF existentes, formularios) no la pide ninguna spec activa (YAGNI).
3. **`pdfmake` (0.3.x, MIT)**: documento declarativo (JSON) con tablas y estilos, sobre `pdfkit`.
   - Pros: plantilla declarativa y legible, tablas con bordes y alineación sin calcular coordenadas.
   - Contras:
     - Trae `pdfkit` de todos modos, en un rango que puede ir detrás del último (`^0.19` frente a 0.20), más `xmldoc`:
       dos capas de dependencia para una página.
     - En Node hay que declarar las fuentes. Su ejemplo usa Roboto con archivos propios; para las estándar hay que
       mapearlas a mano.
     - Tipos en `@types/pdfmake` (verificar la versión al instalar).
     - Lo que aporta (tablas complejas, varias páginas, encabezados repetidos) no lo necesita una factura de una página.
       Si la factura crece, se puede adoptar más adelante sin tocar el puerto.
4. **HTML + Puppeteer/Chromium (`puppeteer` 25.x, Apache-2.0)**: plantilla HTML/CSS impresa a PDF por un Chromium headless.
   - Pros: la plantilla se maqueta con HTML y CSS (incluso podría usar los tokens de Cielo Sereno) y las fuentes Unicode
     no dan problemas.
   - Contras (descarte):
     - Descarga o exige un Chromium de cientos de MB en el contenedor.
     - Necesita librerías del sistema (en Alpine, el paquete `chromium` y fuentes) y flags de *sandbox* en Docker.
     - Cada instancia consume cientos de MB de RAM. Correría en el `api` y en el `worker`, en un servidor de 8 GB donde
       ONLYOFFICE ya ocupa ~4 GB.
     - Arranque lento y procesos huérfanos si falla.
     - Abre una superficie de ataque (motor de navegador renderizando datos del usuario como el correo) que una factura no
       justifica.
     - Introduce de hecho una tecnología nueva en la infraestructura (Art. V; ADR-0001), no solo una librería.
5. **Posponer**: entregar solo el registro `factura` y el historial, sin PDF.
   - Pros: cero dependencias.
   - Contras: CA-6 no se cumple, `clave_objeto` nunca se llena y la descarga de T-09 siempre devuelve 404. Bloquea T-07,
     T-08 y la demo de la Fase 2. No hay una forma razonable de escribir PDF sin librería: a mano sería código de formato
     binario propio, sin nadie que lo mantenga.

## Decisión

Adoptar la **opción 1, `pdfkit`** (versión exacta vigente al instalar, hoy 0.20.2) en `apps/api` como dependencia de
producción, con `@types/pdfkit` como dependencia de desarrollo. La razón principal es que es la opción más simple que
cumple todo: JavaScript puro sin binarios ni Chromium, tildes y «ñ» con las fuentes estándar sin archivos propios,
mantenida, y con salida determinista para las pruebas. `pdfmake` agrega una capa que una página no necesita y `pdf-lib`
está detenido desde 2022.

Aislamiento (Art. IV D, Art. VIII):
- **Solo** `apps/api/src/modules/billing/infrastructure/adapters/pdf-invoice-generator.ts` importa `pdfkit`.
  `PdfInvoiceGenerator` implementa `IInvoiceGenerator`, que vive en `billing/application/ports/i-invoice-generator.port.ts`.
- El puerto recibe datos planos de la factura, ya calculados (número, fecha, plan, montos en centavos de `breakdown`,
  NIT o CF, correo), y devuelve `Buffer`. No recibe entidades de TypeORM ni conoce MinIO: subir el archivo sigue siendo
  trabajo de `InvoiceService` con `putObject`.
- El dominio y la aplicación no conocen la librería. Para el dominio, `layers.js` ya rechaza cualquier paquete. Para
  `application`, lo cuida la revisión: con un solo punto de importación no se agrega una regla de lint nueva (Art. V).
  Si un segundo módulo quisiera `pdfkit`, se reabre este ADR.
- Fuentes: solo `Helvetica` y `Helvetica-Bold` estándar. Sin imágenes, sin fuentes incrustadas, sin cifrado ni firma.
  Si un día hace falta un carácter fuera de WinAnsi, se incrusta un `.ttf` versionado y se actualiza este ADR.
- La fecha del documento (`info.CreationDate`) es la fecha del pago de la factura, nunca `new Date()`. Así el PDF repuesto
  por `invoice-retry` es igual al original.
- Los montos se formatean desde centavos enteros con aritmética entera, sin un `number` decimal intermedio (ADR-0016).
  Hoy ya hay un `formatPrice` local en `apps/web/.../plan-picker.tsx`; el PDF sería la segunda copia y la pantalla de
  pago (T-10) la tercera. Por eso se escribe **una** función pura `formatGtq(cents)` en `packages/contracts`, junto a
  `breakdown`, que usan la web y el adaptador (Art. VI.2). Esto choca con la letra de la spec 009 RN-1 («el formato
  `Qxx.xx` es solo de `web`»): antes de T-07, la spec se corrige para que el formato sea compartido. El formato visible no
  cambia.
- Instalación: confirmar que `pnpm install` no pide agregar nada a `onlyBuiltDependencies`. Si lo pide, la dependencia
  dejó de ser JS puro y este ADR se revisa antes del merge.

`architecture.md` no cambia: el puerto, el adaptador y el módulo ya figuran en §5. `design-model.md` M4 ya nombra
`PdfInvoiceGenerator`.

## Pruebas

- `pdf-invoice-generator.spec.ts` (unidad del adaptador, sin red, sin MinIO y sin reloj del sistema):
  - el `Buffer` empieza con `%PDF-` y termina en `%%EOF`;
  - el texto contiene el número `NB-2026-0001`, el subtotal, el IVA y el total esperados, «CF» (o el NIT dado) y una
    cadena con tilde y «ñ».
  - Para leer el texto, un ayudante de prueba (≤ 30 líneas, sin dependencia nueva) infla los flujos con `node:zlib` y
    decodifica las cadenas hexadecimales de los operadores `TJ` como Latin-1/WinAnsi.
  - Dos llamadas con los mismos datos devuelven bytes idénticos: prueba el determinismo y que no se usa la fecha del
    sistema.
- `formatGtq` tiene su propia prueba unitaria en `packages/contracts`, con el formato `Qxx.xx` de la spec y los bordes
  0, 1 y 100 centavos.
- Integración (ya en el plan): `subscribe-invoice.int-spec.ts` comprueba que el objeto en MinIO existe y empieza con
  `%PDF`, y `invoice-retry.int-spec.ts` falla el generador con un doble para probar el reintento. Ninguna prueba de
  integración depende del aspecto visual.

## Consecuencias

- Positivas:
  - Una dependencia JS pura y mantenida; la imagen y la memoria del `api` y del `worker` prácticamente no cambian.
  - La plantilla se prueba en unidad y en determinismo.
  - Cambiar de librería (por ejemplo, a `pdfmake` si la factura crece) toca un solo archivo, gracias al puerto.
  - Si falla la generación, solo se pierde el PDF: el pago ya está confirmado y `invoice-retry` lo repone (Art. XII).
- Negativas / deuda aceptada:
  - Maquetación imperativa con coordenadas en el adaptador, un poco más verbosa que una plantilla declarativa.
  - `@types/pdfkit` va detrás de la librería.
  - Los AFM se leen del disco: un futuro *bundler* tendría que copiarlos.
  - Solo hay caracteres WinAnsi, suficiente para español pero no para otros alfabetos.
  - La prueba lee el texto con un ayudante propio, no con un extractor real. Cuando la spec de indexación (M6) elija su
    `PdfExtractor`, el ayudante puede reemplazarse por él, en otro ADR.
- Cómo sabremos si fue un error:
  - `@types/pdfkit` no compila con la versión instalada sin `any` o declaraciones propias extensas.
  - Algún carácter del texto en español sale mal en el visor.
  - La instalación exige binarios nativos.
  - El adaptador supera 30 líneas por función o crece a varios archivos por la maquetación manual.
  - Una spec pide facturas de varias páginas o tablas complejas.

  En los primeros cuatro casos se pasa a `pdfmake` (opción 3), que reutiliza el mismo motor, cambiando solo el
  adaptador. Si `pdfkit` deja de mantenerse, se vuelve a evaluar `pdf-lib`.

## Aceptación (2026-10-15)

Adrián acepta `pdfkit` para generar la factura de `billing`, que no estaba contemplada en las dependencias de las
fundaciones: es el único uso autorizado, detrás de `IInvoiceGenerator` y solo en `pdf-invoice-generator.ts`. Acepta
también una sola función `formatGtq(cents)` en `packages/contracts`, junto a `breakdown`, para los montos del PDF y de
`web`; la spec 009 corrige RN-1 en consecuencia antes del código de la T-07.
