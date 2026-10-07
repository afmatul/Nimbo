# Plan 017 — Previsualización

> Spec: [spec.md](./spec.md) · Plan **Propuesto; aprobación pendiente** · 2026-10-06.
> Planner, Modo 2: diseño técnico, sin autorización de implementación. Spec revisada por Matul,
> sin `[ABIERTA]` en §8; aprobación de Adrián pendiente. Q-1…Q-8 distinguen resolución técnica de aceptación.
> Escritura autorizada solo en `specs/**`: H-1/H-2 siguen locales, pendientes de registro oficial DF/PD,
> sin reservar números ni presumir acuerdos. Los archivos de implementación enumerados son propuestas.

## 1. Resumen técnico
El navegador solicita una URL autenticada y lee el objeto directamente desde el origen aislado de MinIO.
`PreviewService` recibe `actor: Actor`, limita emisiones y consume `StoragePreviewFacade`, propuesta al dueño.
La fachada autoriza dentro de la consulta y firma la versión actual: 300 s, un objeto, `inline`, MIME validado y `no-store`.
El MIME procede del catálogo 005 usando el nombre original de su carga completada, ligado inequívocamente a esa versión.
PDF usa PDF.js; XLSX/PPTX, ZIP por rangos y XML incremental en worker; imágenes y TXT/MD, APIs nativas.
Pantalla propia, solo lectura, todas las unidades navegables, sin OCR, conversión backend ni nueva versión.
La descarga conserva `attachment` / `application/octet-stream`; preview no consume su contador ni su auditoría.
Trazabilidad: RF-27; RF-05/09; RNF-05/06/07/09/13/14/17; 017 CA-1…12; 005 CA-13…17/19; 003 D-1/2/6/7/9; 006 CA-4/12/26; 007.
Base: ADR-0005/0008/0010/0014/0015/0020/0023 aceptados; ADR-0025 Propuesto / PD-69 Abierto.

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
| Web / PDF | W `readers/pdfjs-adapter.ts`, `readers/pdf-range-transport.ts`, `readers/pdf-text-reader.ts` | Aislar PDF.js, transporte GET sin credenciales y texto accesible |
| Web / OOXML | W `readers/ooxml-package-reader.ts`, `readers/ooxml-xml-reader.ts`, `readers/ooxml-relations.ts` | ZIP/rangos, SAX incremental y relaciones OPC internas |
| Web / proyecciones | W `readers/xlsx-reader.ts`, `readers/pptx-reader.ts` | Semántica de hojas/celdas y texto visible de diapositivas |
| Web / workers | W `workers/pdfjs.worker.ts`, `workers/ooxml.worker.ts`, `workers/ooxml-protocol.ts` | Entradas locales, mensajes acotados y cancelación; sin URLs/errores crudos en fallos |

### 2.2 Habilitaciones de Adrián / compartidas (conformidad pendiente)
Prefijos: **S** = `apps/api/src/modules/storage/`; **F** = `apps/web/src/features/storage/`; **R** = `apps/web/src/app/(app)/(cliente)/archivos/`.

