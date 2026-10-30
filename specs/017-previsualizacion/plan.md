# Plan 017 — Previsualización

> Spec: [spec.md](./spec.md) · Plan **Aprobado por Adrián** · 2026-10-06.
> Planner, Modo 2. Spec revisada por Matul, sin `[ABIERTA]` en §8; spec y plan aprobados por Adrián (2026-10-06).
> Revisado el 2026-10-06 por decisión de Adrián (opción 4): el visor lee con `fetch` y renderiza; sin `inline`, MIME ni migración.
> Escritura autorizada solo en `specs/**`: H-1 sigue local, pendiente de registro oficial DF/PD, sin reservar números.

## 1. Resumen técnico
El navegador solicita una URL autenticada y lee el objeto directamente desde el origen aislado de MinIO.
`PreviewService` recibe `actor: Actor`, limita emisiones y consume `StoragePreviewFacade`, fachada delgada de storage.
La fachada reutiliza el resolver/firmador interno extraído de la descarga y firma con la política de 005: 300 s, un objeto, `attachment`, `application/octet-stream`, `no-store`; sin `presignPreview`, MIME ni migración.
Todo lector obtiene los bytes con `fetch` (helper único, `credentials: 'omit'`) y renderiza; el navegador nunca navega a la URL. El lector se elige por `kind`; contenido incoherente (a.pdf→a.png) falla al decodificar: «corrupto» + Descargar.
PDF usa PDF.js; XLSX/PPTX, ZIP por rangos y XML incremental en worker; imágenes y TXT/MD, APIs nativas.
Pantalla propia, solo lectura, todas las unidades navegables, sin OCR, conversión backend ni nueva versión.
Preview tiene endpoint y tasa propios y no se audita como descarga; la descarga de 005 queda intacta.
Trazabilidad: RF-27; RF-05/09; RNF-05/06/07/09/13/14/17; 017 CA-1…12; 005 CA-13…17/19; 003 D-1/2/6/7/9; 006 CA-4/12/26; 007.
Base: ADR-0005/0008/0010/0014/0015/0020/0023 aceptados; ADR-0027 Rechazado (opción 4 lo sustituye); ADR de motores de previsualización (architect).

## 2. Módulos, archivos y diseño
### 2.1 Archivos propios de Abel (nuevos)
Prefijos: **B** = `apps/api/src/modules/storage/preview/`; **W** = `apps/web/src/features/storage/preview/`.

| Módulo / capa | Archivo | Responsabilidad |
|---|---|---|
| M2 / composición | B `index.ts`, `preview.module.ts` | API acotada; `PreviewModule.register({ storageModule, config })` |
| M2 / aplicación | B `application/preview.service.ts`, `application/preview-config.ts` | Actor, tasa independiente, fachada y configuración técnica |
| M2 / presentación | B `presentation/preview.controller.ts`, `presentation/preview-validation.ts` | CLIENT, UUID con Zod público, mapeo aplicación → JSON |
| M2 / dominio | B `domain/preview-errors.ts` | Subtipo de tasa con `TooManyRequestsError` de `shared/domain`; la fachada no importa errores de preview |
| Web / entrada | W `index.ts`, `routes.ts`, `api.ts` | API pública, ruta y cliente JSON autenticado con schema de contracts |
| Web / estado | W `hooks/use-preview.ts`, `preview-failure.ts` | Ciclo cancelable, razones cerradas, descarte de respuestas tardías y liberación |
| Web / composición | W `components/PreviewPage.tsx`, `components/PreviewMenuItem.tsx`, `components/PreviewStates.tsx` | Pantalla, primer ítem público, progreso >2 s y acciones |
| Web / lectores | W `components/PdfPreview.tsx`, `components/ImagePreview.tsx`, `components/TextPreview.tsx` | Páginas PDF, imagen original y texto literal |
| Web / lectores | W `components/SpreadsheetPreview.tsx`, `components/PresentationPreview.tsx` | Valores por hoja y texto por diapositiva, navegación completa |
| Web / bytes | W `readers/object-bytes.ts` | Helper único de GET/rangos, credenciales omitidas y cancelación; reutilizado por PDF, ZIP e imagen |
| Web / PDF | W `readers/pdfjs-adapter.ts`, `readers/pdf-range-transport.ts`, `readers/pdf-text-reader.ts` | Aislar PDF.js, transporte GET sin credenciales y texto accesible |
| Web / OOXML | W `readers/ooxml-package-reader.ts`, `readers/ooxml-xml-reader.ts`, `readers/ooxml-relations.ts` | ZIP/rangos, SAX incremental y relaciones OPC internas |
| Web / proyecciones | W `readers/xlsx-reader.ts`, `readers/pptx-reader.ts` | Semántica de hojas/celdas y texto visible de diapositivas |
| Web / workers | W `workers/pdfjs.worker.ts`, `workers/ooxml.worker.ts`, `workers/ooxml-protocol.ts` | Entradas locales, mensajes acotados y cancelación; sin URLs/errores crudos en fallos |

### 2.2 Habilitaciones de Adrián / compartidas (conformidad pendiente)
Prefijos: **S** = `apps/api/src/modules/storage/`; **F** = `apps/web/src/features/storage/`; **R** = `apps/web/src/app/(app)/(cliente)/archivos/`.

| Ámbito | Archivo nuevo o cambiado | Responsabilidad propuesta |
|---|---|---|
| Fachada / DI | S `application/storage-preview.facade.ts` (nuevo), `index.ts`, `index.spec.ts`, `storage.module.ts` | Fachada/modelo públicos TS, proveedor y export Nest; Q-2 |
| Resolver y firma (DRY) | S `application/accessible-file-url-issuer.ts` (nuevo, interno, no exportado), `application/file.service.ts` | Extraer de `getDownloadUrl` (:121) «withActor + findAccessibleById + presignDownload» sin tasa ni auditoría; la descarga y la fachada lo reutilizan; comportamiento de 005 intacto |
| Error de formato | S `domain/errors/preview-unsupported.error.ts` (nuevo), `domain/errors/index.ts` | Solo `PreviewUnsupportedError` (422) para `docx`/`otro` (SVG/BMP/HEIC ya son `otro`) |
| Contracts | `packages/contracts/src/storage/preview-schemas.ts`, `preview-schemas.spec.ts` (nuevos), `packages/contracts/src/storage/index.ts` | Schema estricto, códigos y exports existentes hacia raíz `@nimbo/contracts`; reutilizar `FileSummary` |
| Composición API | `apps/api/src/app.module.ts` | Un descriptor de storage importado mediante PreviewModule; binding de configuración |
| Configuración | `apps/api/src/shared/infrastructure/config/env.schema.ts`, `.env.example` | Nueva variable de tasa, entero positivo; coordinación Q-2 |
| Extensión UI | F `index.ts` (nuevo), `components/file-row-menu.tsx`, `components/my-files.tsx`, `components/node-rows.tsx` | Export público y un solo slot `firstAction`, sin imports internos de preview |
| Descarga pública UI | F `hooks/use-file-download.ts` (nuevo) | Hook acotado que reutiliza `useUploads().api.downloadUrl`; wrapper entrega callback al visor sin exponer el manager completo |
| Retorno UI | F `hooks/use-my-files-state.ts` | Enfocar el control de la fila indicada cuando esté en la lista de origen, o el encabezado; sin guardar estado del explorador, Q-6 |
| Rutas | R `vista-previa/[fileId]/page.tsx` (nuevo), `page.tsx`, `carpeta/[folderId]/page.tsx` | Wrappers públicos y retorno por `file.folderId`/raíz con ID de fila; sin provider persistente nuevo |
| Mensajes | `apps/web/src/lib/error-catalog.ts` | Catálogo único por código, expiración/corrupción/protección/indisponibilidad |
| Dependencias | `apps/web/package.json`, `pnpm-lock.yaml` | Versiones exactas §2.4, aceptadas por Adrián (G-3); solo en `apps/web`, usadas en workers; ADR de motores a cargo de architect |

### 2.3 Frontera pública y composición (Q-2)
- Hoy S `index.ts` solo publica límites/módulos y `StorageModule.forRoot` no exporta proveedores: todavía falta la frontera.
- `StoragePreviewFacade.issueUrl(actor, fileId)` → `PreviewDelivery`: proyección mínima de archivo compatible con `FileSummary`, `url`, `expiresAt: Date`; sin MIME, entidad, repositorio ni clave como campo público.
- Proyección de aplicación `file`: `id`, `name`, `kind`, `folderId`, `sizeBytes: bigint`, `createdAt: Date`, `updatedAt: Date`; exportada con `PreviewDelivery` desde S `index.ts`, sin dependencia de DTO HTTP en la fachada.
- La fachada rechaza `docx`/`otro` con `PreviewUnsupportedError` y delega en `AccessibleFileUrlIssuer` (extraído de `FileService.getDownloadUrl`): `withActor`, `accessibleNodes`/`findAccessibleById` y `IObjectStorage.presignDownload` tal cual. `INodeRepository` no se ensancha; no hay consulta de procedencia.
- Ajeno/inexistente → 404 existente (`STORAGE_NODE_NOT_FOUND`); fallo al firmar → error operativo saneado del filtro, sin `message`/`stack`/`cause` ni URL en logs. Preview propaga, sin capturar datos privados.
- `PreviewService` y fachada deniegan internos también en invocación directa; solo archivos vivos autorizados. La tasa `storage:preview-url:` vive en `PreviewService` (T-03); el issuer no tiene tasa ni auditoría.
- Sin cambios en `IObjectStorage`: `presignDownload` (300 s, `attachment`, `application/octet-stream`, `no-store`) sirve a ambos flujos.
- Raíz: una llamada `StorageModule.forRoot(env)`; pasar ese descriptor a `PreviewModule.register`. `AppModule` importa PreviewModule, sin import redundante de storage. Storage no importa ni reexporta preview: evita ciclo TS/Nest y doble instancia.
- Fachada concreta, sin puerto artificial entre carpetas de M2 ni invocar V.2(d). Adaptadores de librerías por V.2(a). El issuer es extracción DRY de código existente (descarga + preview), no abstracción nueva con interfaz.
- Se mantienen las aristas de M2 hacia `shared`/`access`; no nuevas dependencias de billing/editing/intelligence, Registry, Factory ni clase base por formato.
- **Nota histórica (2026-10-20, merge de `main` en la rama):** tras integrar la spec 014, `FileService.getDownloadUrl` dejó de reutilizar `AccessibleFileUrlIssuer` porque la descarga ahora firma también versiones retenidas (`versionId`); `StoragePreviewFacade` sigue usando el issuer. Con 009/011/016, `AppModule` importa además el mismo descriptor de `storage` que comparten `billing`, `backoffice`, `editing` y `PreviewModule` (sigue habiendo una sola instancia). Esta evolución posterior no cambia los CA de la 017 ni el estado de T-02.
- Reutilizar `AuthFetch`, `ApiClientError` (con `Retry-After`), `SessionGate`, `RequireRole`, `AppLayout`, `StateView`, `Button`, `Alert`, `FileTypeChip` y tokens Cielo Sereno. F `index.ts` nuevo publica `MyFiles`, `locationPath`, `useFileDownload`; wrappers consumen F/W públicos y pasan `downloadUrl(fileId)` al visor.
- El cliente JSON de preview conserva `ApiClientError`: `StorageRequestError` actual pierde `Retry-After`. Ningún cliente autenticado de Nimbo se usa para descargar bytes del objeto.