| Ámbito | Archivo nuevo o cambiado | Responsabilidad propuesta |
|---|---|---|
| Fachada / DI | S `application/storage-preview.facade.ts` (nuevo), `index.ts`, `index.spec.ts`, `storage.module.ts` | Fachada/modelo públicos TS, proveedor y export Nest; Q-2 |
| Errores de entrega | S `domain/errors/preview-delivery.errors.ts` (nuevo), `domain/errors/index.ts` | `PreviewUnsupportedError` (422), `PreviewUnavailableError` (503), sobre `shared/domain`; errores propios del dueño, sin dependencia hacia preview |
| Procedencia | S `application/ports/i-node.repository.port.ts`, `infrastructure/persistence/typeorm-node.repository.ts` | Consulta interna autorizada de versión/carga; Q-3 |
| Objetos | S `application/ports/i-object-storage.port.ts`, `infrastructure/minio-storage.adapter.ts` | `presignPreview` separado; reutilizar los dos clientes S3 existentes |
| Índice | `apps/api/src/migrations/YYYYMMDDHHmmss-indexar-carga-preview.ts` (nuevo) | Índice parcial no único y `down`; timestamp al implementar, Q-3 |
| Contracts | `packages/contracts/src/storage/preview-schemas.ts`, `preview-schemas.spec.ts` (nuevos), `packages/contracts/src/storage/index.ts` | Schema estricto, códigos y exports existentes hacia raíz `@nimbo/contracts`; reutilizar `FileSummary` |
| Composición API | `apps/api/src/app.module.ts` | Un descriptor de storage importado mediante PreviewModule; binding de configuración |
| Configuración | `apps/api/src/shared/infrastructure/config/env.schema.ts`, `.env.example` | Nueva variable de tasa, entero positivo; coordinación Q-2 |
| Extensión UI | F `index.ts` (nuevo), `components/file-row-menu.tsx`, `components/my-files.tsx`, `components/node-rows.tsx` | Export público, slot opcional inicial y callback, sin imports internos de preview |
| Descarga pública UI | F `hooks/use-file-download.ts` (nuevo) | Hook acotado que reutiliza `useUploads().api.downloadUrl`; wrapper entrega callback al visor sin exponer el manager completo |
| Retorno UI | F `components/storage-return-provider.tsx` (nuevo), `hooks/use-my-files-state.ts`, `hooks/use-folder-contents.ts`, `hooks/use-folder-disclosure.ts` | Memoria de sesión y restauración/revalidación del listado; Q-6 |
| Rutas | R `layout.tsx`, `vista-previa/[fileId]/page.tsx` (nuevos), `page.tsx`, `carpeta/[folderId]/page.tsx` | Provider persistente solo en archivos y wrappers que conectan las APIs públicas |
| Mensajes | `apps/web/src/lib/error-catalog.ts` | Catálogo único por código, expiración/corrupción/protección/indisponibilidad |
| Dependencias | `apps/web/package.json`, `pnpm-lock.yaml` | Versiones exactas §2.4, solo tras aceptación del ADR y revisión architect |

### 2.3 Frontera pública y composición (Q-2)
- Hoy S `index.ts` solo publica límites/módulos y `StorageModule.forRoot` no exporta proveedores: todavía falta la frontera.
- Proponer `StoragePreviewFacade.issueUrl(actor, fileId)` → `PreviewDelivery`: proyección mínima de archivo compatible con `FileSummary`, `url`, `expiresAt: Date`, `mime`; sin entidad, repositorio ni clave como campo público.
- Proyección de aplicación `file`: `id`, `name`, `kind`, `folderId`, `sizeBytes: bigint`, `createdAt: Date`, `updatedAt: Date`; exportada con `PreviewDelivery` desde S `index.ts`, sin dependencia de DTO HTTP en la fachada.
- La fachada usa `withActor`, `accessibleNodes`, `INodeRepository` e `IObjectStorage` dentro del código de Adrián; el controlador mapea fechas/bytes al contrato JSON. Abel no consulta tablas ni copia el catálogo.
- La fachada traduce fallos de fuente/firma a sus errores tipados saneados antes del filtro; nunca importa B `domain/preview-errors.ts`. Preview propaga esos errores, sin capturar/persistir `message`, `stack` o `cause` privados.
- `PreviewService` y fachada deniegan internos también en invocación directa; la consulta solo entrega archivos vivos autorizados.
- Extender `IObjectStorage` con `presignPreview({ key, fileName, mime, expiresInSeconds })`, 300 s; `ResponseContentDisposition: inline`, MIME validado y `ResponseCacheControl: no-store`; `nosniff` lo sirve MinIO (§5).
- Raíz: una llamada `StorageModule.forRoot(env)`; pasar ese descriptor a `PreviewModule.register`. `AppModule` importa PreviewModule, sin import redundante de storage. Storage no importa ni reexporta preview: evita ciclo TS/Nest y doble instancia.
- Fachada concreta, sin puerto artificial entre carpetas de M2 ni invocar automáticamente V.2(d). Extensión del puerto de objetos y adaptadores de librerías justificadas por V.2(a); repositorio existente por V.2(b).
- Se mantienen las aristas de M2 hacia `shared`/`access`; no nuevas dependencias de billing/editing/intelligence, Registry, Factory ni clase base por formato.
- Reutilizar `AuthFetch`, `ApiClientError` (con `Retry-After`), `SessionGate`, `RequireRole`, `AppLayout`, `StateView`, `Button`, `Alert`, `FileTypeChip` y tokens Cielo Sereno. F `index.ts` nuevo publica `MyFiles`, `StorageReturnProvider`, `useExplorerReturn`, `useFileDownload`; wrappers consumen F/W públicos y pasan `downloadUrl(fileId)` al visor.
- El cliente JSON de preview conserva `ApiClientError`: `StorageRequestError` actual pierde `Retry-After`. Ningún cliente autenticado de Nimbo se usa para descargar bytes del objeto.