### 2.4 Motores seleccionados (Q-4 resuelta técnicamente)
| Dependencia directa web | Versión / licencia / compatibilidad declarada | Decisión y trade-off |
|---|---|---|
| `pdfjs-dist` | `6.4.299`, Apache-2.0; ESM/types; Node `>=22.13.0 \|\| >=24` | API PDF.js directa, sin wrapper React ni iframe que delegue acciones/errores al navegador |
| `@zip.js/zip.js` | `2.23.0`, BSD-3-Clause; ESM/CJS/types; Node `>=18` | ZIP por rangos y salida incremental; evita entrada completa de JSZip/SheetJS y ZIP artesanal |
| `saxes` | `6.0.0`, ISC; CJS/types; Node `>=12.22.7`, depende de `xmlchars` | SAX con namespaces; ya transitiva vía jsdom en lock, debe declararse directa para este uso |

- `.nvmrc`/engines usan Node 22; versión local observada `v22.23.3` satisface los mínimos. Esto no acredita build/worker/browser; verificación prevista §6. Metadata/API fijadas en fuentes §7.
- PDF, ZIP e imagen reutilizan un único helper W `readers/object-bytes.ts`: GET con `credentials: 'omit'`, sin Authorization, Cookie ni cabeceras de Nimbo, propagando AbortSignal. Para rango exige 206 y Content-Range válido; cancela respuestas inválidas y no permite fallback implícito a descarga completa.
- El helper centraliza esta política y sus pruebas en T-07; los adaptadores PDF.js/zip.js y el lector de imagen solo consumen su resultado, sin reimplementarla. T-08a/T-09a dependen del helper de T-07.
- PDF: `getDocument`, `numPages`, `getPage`, `render` a canvas y `TextLayer` pública. Worker de `build/pdf.worker.mjs` de la misma versión, empaquetado local; cMaps, fuentes, WASM/ICC locales, sin CDN.
- Motor/worker se cargan solo en la ruta cliente del visor; bundler empaqueta los recursos del paquete fijado. No cargar PDF.js durante SSR ni sustituir el worker por una versión remota.
- Solo apariencias estáticas: sin viewer, scripting manager/sandbox, controladores de acciones/formularios ni AnnotationLayer interactiva; `enableXfa: false`. No proponer `isEvalSupported` inexistente en esta versión ni `enableScripting` como opción de `getDocument`.
- `withCredentials: false` usa `same-origin`, no `omit`: `PDFDataRangeTransport` público delega al helper único; longitud por GET `Range: bytes=0-0`, validada allí, no HEAD de una firma GET.
- PDF con `disableStream: true`, `disableAutoFetch: true`, `stopAtErrors: true`, rangos bajo demanda; sin descargar todo antes de abrir. `TextLayer` limita silenciosamente 100000 textDivs: añadir bloques literales desde `streamTextContent`, evitando pérdida accesible. Escaneados se ven en canvas, sin OCR.
- `requestDataRange` devuelve void: el adaptador comunica fallos saneados al estado del visor y destruye tarea/peticiones, no espera un callback `onError` inexistente. `VerbosityLevel.ERRORS` suprime warn/info; capturar rechazos, sin consola/telemetría con datos o excepciones crudas.
- OOXML (D1): subclase de la API pública `Reader` de zip.js; `init()` obtiene el tamaño con `Range: bytes=0-0` y `readUint8Array(index, length)` pide cada rango exacto, ambos mediante el helper único, sin repetir la política de credenciales, validación de rango ni AbortSignal; sin `HttpRangeReader`, HEAD ni fetch propio. Costos aceptados: una petición `0-0` previa a la lectura del final del ZIP (que `HttpRangeReader` podría combinar) y consistencia del objeto por `totalLength` entre rangos, sin ETag, igual que el transporte PDF.
- `getEntriesGenerator` y `FileEntry.getData(WritableStream, { checkCrc32: true, signal })`, tras distinguir directorios/archivos, alimentan TextDecoder/SAX; no inventar una opción `credentials` del lector ni ocultar partes inválidas con llamada opcional.
- Un worker OOXML propio; `configure({ useWebWorkers: false })` evita workers anidados. Backpressure, XML secuencial, decodificación UTF-8/UTF-16 y continuidad de caracteres/surrogates entre chunks.
- SAX `xmlns: true`, namespaces Strict/Transitional sin depender de prefijos; no DOM del XML completo, abortar al primer error, rechazar DTD/entidades no admitidas, rutas inválidas y partes duplicadas/ambiguas.
- Relaciones OPC solo internas: sin fetch externo, macros, eval ni hipervínculos activos. Proyecciones estrechas de lectura, sin conversores cloud/proxy ni ONLYOFFICE para 017.
- Ventana/unidad activa, liberar anteriores; shared strings solo necesarias para la ventana mediante relecturas, sin tabla completa obligatoria. Todas las páginas/hojas/diapositivas siguen navegables; no límite nuevo ni truncamiento silencioso.
- Imagen: bytes del helper único, Blob/object URL y decodificador nativo del formato permitido; liberar URL al terminar, sin transformación backend ni optimizador Next.
- TXT/MD: `TextDecoder` UTF-8 incremental y bloques de texto escapado navegables; nunca HTML/Markdown renderer ni `dangerouslySetInnerHTML`, sin cargar todo obligatoriamente ni cortar contenido.
- Una falla de decode/rangos/worker informa causa saneada; no simular documento vacío ni éxito parcial. Orden y navegación de unidades proceden del documento, no del nombre de entradas ZIP.