### 2.4 Motores seleccionados (Q-4 resuelta técnicamente)
| Dependencia directa web | Versión / licencia / compatibilidad declarada | Decisión y trade-off |
|---|---|---|
| `pdfjs-dist` | `6.4.299`, Apache-2.0; ESM/types; Node `>=22.13.0 \|\| >=24` | API PDF.js directa, sin wrapper React ni iframe que delegue acciones/errores al navegador |
| `@zip.js/zip.js` | `2.23.0`, BSD-3-Clause; ESM/CJS/types; Node `>=18` | ZIP por rangos y salida incremental; evita entrada completa de JSZip/SheetJS y ZIP artesanal |
| `saxes` | `6.0.0`, ISC; CJS/types; Node `>=12.22.7`, depende de `xmlchars` | SAX con namespaces; ya transitiva vía jsdom en lock, debe declararse directa para este uso |

- `.nvmrc`/engines usan Node 22; versión local observada `v22.23.3` satisface los mínimos. Esto no acredita build/worker/browser; verificación prevista §6. Metadata/API fijadas en fuentes §7.
- PDF: `getDocument`, `numPages`, `getPage`, `render` a canvas y `TextLayer` pública. Worker de `build/pdf.worker.mjs` de la misma versión, empaquetado local; cMaps, fuentes, WASM/ICC locales, sin CDN.
- Motor/worker se cargan solo en la ruta cliente del visor; bundler empaqueta los recursos del paquete fijado. No cargar PDF.js durante SSR ni sustituir el worker por una versión remota.
- Solo apariencias estáticas: sin viewer, scripting manager/sandbox, controladores de acciones/formularios ni AnnotationLayer interactiva; `enableXfa: false`. No proponer `isEvalSupported` inexistente en esta versión ni `enableScripting` como opción de `getDocument`.
- `withCredentials: false` usa `same-origin`, no `omit`: usar `PDFDataRangeTransport` público con fetch propio, `credentials: 'omit'`, AbortSignal; longitud por GET `Range: bytes=0-0` y `206 Content-Range`, no HEAD de una firma GET.
- PDF con `disableStream: true`, `disableAutoFetch: true`, `stopAtErrors: true`, rangos bajo demanda; sin descargar todo antes de abrir. `TextLayer` limita silenciosamente 100000 textDivs: añadir bloques literales desde `streamTextContent`, evitando pérdida accesible. Escaneados se ven en canvas, sin OCR.
- `requestDataRange` devuelve void: el adaptador comunica fallos saneados al estado del visor y destruye tarea/peticiones, no espera un callback `onError` inexistente. `VerbosityLevel.ERRORS` suprime warn/info; capturar rechazos, sin consola/telemetría con datos o excepciones crudas.
- OOXML: `HttpRangeReader` fuerza rangos; construir opciones tipadas `HttpOptions` con `preventHeadRequest: true`, `useRangeHeader: true`, pasando el fetch público personalizado con `omit`/AbortSignal. Exigir 206 y Content-Range válido y cancelar respuestas inválidas antes de devolverlas al lector: evita fallback implícito a descarga completa.
- `getEntriesGenerator` y `FileEntry.getData(WritableStream, { checkCrc32: true, signal })`, tras distinguir directorios/archivos, alimentan TextDecoder/SAX; no inventar una opción `credentials` del lector ni ocultar partes inválidas con llamada opcional.
- Un worker OOXML propio; `configure({ useWebWorkers: false })` evita workers anidados. Backpressure, XML secuencial, decodificación UTF-8/UTF-16 y continuidad de caracteres/surrogates entre chunks.
- SAX `xmlns: true`, namespaces Strict/Transitional sin depender de prefijos; no DOM del XML completo, abortar al primer error, rechazar DTD/entidades no admitidas, rutas inválidas y partes duplicadas/ambiguas.
- Relaciones OPC solo internas: sin fetch externo, macros, eval ni hipervínculos activos. Proyecciones estrechas de lectura, sin conversores cloud/proxy ni ONLYOFFICE para 017.
- Ventana/unidad activa, liberar anteriores; shared strings solo necesarias para la ventana mediante relecturas, sin tabla completa obligatoria. Todas las páginas/hojas/diapositivas siguen navegables; no límite nuevo ni truncamiento silencioso.
- Imagen: GET directo sin credenciales, Blob/object URL y decodificador nativo del formato permitido; liberar URL al terminar, sin transformación backend ni optimizador Next.
- TXT/MD: `TextDecoder` UTF-8 incremental y bloques de texto escapado navegables; nunca HTML/Markdown renderer ni `dangerouslySetInnerHTML`, sin cargar todo obligatoriamente ni cortar contenido.
- Una falla de decode/rangos/worker informa causa saneada; no simular documento vacío ni éxito parcial. Orden y navegación de unidades proceden del documento, no del nombre de entradas ZIP.

### 2.5 Navegación y retorno (Q-6)
- `FileRowMenuProps.firstAction?: ReactNode` es el slot inicial; `MyFiles.renderFirstFileAction` opcional recibe archivo y `prepareReturn` para construirlo. Capturar retorno al seleccionar, no al renderizar. Wrappers de Adrián conectan `PreviewMenuItem`, sin dependencia inversa de storage hacia preview.
- Primer ítem solo para kinds admitidos; API valida independientemente. La función de retorno pública no expone al visor los internos del listado ni sus hooks.
- Provider de Adrián guarda en RAM de sesión ubicación abierta, orden, cantidad de páginas/cursor, desgloses e ID de control de fila; IDs/metadatos mínimos ya autorizados, nunca referencias DOM, URL/contenido. Renovación de token conserva el estado; logout/fin de sesión lo limpia y recarga completa lo pierde; no basta `router.back()`.
- `returnToOrigin` restaura la ubicación abierta (no necesariamente la carpeta contenedora de una fila desglosada), revalida las páginas/desgloses antes de reutilizarlos y enfoca el trigger de fila tras montarlo.
- Reconciliar también los overlays `withUploaded`/`withOrganized`: descartar metadatos históricos no confirmados por lectura autorizada sin cancelar cargas realmente pendientes. Revalidar páginas por sí solo no impide resucitar una fila eliminada/movida desde `uploadedFiles` persistente.
- Acceso directo/recarga sin contexto: carpeta `file.folderId` autorizada; sin ella, raíz con comportamiento existente de error/no encontrado. Nunca `returnTo` arbitrario ni nombres/firmas en navegación.
- Fila movida/eliminada: no enfocar una fila ficticia; foco al encabezado del explorador y aviso contextual con «Actualizar lista». Si se pierde acceso, borrar datos privados antes del retorno.
- Ruta sin datos privados en Server Components antes de `RequireRole`. Mockup `docs/design/mockups/storage/vista-previa/` aún inexistente: lo entrega Adrián, todos los estados de spec §6, 360/1440 px; P-3 no se reabre.

## 3. Datos
- Sin tablas/columnas nuevas ni `tipo_mime`; sí consulta interna e índice propuesto de Adrián. RN-6 no prohíbe índices.
- El detector 005 devuelve kind/MIME, pero el registro solo conserva kind. `archivo.tipo` y su nombre renombrable no acreditan el subtipo; `carga.nombre` mantiene el nombre original validado e inmutable por los métodos actuales.
- Extender internamente `INodeRepository.findAccessiblePreviewSource(actor, fileId)`: archivo vivo más fuente de versión/carga; la clave/nombre validado permanecen internos, no se exporta este puerto a Abel.
- Consulta dentro de `withActor`: archivo restringido por `accessibleNodes(actor)` antes de recuperar datos; unión exacta `archivo.version_actual_id = version_archivo.id`, `version_archivo.archivo_id = archivo.id` y carga `completada` con `version_id`, `archivo_id`, `propietario_id` y `clave_objeto` coincidentes; filtrar dueño de carga y RLS también allí.
- Obtener MIME mediante `fileKindOf` de la extensión original y comprobar kind contra `archivo.tipo`; excluir DOCX/otro/SVG/BMP/HEIC. No usar fecha más reciente, nombre actual ni fallback por extensión del cliente.
- Separar archivo inaccesible de fuente incompleta mediante lectura limitada al mismo actor: una unión interna que pierda la carga no debe convertir indisponibilidad de un archivo autorizado en inexistencia.
- Archivo inaccesible → 404; autorizado con fuente ausente, múltiple o incoherente → 503 `STORAGE_PREVIEW_UNAVAILABLE`, sin firma ni nombre privado en error. Detectar multiplicidad, no escoger una fila arbitraria.
- Hoy 005 registra versiones de origen carga. Procedencia de futuras 014/021 corresponde a sus dueños; no implementarla anticipadamente ni prometer preview universal si falta fuente.
- Q-3 exige conformidad sobre procedencia/retención de cargas completadas y el desfase 006: UI fija sufijo (CA-4), backend permite cambiarlo. La fuente propuesta resiste incluso PNG→JPEG; corregir rename futuro no repara históricos.
- Índices existentes de carga cubren activas, no completadas por versión; no hay unicidad de `version_id`. Elegir índice parcial **no único**, sin asumir limpieza histórica:
```sql
-- up: propuesta; no se ejecuta durante /plan
CREATE INDEX idx_carga_version_completada
  ON carga (version_id, archivo_id, propietario_id) WHERE estado = 'completada';
-- down
DROP INDEX idx_carga_version_completada;
```
- Reutilizar PK/índices de archivo/versión y políticas `ENABLE`/`FORCE` RLS; no ampliar permisos. Migración reversible nueva, sin editar migraciones integradas. Bytes dominio/BD `bigint`; JSON conserva representación de `FileSummary`.