### 2.5 Navegación y retorno (Q-6)
- Un solo slot: `FileRowMenuProps.firstAction?: ReactNode` en `file-row-menu.tsx`, sin captura de estado del explorador (se descarta `renderFirstFileAction`). Wrappers de Adrián conectan `PreviewMenuItem`, sin dependencia inversa de storage hacia preview.
- Primer ítem solo para kinds admitidos; API valida independientemente. Volver usa `locationPath(file.folderId)` e ID de fila; wrappers pasan solo ese objetivo de foco al explorador, nunca sus internos/hooks ni un `returnTo` arbitrario.
- Volver abre la carpeta de origen (file.folderId, o la raíz si no hay) y enfoca el control de esa fila cuando sigue en la lista. Si la fila ya no está, el foco va al encabezado del explorador. No se guarda orden, paginación, desgloses ni overlays de carga. No se persiste la URL firmada ni el contenido.
- Esperar el listado de destino antes de resolver el foco; no buscar páginas adicionales ni reconstruir estado previo. Si se pierde acceso, borrar datos privados y conservar los estados existentes de error/no encontrado.
- Ruta sin datos privados en Server Components antes de `RequireRole`. Mockup `docs/design/mockups/storage/vista-previa/` aún inexistente: lo entrega Adrián, todos los estados de spec §6, 360/1440 px; P-3 no se reabre.

## 3. Datos
- Sin migración, tablas, columnas, índices ni `tipo_mime` (RN-6). Se reutilizan PK/índices y RLS (`ENABLE`/`FORCE`) existentes de archivo/versión; no se amplían permisos.
- El lector se elige por `archivo.tipo`/`kind` del `FileSummary`; no se consulta la carga ni el nombre original. Si el contenido no coincide con el kind (p. ej. a.pdf→a.png), el lector falla al decodificar: «corrupto» + Descargar (fallo seguro, CA-2).
- Autorización idéntica a la descarga: dentro de `withActor`, `findAccessibleById` filtra con `accessibleNodes(actor)` antes de leer. Inexistente o ajeno → 404; sin estado «fuente incoherente».
- 014/021 (futuras versiones por restauración/edición) no requieren procedencia: la URL firma la versión actual con la misma política que la descarga.
- Bytes dominio/BD `bigint`; JSON conserva la representación de `FileSummary`.

## 4. Contratos
Contratos definidos; Q-2 aceptada con ajuste DRY; sin alterar la descarga.