## 4. Contratos
Contratos propuestos definidos; aceptación de fachada/ownership Q-2/3 pendiente, sin alterar descarga.

| Método | Ruta | Rol | Request → Respuesta | Errores (`code`) |
|---|---|---|---|---|
| POST | `/api/v1/files/:fileId/preview-url` | CLIENT | UUID; sin parámetros MIME/clave/disposición → 200 `PreviewUrlResponse` | 401 `SHARED_UNAUTHENTICATED`; 403 `SHARED_FORBIDDEN`; 404 `STORAGE_NODE_NOT_FOUND`; 429 `STORAGE_TOO_MANY_REQUESTS`; 422 `STORAGE_PREVIEW_UNSUPPORTED`; 503 `STORAGE_PREVIEW_UNAVAILABLE` |
| POST existente | `/api/v1/files/:fileId/download-url` | CLIENT | Sin cambios → `DownloadUrlResponse` | Contrato de 005 |
| GET / Range | URL firmada de objetos | Credencial temporal | Un objeto → bytes originales, 200/206 | Red/CORS/caducidad no son 401 de sesión Nimbo |

- Schema zod estricto separado `{ file: FileSummary, url, expiresAt, mime }`; MIME del catálogo 005, `expiresAt` ISO UTC por `IClock`, 300 s y URL absoluta del origen autorizado. Clave no sale como campo independiente; URL solo en cuerpo autorizado.
- Reutilizar `fileSummarySchema` de contracts para los campos públicos; respuesta basada en consulta actual, no en nombre/metadatos recordados por el menú. Secretos del firmador permanecen en backend.
- UUID inválido igual a inexistente: 404; shape común `{ code, message, correlationId, fields?, details? }`. Formato excluido → 422; falta de procedencia/fallo de firmador o dependencia → 503 tras controles de rol/acceso aplicables.
- Q-7 resuelta: `PreviewFailure` local con razones `protected/corrupt/unavailable/expired/cancelled`; catálogo central de `STORAGE_PREVIEW_PASSWORD_PROTECTED`, `STORAGE_PREVIEW_CORRUPT`, `STORAGE_PREVIEW_UNAVAILABLE`, `STORAGE_PREVIEW_EXPIRED`; cancelación silenciosa, sin SDK/parser/stack crudo.
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
- GET de objetos con `credentials: 'omit'`, sin Bearer, Cookie, correlationId/headers Nimbo ni `no-cors`; misma política en transporte PDF, ZIP y fetch nativo. HEAD no reutiliza firma GET.
- Q-8 resuelta por configuración/fuentes: `compose.yml:40–48` fija MinIO `RELEASE.2025-09-07T16-13-09Z`; `infra/minio/Dockerfile.local` compila esa versión. No se propone middleware Traefik, CORS de bucket ni configuración nueva automática.
- MinIO `addCustomHeadersMiddleware` fija `X-Content-Type-Options: nosniff` y está en `globalMiddlewares`; `corsHandler` permite GET/HEAD/OPTIONS, Range y expone Accept-Ranges/Content-Range/Content-Length/ETag; `setCommonHeaders`/`setObjectHeaders` acreditan bytes/206 [M1–M4].
- `MINIO_API_CORS_ALLOW_ORIGIN` usa la allowlist existente `CORS_ORIGIN`, sin `*` de origen. `AllowCredentials` de MinIO no obliga a enviar credenciales con `omit`; comodines de headers existentes no son comodines de origen.
- `session-cookies.ts` mantiene cookies host-only, sin Domain y paths de auth; puertos locales distintos no aíslan cookies por sí solos. Fetch `omit` y hosts separados previstos para staging mantienen la separación; no afirmar despliegue/probe realizado.
- Verificación futura browser: origen permitido/denegado, preflight, GET completo/206, headers expuestos, ausencia de Cookie/Bearer/Set-Cookie y de proxy de bytes. Si el despliegue difiere, bloqueo de implementación para Adrián, no pregunta técnica genérica abierta.
- MinIO/Postgres/Redis reutilizan health de storage/shared; fallo de preview no bloquea navegación/cargas/descargas. Sin cola, caché de contenido ni métricas nuevas no declaradas en spec.
- La firma local no inspecciona contenido ni acredita integridad visual: errores de contraseña/corrupción se detectan en el navegador. Los fallos operativos se traducen sin exponer causas privadas como errores 500 crudos.

## 6. Estrategia de pruebas (por riesgo)
Lógica con prueba primero, nombres `CA-n`, cobertura de negocio ≥60 %; integración/aislamiento con Postgres/Redis/MinIO reales, nunca mocks. No repetir el mismo CA completo en tres capas.
Prefijos: **I** = `apps/api/test/int/storage/`; **A** = `apps/api/test/isolation/`; B/W como §2. Rutas ajenas requieren coordinación.

| CA / riesgo | Nivel | Archivo propuesto o regresión existente |
|---|---|---|
| CA-1/2: OOXML semántico, literal UTF-8, corrupto/protegido/vacío, cache de fórmulas | unit lectores | W `readers/preview-readers.spec.ts`; fixtures sintéticos Strict/Transitional, texto visible heredado y XML/ZIP hostil |
| CA-6/11: roles directos, exclusiones y ausencia de control comercial | unit reglas | B `application/preview.service.spec.ts`; S `application/storage-preview.facade.spec.ts` |
| Endpoint: feliz + error principal, schema/errores | int + contrato | I `preview.int-spec.ts`; `packages/contracts/src/storage/preview-schemas.spec.ts` |
| CA-3/4/5: 401, internos 403, ajeno=inexistente, actor directo/RLS de carga y versiones | iso bloqueante | A `storage-preview.iso-spec.ts`; cuentas casi idénticas, roles reales, contexto ausente y contaminación del pool |
| CA-8/11: MIME tras rename, procedencia ausente/duplicada/incoherente, TTL, manipulación y cabeceras | int MinIO/Postgres | I `preview-delivery.int-spec.ts`; regresión `download.int-spec.ts`, `minio-storage.adapter.int-spec.ts` |
| CA-11 / RNF-05/10: índice up/down, fuente RLS, frontera TS/Nest y única instancia | int/composición | I `preview-source.int-spec.ts`, `preview-composition.int-spec.ts`; S `index.spec.ts` |
| CA-10/12: logs saneados, Redis caído, tasa por actor/contador separado, Retry-After | int Redis | I `preview-operation.int-spec.ts` |
| CA-2/9: estados/acciones, espera >2 s, accesibilidad teclado | web | W `components/PreviewPage.spec.tsx`, `components/PreviewStates.spec.tsx`; temporizadores falsos |
| CA-1/7/9/11 y spec §6: PDF real, todas las unidades, retorno/foco, carga concurrente, red/CORS/axe | e2e demo | `e2e/storage-preview.e2e.ts`; canvas/decodificadores reales, 360/1440 px |