| Método | Ruta | Rol | Request → Respuesta | Errores (`code`) |
|---|---|---|---|---|
| POST | `/api/v1/files/:fileId/preview-url` | CLIENT | UUID; sin parámetros MIME/clave/disposición → 200 `PreviewUrlResponse` | 401 `SHARED_UNAUTHENTICATED`; 403 `SHARED_FORBIDDEN`; 404 `STORAGE_NODE_NOT_FOUND`; 429 `STORAGE_TOO_MANY_REQUESTS`; 422 `STORAGE_PREVIEW_UNSUPPORTED` |
| POST existente | `/api/v1/files/:fileId/download-url` | CLIENT | Sin cambios → `DownloadUrlResponse` | Contrato de 005 |
| GET / Range (`fetch`) | URL firmada de objetos | Credencial temporal | Un objeto → bytes originales, 200/206; `attachment`, `application/octet-stream`, `no-store` | Red/CORS/caducidad no son 401 de sesión Nimbo |

- Schema zod estricto separado `PreviewUrlResponse` = `{ file: FileSummary, url, expiresAt }` (sin `mime`); `expiresAt` ISO UTC por `IClock`, 300 s y URL absoluta del origen autorizado. Clave no sale como campo independiente; URL solo en cuerpo autorizado.
- Reutilizar `fileSummarySchema` de contracts para los campos públicos; respuesta basada en consulta actual, no en nombre/metadatos recordados por el menú. Secretos del firmador permanecen en backend.
- UUID inválido igual a inexistente: 404; shape común `{ code, message, correlationId, fields?, details? }`. Formato excluido → 422; fallo del firmador o dependencia → error operativo saneado del filtro (sin código propio de preview).
- Q-7 resuelta: `PreviewFailure` local con razones `protected/corrupt/unavailable/expired/cancelled`; catálogo web de mensajes por `STORAGE_PREVIEW_PASSWORD_PROTECTED`, `STORAGE_PREVIEW_CORRUPT`, `STORAGE_PREVIEW_UNAVAILABLE`, `STORAGE_PREVIEW_EXPIRED` (razones del cliente, no códigos HTTP de la API); cancelación silenciosa, sin SDK/parser/stack crudo.
- Fallos CA-2 ofrecen Reintentar y Descargar con causa saneada; vacío válido sin unidades: «Este archivo no tiene contenido para mostrar.» y Descargar. No confundir TXT blanco o imagen con cero páginas; 005 rechaza cero bytes.
- PDF `onPassword`: detener, informar protección, sin pedir contraseña/desbloquear. ZIP cifrado y marcadores OOXML explícitos de contraseña → protegido; restricciones sin contraseña no se etiquetan así. CFB cifrado ya lo rechaza 005: no relajar carga ni añadir helper sin necesidad.
- XLSX: orden de hojas por relaciones, strings/tipos y valores cacheados `<v>` como datos; fórmula sin cache muestra «Sin valor guardado» y explicación informativa, sin cálculo ni cero inventado.
- PPTX: orden de relaciones de presentación; texto visible de shapes, grupos, tablas, campos y placeholders de layout/master cuando corresponda, no solo `a:t`; sin notas, animaciones ni resolución externa. ZIP/XML arbitrario inválido no cuenta como vacío válido.
- Reintento solo manual, sin temporizador/loop de reemisión: reautorizar por API y destruir render anterior para no mezclar versiones. 401 de API usa la única renovación existente de AuthFetch; 403 del objeto caducado muestra expiración, nunca renueva sesión.
- Reemisión con 403/404 de API elimina nombre/contenido recordados y muestra sin permiso/no encontrado; Descargar sigue sujeto a autorización de 005. Eventos / Socket.IO: no aplica.