- Matriz PDF/XLSX/PPTX/TXT/MD/PNG/JPG/JPEG/GIF/WebP; DOCX/otro/SVG/BMP/HEIC sin emisión; rename entre subtipos no cambia MIME real. PDF escaneado/JavaScript/protegido y formularios estáticos, sin fiarse de mocks de canvas.
- Cancelación, respuesta tardía, logout, URL caducada y acceso revocado al reemitir; rechazo de referencias externas/DTD/partes duplicadas y protección vs cifrado. No relajar 005 para fixtures de formatos rechazados.
- Browser acredita CORS/cookies/rangos, que Node GET no prueba; recursos grandes representativos y navegación entre ventanas evidencian riesgo §7 sin prometer 2 GB. TTL breve/reloj y espera del harness, sin sleep fijo de cinco minutos.
- En implementación: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:int`, `pnpm test:isolation`, `pnpm test:e2e`, `pnpm env:check`; verificar migración up/down y build/worker local sin CDN.
- PD-41 sigue abierto: `test:e2e` marcador no acredita Playwright/axe; coordinar arnés real con Adrián. Esta revisión documental no ejecuta ni declara aprobadas esas suites.

## 7. Riesgos y coherencia con el diseño
- **H-1 — Ownership/DI (Alta propuesta):** falta frontera pública suficiente y extensión UI. Diseño §2 completo; conformidad Q-2/6 pendiente, sin imports internos ni segundo MinIO. Registro oficial DF/PD pendiente por permisos solo `specs/**`.
- **H-2 — MIME/procedencia (Alta propuesta):** kind agrupado/nombre mutable no prueban subtipo. Propuesta §3 depende de aceptación de Adrián sobre retención/fuentes y desfase 006; no promete cubrir versiones sin procedencia. Registro oficial DF/PD pendiente.
- **Memoria:** rangos no garantizan memoria acotada: PDF.js reserva Uint8Array del largo del documento; zip.js puede almacenar directorio central completo; saxes acumula tokens/atributos sin tope intrínseco; imágenes/canvas/XML hostil añaden expansión. No se garantiza viabilidad hasta 2 GB por seleccionar librerías.
- Mitigar con unidades/ventanas, relecturas, backpressure, workers y cancelación/liberación. Ante fallo de recursos, causa saneada CA-2 + Descargar, nunca truncamiento/límite inventado. Architect evalúa este riesgo al aceptar Q-4; prueba de viabilidad durante implementación, no resultado supuesto.
- **Tiempo:** dependencias nuevas y habilitaciones ajenas amenazan ≤3 días; avisar a Adrián según workflow. Un recorte/división requiere decisión y actualización de spec, no reducir CA unilateralmente.
- DF-15 queda parcial al aceptar `PreviewService`; fachada/controlador, ampliación de puertos e índice deben reflejarse en M2/E-R. Architect registra H-1/H-2 y pendientes de habilitación/documentación cuando tenga permisos; ninguna aceptación se inventa aquí.
- Dueños históricos y posible `tipo_mime` de design-model/DF-60 no prevalecen sobre backlog/RN-6. PD-46 cubre redibujado existente; PD-49/52 son cabeceras transversales, no resueltas por este plan.
- ADR requerido: aceptar ADR-0025 (equipo/PD-69), y ADR de motores/fachada si corresponde, a cargo de architect sin número reservado. Este plan no escribe ADR ni un artefacto adicional de revisión.

| ID | Estado técnico | Lo pendiente para aprobación / responsable |
|---|---|---|
| Q-1 | `[ABIERTA]` aceptación constitucional | Acuerdo de los cuatro integrantes sobre IX.7, registrado en ADR-0025 / PD-69 |
| Q-2 | Diseño definido §2.3; `[ABIERTA]` conformidad | Adrián + architect aceptan fachada/contrato exacto, exports TS/Nest, DI y cambios ajenos/configuración |
| Q-3 | Procedencia/índice definidos §3; `[ABIERTA]` conformidad | Adrián + architect aceptan consulta, retención de carga y tratamiento del desfase 006/históricos; H-2 |
| Q-4 | `[RESUELTA]` selección técnica §2.4 | Solo aceptación de dependencias/ADR y revisión architect, incluido riesgo de memoria; bloquea aprobación, no queda elección de motor |
| Q-5 | `[RESUELTA]` tasa §5 | Default 120/60 s respaldado por 005; binding/schema ajenos incluidos en Q-2, sin nueva pregunta de cifra |
| Q-6 | Retorno/slots definidos §2.5; `[ABIERTA]` conformidad | Adrián acepta integración/provider/wrappers y entrega mockup ya decidido en P-3; no duda técnica de ubicación/foco |
| Q-7 | `[RESUELTA]` contratos/semántica §4 | Códigos, reintento manual, cache ausente/protección definidos; aprobación general del plan |
| Q-8 | `[RESUELTA]` configuración/fuentes §5 | Pruebas de despliegue son verificación de implementación, no condición técnica pendiente del plan |

Fuentes técnicas fijadas (investigación de metadata/API/código; no prueba runtime):
- Frontera/tasa: S `index.ts`, `storage.module.ts`, `application/file.service.ts`; `shared/infrastructure/config/env.schema.ts` (default download 120).
- Procedencia: S `domain/file-kind.ts`, `domain/upload-session.ts`, `application/upload-registrar.ts`, `infrastructure/persistence/typeorm-upload-session.repository.ts`; migración `20260930100200-crear-carga.ts`.
- UI: F `components/file-row-menu.tsx`, `hooks/use-my-files-state.ts`; `packages/contracts/src/storage/schemas.ts`. MinIO local: `compose.yml:40–48`, `infra/minio/Dockerfile.local`; cookies: `identity/presentation/session-cookies.ts` en API.
- PDF.js: [metadata](https://unpkg.com/pdfjs-dist@6.4.299/package.json), [API/types](https://unpkg.com/pdfjs-dist@6.4.299/types/src/display/api.d.ts), [build/transport/TextLayer](https://unpkg.com/pdfjs-dist@6.4.299/build/pdf.mjs), [asignación del documento](https://github.com/mozilla/pdf.js/blob/v6.4.299/src/core/chunked_stream.js).
- ZIP: [metadata](https://unpkg.com/@zip.js/zip.js@2.23.0/package.json), [tipos públicos](https://unpkg.com/@zip.js/zip.js@2.23.0/index.d.ts), [lectores HTTP](https://unpkg.com/@zip.js/zip.js@2.23.0/lib/core/io.js); SAX: [metadata](https://unpkg.com/saxes@6.0.0/package.json), [README](https://unpkg.com/saxes@6.0.0/README.md).
- MinIO fijado: [M1 nosniff](https://github.com/minio/minio/blob/RELEASE.2025-09-07T16-13-09Z/cmd/generic-handlers.go), [M2 middleware](https://github.com/minio/minio/blob/RELEASE.2025-09-07T16-13-09Z/cmd/routers.go), [M3 CORS](https://github.com/minio/minio/blob/RELEASE.2025-09-07T16-13-09Z/cmd/api-router.go), [M4 rangos](https://github.com/minio/minio/blob/RELEASE.2025-09-07T16-13-09Z/cmd/api-headers.go).

## 8. Aprobación
- `architect`: **Aprobación pendiente**; revisión consultiva realizada: diseño defendible, con puente de errores sin dependencia inversa, transporte/cancelación explícitos y reconciliación de retorno incorporados. Esta evaluación no acepta dependencias, ADR-0025 ni habilitaciones del dueño; ADR de motores pendiente.
- Adrián: **Pendiente** para spec y plan; Q-1/2/3/6, aceptación Q-4 y seguimiento DF/PD aplicable deben quedar atendidos. Spec/backlog siguen **Borrador**, no `Lista`.
- **G-0 — Flujo:** según Abel, Matul permite entregar plan/tasks juntos sin revisión intermedia. La entrega conjunta no equivale a aprobación; no requiere PR/review/documento separado adicional.
- `/tasks` exige aprobación registrada del plan por Adrián (`tasks.md` comando, pasos 1–2; planner Modo 3; ADR-0023/workflow). Si la intención es crear tareas antes, confirmar y registrar la excepción por la autoridad correspondiente: no se encontró excepción oficial que quite esa compuerta.
- Tras aceptar diseño/ownership y registrar las aprobaciones se pueden crear tareas; no hace falta haber implementado previamente las habilitaciones de Adrián ni probado el despliegue. Son dependencias/verificaciones de implementación.
- Esta entrega permanece en Modo 2, sin tareas; aprobación de spec/plan antes del código y del PR antes del merge conforme al flujo vigente.

### Registro de cambios
| Fecha | Cambio / motivo | Aprobación |
|---|---|---|
| 2026-10-06 | Borrador inicial: ocho preguntas, fronteras insuficientes y hallazgos locales H-1/H-2 | Pendiente |
| 2026-10-06 | Revisión profunda Q-1…Q-8: fachada/DI, procedencia e índice reversible, motores fijados, tasa, retorno, errores y evidencia MinIO; separar decisiones técnicas de aceptación/ownership y documentar G-0 | Pendiente de equipo / architect / Adrián según compuerta |