## 5. Seguridad y operación
- Actor exclusivamente del token; `@Roles(Role.CLIENT)`, sin `@Public()`. Defensa directa en ambos servicios; filtro previo/RLS y `nimbo_app` no dueño, sin SUPERUSER/BYPASSRLS; ajeno e inexistente indistinguibles.
- Solo archivos vivos según política actual; no preview de papelera, compartición nueva ni acceso anónimo. Personal/solo lectura no bloquean preview por razones comerciales (CA-6, futura 010).
- Q-5 resuelta: `RATE_LIMIT_PREVIEW_URL_PER_MINUTE`, entero positivo, default técnico **120**, ventana **60 s** por actor; clave `storage:preview-url:${actor.id}`, independiente de download.
- Justificación verificable: `env.schema.ts` default download 120; `file.service.ts` ventana 60 s. Misma operación de emisión local de URL como punto inicial, configuración independiente para ajustar; no cuota comercial ni número de catálogo hardcoded.
- `IRateLimiter` antes de buscar archivo, como 005 (sin oráculo); rechazo no suma según contrato existente. Redis indisponible falla cerrado; subtipo propio de `TooManyRequestsError` público, código/`Retry-After` del filtro existente, sin copiar fábricas internas de storage.
- Mensaje 429 de CA-12: «Hiciste demasiadas solicitudes. Espera un momento e inténtalo de nuevo.»; no retries automáticos que vuelvan a consumir emisiones durante la espera.
- Pino: `preview.url_issued`, `preview.url_failed`, `preview.rate_limited`, con `correlationId`, UUID y motivo/código cerrado. Nunca contenido, nombres, contraseña, token, clave ni firma; no mensajes/stacks crudos con URL incrustada ni auditoría como descarga.
- URL/contenido solo en memoria: sin localStorage, navegación, telemetría ni caché persistente. Liberar peticiones, workers, canvases, buffers y object URLs al salir/cambiar/reintentar/logout; evitar optimizador/proxy Next para imágenes.
- GET de objetos mediante el helper único de §2.4, sin Bearer, Cookie, correlationId/headers Nimbo ni `no-cors`; PDF, ZIP e imagen no repiten esa política. HEAD no reutiliza firma GET.
- Q-8 resuelta por configuración/fuentes: `compose.yml:40–48` fija MinIO `RELEASE.2025-09-07T16-13-09Z`; `infra/minio/Dockerfile.local` compila esa versión. No se propone middleware Traefik, CORS de bucket ni configuración nueva automática.
- MinIO `addCustomHeadersMiddleware` fija `X-Content-Type-Options: nosniff` y está en `globalMiddlewares`; `corsHandler` permite GET/HEAD/OPTIONS, Range y expone Accept-Ranges/Content-Range/Content-Length/ETag; `setCommonHeaders`/`setObjectHeaders` acreditan bytes/206 [M1–M4].
- `MINIO_API_CORS_ALLOW_ORIGIN` usa la allowlist existente `CORS_ORIGIN`, sin `*` de origen. `AllowCredentials` de MinIO no obliga a enviar credenciales con `omit`; comodines de headers existentes no son comodines de origen.
- `session-cookies.ts` mantiene cookies host-only, sin Domain y paths de auth; puertos locales distintos no aíslan cookies por sí solos. Fetch `omit` y hosts separados previstos para staging mantienen la separación; no afirmar despliegue/probe realizado.
- Verificación futura browser: origen permitido/denegado, preflight, GET completo/206, headers expuestos, ausencia de Cookie/Bearer/Set-Cookie y de proxy de bytes. Si el despliegue difiere, bloqueo de implementación para Adrián, no pregunta técnica genérica abierta.
- MinIO/Postgres/Redis reutilizan health de storage/shared; fallo de preview no bloquea navegación/cargas/descargas. Sin cola, caché de contenido ni métricas nuevas no declaradas en spec.
- La firma local no inspecciona contenido ni acredita integridad visual: contraseña, corrupción y contenido incoherente con el `kind` se detectan en el navegador.
- La URL de vista lleva la misma disposición forzada de 005; `inline`/MIME no se usan porque el navegador no navega a la URL (IX.7 literal). `nosniff` lo sigue sirviendo MinIO. Los fallos operativos se traducen sin exponer causas privadas como errores 500 crudos.

## 6. Estrategia de pruebas (por riesgo)
Lógica con prueba primero, nombres `CA-n`, cobertura de negocio ≥60 %; integración/aislamiento con Postgres/Redis/MinIO reales, nunca mocks. No repetir el mismo CA completo en tres capas.
Prefijos: **I** = `apps/api/test/int/storage/`; **A** = `apps/api/test/isolation/`; B/W como §2. Rutas ajenas requieren coordinación.

| CA / riesgo | Nivel | Archivo propuesto o regresión existente |
|---|---|---|
| CA-1/2: OOXML semántico, literal UTF-8, corrupto/protegido/vacío, cache de fórmulas | unit lectores | W `readers/preview-readers.spec.ts`; fixtures sintéticos Strict/Transitional, texto visible heredado y XML/ZIP hostil |
| CA-6/11: roles directos, exclusiones, tasa y ausencia de control comercial | unit reglas | B `application/preview.service.spec.ts`; S `application/storage-preview.facade.spec.ts`, `accessible-file-url-issuer.spec.ts` |
| Endpoint: feliz + error principal, schema/errores | int + contrato | I `preview.int-spec.ts`; `packages/contracts/src/storage/preview-schemas.spec.ts` |
| CA-3/4/5: 401, internos 403, ajeno=inexistente, actor directo/RLS de carga y versiones | iso bloqueante | A `storage-preview.iso-spec.ts`; cuentas casi idénticas, roles reales, contexto ausente y contaminación del pool |
| CA-8/11: firma idéntica a descarga (`attachment`/`octet-stream`/`no-store`), TTL 300, un objeto, manipulación, descarga 005 intacta y sin auditoría en preview | int MinIO/Postgres | I `preview-delivery.int-spec.ts`; regresión `download.int-spec.ts`, `minio-storage.adapter.int-spec.ts` |
| CA-11 / RNF-05/10: frontera TS/Nest y única instancia | int/composición | I `preview-composition.int-spec.ts`; S `index.spec.ts` |
| CA-10/12: logs saneados, Redis caído, tasa por actor/contador separado, Retry-After | int Redis | I `preview-operation.int-spec.ts` |
| CA-11: política GET/rangos/AbortSignal centralizada y consumo por PDF/ZIP/imagen | unit helper/adaptadores | W `readers/object-bytes.spec.ts`, specs de adaptadores; helper T-07, consumidores T-08a/T-09a |
| CA-2/9: estados/acciones, espera >2 s, accesibilidad teclado | web | W `components/PreviewPage.spec.tsx`, `components/PreviewStates.spec.tsx`; temporizadores falsos |
| CA-1/7/9/11 y spec §6: PDF real, todas las unidades, retorno/foco, carga concurrente, red/CORS/axe | e2e demo | `e2e/storage-preview.e2e.ts`; canvas/decodificadores reales, 360/1440 px |

- Matriz PDF/XLSX/PPTX/TXT/MD/PNG/JPG/JPEG/GIF/WebP; DOCX/otro/SVG/BMP/HEIC sin emisión; contenido renombrado entre formatos (a.pdf→a.png) falla como «corrupto» con Descargar. PDF escaneado/JavaScript/protegido y formularios estáticos, sin fiarse de mocks de canvas.
- Cancelación, respuesta tardía, logout, URL caducada y acceso revocado al reemitir; rechazo de referencias externas/DTD/partes duplicadas y protección vs cifrado. No relajar 005 para fixtures de formatos rechazados.
- Browser acredita CORS/cookies/rangos, que Node GET no prueba; recursos grandes representativos y navegación entre ventanas evidencian riesgo §7 sin prometer 2 GB. TTL breve/reloj y espera del harness, sin sleep fijo de cinco minutos.
- En implementación: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:int`, `pnpm test:isolation`, `pnpm test:e2e`, `pnpm env:check`; verificar build/worker local sin CDN.
- PD-41 sigue abierto: `test:e2e` marcador no acredita Playwright/axe; coordinar arnés real con Adrián. Esta revisión documental no ejecuta ni declara aprobadas esas suites.

## 7. Riesgos y coherencia con el diseño
- **H-1 — Ownership/DI (Alta propuesta):** falta frontera pública suficiente y extensión UI. Diseño §2 aceptado por Adrián (Q-2/Q-6) con ajustes; sin imports internos ni segundo MinIO. Registrado como DF-84 en `design-findings.md` (Aceptado).
- **H-2 — retirado.** Existía solo por el MIME/procedencia; la opción 4 elimina ambos. No queda residuo: el desfase 006 (UI fija sufijo, backend permite renombrar) ya no afecta a preview, pues el lector falla seguro.
- **Memoria:** rangos no garantizan memoria acotada: PDF.js reserva Uint8Array del largo del documento; zip.js puede almacenar directorio central completo; saxes acumula tokens/atributos sin tope intrínseco; imágenes/canvas/XML hostil añaden expansión. No se garantiza viabilidad hasta 2 GB por seleccionar librerías.
- Un archivo admitido por la carga puede agotar la memoria del visor. Ese fallo es CA-2: causa saneada y Descargar. No se agrega un límite de tamaño distinto del de la 005.
- Mitigar con unidades/ventanas, relecturas, backpressure, workers y cancelación/liberación. Ante fallo de recursos, causa saneada CA-2 + Descargar, nunca truncamiento/límite inventado. Architect evalúa este riesgo al aceptar Q-4; prueba de viabilidad durante implementación, no resultado supuesto.
- **Tiempo:** dependencias nuevas y habilitaciones ajenas amenazan ≤3 días; avisar a Adrián según workflow. Un recorte/división requiere decisión y actualización de spec, no reducir CA unilateralmente.
- DF-15 queda parcial al aceptar `PreviewService`; fachada/controlador deben reflejarse en M2; sin cambio de puertos ni E-R. Architect registra H-1/H-2 y pendientes de habilitación/documentación cuando tenga permisos; ninguna aceptación se inventa aquí.
- Dueños históricos y posible `tipo_mime` de design-model/DF-60 no prevalecen sobre backlog/RN-6. PD-46 cubre redibujado existente; PD-49/52 son cabeceras transversales, no resueltas por este plan.
- ADR: [ADR-0027](../../docs/adr/0027-inline-solo-en-previsualizacion-aislada.md) Rechazado (lo actualiza architect); PD-129 ya no es necesario. El ADR de motores de previsualización lo redacta architect. Este plan no escribe ADR.

| ID | Estado técnico | Lo pendiente para aprobación / responsable |
|---|---|---|
| Q-1 | `[RESUELTA]` por opción 4 (2026-10-06) | IX.7 se respeta literalmente; ADR-0027 Rechazado; sin G-1 ni PD-129 |
| Q-2 | `[RESUELTA]` aceptada con ajuste DRY | Fachada delgada + `AccessibleFileUrlIssuer` extraído de `FileService`; tasa en `PreviewService`; sin ensanchar `INodeRepository` |
| Q-3 | Eliminada | Sin procedencia, índice ni migración |
| Q-4 | `[RESUELTA]` aceptada por Adrián (G-3) | `pdfjs-dist@6.4.299`, `@zip.js/zip.js@2.23.0`, `saxes@6.0.0`; architect redacta el ADR de motores y evalúa el riesgo de memoria |
| Q-5 | `[RESUELTA]` tasa §5 | Default 120/60 s respaldado por 005; binding/schema en T-01 |
| Q-6 | `[RESUELTA]` aceptada con ajuste | Un solo slot `firstAction`; retorno por `file.folderId`/raíz y foco de fila o encabezado; mockup lo entrega T-05 (ui-designer) |
| Q-7 | `[RESUELTA]` contratos/semántica §4 | Códigos, reintento manual, cache ausente/protección definidos; aprobación general del plan |
| Q-8 | `[RESUELTA]` configuración/fuentes §5 | Pruebas de despliegue son verificación de implementación, no condición técnica pendiente del plan |

Fuentes técnicas fijadas (investigación de metadata/API/código; no prueba runtime):
- Frontera/tasa: S `index.ts`, `storage.module.ts`, `application/file.service.ts`; `shared/infrastructure/config/env.schema.ts` (default download 120).
- Descarga reutilizada: S `application/file.service.ts` (:121 `getDownloadUrl`), `domain/file-kind.ts` (SVG/BMP/HEIC → `otro`).
- UI: F `components/file-row-menu.tsx`, `hooks/use-my-files-state.ts`; `packages/contracts/src/storage/schemas.ts`. MinIO local: `compose.yml:40–48`, `infra/minio/Dockerfile.local`; cookies: `identity/presentation/session-cookies.ts` en API.
- PDF.js: [metadata](https://unpkg.com/pdfjs-dist@6.4.299/package.json), [API/types](https://unpkg.com/pdfjs-dist@6.4.299/types/src/display/api.d.ts), [build/transport/TextLayer](https://unpkg.com/pdfjs-dist@6.4.299/build/pdf.mjs), [asignación del documento](https://github.com/mozilla/pdf.js/blob/v6.4.299/src/core/chunked_stream.js).
- ZIP: [metadata](https://unpkg.com/@zip.js/zip.js@2.23.0/package.json), [tipos públicos](https://unpkg.com/@zip.js/zip.js@2.23.0/index.d.ts), [lectores HTTP](https://unpkg.com/@zip.js/zip.js@2.23.0/lib/core/io.js); SAX: [metadata](https://unpkg.com/saxes@6.0.0/package.json), [README](https://unpkg.com/saxes@6.0.0/README.md).
- MinIO fijado: [M1 nosniff](https://github.com/minio/minio/blob/RELEASE.2025-09-07T16-13-09Z/cmd/generic-handlers.go), [M2 middleware](https://github.com/minio/minio/blob/RELEASE.2025-09-07T16-13-09Z/cmd/routers.go), [M3 CORS](https://github.com/minio/minio/blob/RELEASE.2025-09-07T16-13-09Z/cmd/api-router.go), [M4 rangos](https://github.com/minio/minio/blob/RELEASE.2025-09-07T16-13-09Z/cmd/api-headers.go).

## 8. Aprobación
- `architect`: redacta el ADR de motores de previsualización (Q-4) y actualiza ADR-0027 a Rechazado. No hay puerto nuevo ni cambio de arquitectura.
- Adrián: **Aprobado** spec y plan (2026-10-06). El 2026-10-06 aceptó G-1 (opción 4: sin `inline`/MIME, IX.7 literal), G-2 (Q-2/Q-6 con ajustes; Q-3 eliminada) y G-3 (dependencias de Q-4).
- **G-0 — Revisión conjunta:** cumplida con la aprobación de Adrián. Verificaciones de despliegue (CORS/rangos) siguen como dependencias de implementación (T-04/T-10).
- Se mantiene la aprobación de PR antes del merge.

### Registro de cambios
| Fecha | Cambio / motivo | Aprobación |
|---|---|---|
| 2026-10-06 | Borrador inicial: ocho preguntas, fronteras insuficientes y hallazgos locales H-1/H-2 | Pendiente |
| 2026-10-06 | Revisión profunda Q-1…Q-8: fachada/DI, procedencia e índice reversible, motores fijados, tasa, retorno, errores y evidencia MinIO; separar decisiones técnicas de aceptación/ownership y documentar G-0 | Pendiente de equipo / architect / Adrián según compuerta |
| 2026-10-06 | Ajustes documentales de revisión: helper único de bytes; procedencia interna sin ampliar `INodeRepository`; retorno exacto de spec; revisión conjunta con tasks; subtareas T-08a/b y T-09a/b y fallo de memoria CA-2 | Pendiente; no autoriza /implement |
| 2026-10-06 | Registrar aprobación de spec + plan (G-4) | Adrián |
| 2026-10-06 | Opción 4: URL de vista con política de 005 (`presignDownload`), sin `inline`/MIME/procedencia/índice/migración/503; fachada delgada + extracción DRY; un slot `firstAction`; Q-1 resuelta, Q-3 eliminada, H-2 retirado; G-1/G-2/G-3 aceptadas | Adrián |
| 2026-10-18 | D1 (revisión de T-09a): OOXML usa la API pública `Reader` de zip.js con todos los rangos delegados a `fetchObjectBytes`; reemplaza la referencia previa a `HttpRangeReader` en §2.4 y registra sus costos aceptados | Matul |
