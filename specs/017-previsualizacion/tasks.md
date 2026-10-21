# Tareas 017 — Previsualización

> Spec: `./spec.md` · Plan: `./plan.md` (**Aprobado por Adrián**, 2026-10-06)
> **Spec y plan aprobados (G-4); compuertas G-1…G-3 cumplidas el 2026-10-06. `/implement` queda autorizado tarea por tarea según sus dependencias.**
> 11 tareas principales verticales; T-08a/b y T-09a/b son subtareas internas, no tareas principales nuevas. Un commit por tarea (`feat(storage): … [017 T-xx]`); toda tarea de lógica empieza por su prueba.
> Abel es dueño de `storage/preview`; los cambios fuera de esa frontera se marcan como habilitación de Adrián/compartida y no se asumen como autorizados.

## Estado vigente (2026-10-19)

- Spec 017 permanece **En curso**. T-01/T-02/T-03/T-05/T-06/T-07/T-08/T-09/T-10 completas; cierre y evidencia de T-06/T-07 en [su registro final](#cierre-técnico-t-06-y-t-07-2026-10-18), de T-08 en [su cierre técnico](#cierre-técnico-t-08-2026-10-18), de T-09 en [su cierre técnico](#cierre-técnico-t-09-2026-10-19) y de T-10 en [su registro](#t-10--evidencia-en-navegador-real-2026-10-19) y [su cierre](#cierre-de-t-10-2026-10-19).
- T-04 permanece `[ ]` solo por lo que depende de T-11: el hostname de objetos realmente aislado y su comprobación humana en DevTools. La evidencia en navegador real que esperaba quedó acreditada en T-10; no presenta un bloqueo abierto de Redis/CORS en backend/Node.
- T-11 permanece `[ ]`: la demo humana local está completa ([evidencia](#t-11--demo-humana-local-2026-10-19)); faltan solo el hostname de objetos realmente aislado y un rol interno real con 403 humano.

### T-04 — resumen vigente

Redis detenido, rechazo acotado y recuperación real ya están acreditados; también CORS/configuración del arnés, GET/Range/206, cabeceras de entrega y expuestas, firma y regresión de descarga. Se conserva abajo la evidencia histórica de aislamiento y operación. La diferencia Silo/MinIO quedó delimitada como una diferencia documentada, no como un bloqueo funcional.

`readers/object-bytes.ts` ya existe en T-07: el helper único usa `credentials: 'omit'`, sin Authorization, Cookie ni cabeceras Nimbo; sus pruebas y la integración Image/Text acreditan la política de código. No equivalen a inspeccionar el tráfico de un navegador real.

**Evidencia en navegador real acreditada en T-10** ([registro](#t-10--evidencia-en-navegador-real-2026-10-19)): GET desde el reader real, ausencia efectiva de Cookie/Bearer/cabeceras Nimbo (con control positivo), CORS aplicado por el navegador (permitido y denegado) y rangos reales 206, sobre el host local `localhost:9000`. **Pendiente único de T-04, en la demo T-11:** el origen de objetos realmente aislado (hostname distinto del de la web) y su comprobación humana en DevTools; localmente el host de objetos es del mismo sitio que la web. T-04 no se presenta como fallida ni se marca completa.

## Compuertas antes de implementación

- [x] **G-1 — IX.7 (opción 4):** Adrián decidió el 2026-10-06 firmar la URL de vista con la política de 005 (`attachment`, `application/octet-stream`); sin `inline`, MIME ni excepción. ADR-0027 Rechazado; PD-120 innecesario.
- [x] **G-2 — Ownership:** Adrián aceptó Q-2 (fachada delgada + extracción DRY) y Q-6 (un solo slot `firstAction`); Q-3 eliminada. El mockup `docs/design/mockups/storage/vista-previa/` lo entrega T-05 (ui-designer).
- [x] **G-3 — Dependencias:** Adrián aceptó `pdfjs-dist@6.4.299`, `@zip.js/zip.js@2.23.0` y `saxes@6.0.0`; registradas en ADR-0026 (Aceptado).
- [x] **G-4 — Aprobación:** Adrián aprobó spec + plan, registrado en `plan.md` §8 (2026-10-06).

## Orden y paralelismo

| Ola | Tareas | Propiedad principal |
|---|---|---|
| 1 | T-01 ∥ T-05 | T-01: Adrián/compartido (`storage`, contracts, env, dependencias). T-05: Adrián/web storage + mockup |
| 2 | T-02 ∥ T-06 | T-02: Adrián/storage. T-06: Abel `web/features/storage/preview` |
| 3 | T-03 ∥ T-07 | T-03: Abel `api/modules/storage/preview`. T-07: helper único de bytes + lectores nativos |
| 4a | T-04 ∥ T-08a ∥ T-09a | aislamiento/entrega; transporte PDF y paquete ZIP reutilizan el helper terminado en T-07 |
| 4b | T-08b ∥ T-09b | Dentro de las mismas T-08/T-09: cada subtarea b empieza después de su a |
| 5 | T-10, luego T-11 | integración browser/regresión; recorrido humano |

## Tareas

- [x] **T-01** **(Adrián/compartida; habilitación)** Contratos, configuración y dependencias aprobadas. Crear `PreviewUrlResponse` = `{ file, url, expiresAt }` (sin `mime`) y códigos públicos de preview en `packages/contracts`; agregar `RATE_LIMIT_PREVIEW_URL_PER_MINUTE` con default 120 y validación/env; declarar en `apps/web` únicamente `pdfjs-dist@6.4.299`, `@zip.js/zip.js@2.23.0`, `saxes@6.0.0` y lockfile. Pruebas de contratos/configuración primero; no modificar `downloadUrlSchema`. — CA: CA-1, CA-2, CA-11, CA-12 — Archivos: `packages/contracts/src/storage/preview-schemas.ts`, `preview-schemas.spec.ts`, `packages/contracts/src/storage/index.ts`, `apps/api/src/shared/infrastructure/config/env.schema.ts`, `.env.example`, `apps/web/package.json`, `pnpm-lock.yaml`

- [x] **T-02** **(Adrián; habilitación storage)** Fachada delgada y extracción DRY. Extraer de `FileService.getDownloadUrl` (:121) el colaborador interno `AccessibleFileUrlIssuer` («resolver archivo accesible y firmar» con `presignDownload`, sin tasa ni auditoría) y hacer que la descarga y `StoragePreviewFacade.issueUrl(actor, fileId)` → `{ file, url, expiresAt }` lo reutilicen; `PreviewUnsupportedError` (422) para `docx`/`otro`; exports/DI públicos. Sin migración, índice, `presignPreview`, MIME ni consulta de procedencia; no ensanchar `INodeRepository`; ajeno/inexistente → 404; fallo al firmar → error operativo saneado. Pruebas primero: autorización (internos 403), ajeno=404, TTL 300, firma idéntica a la de descarga (`attachment`/`octet-stream`/`no-store`), descarga 005 intacta (regresión) y sin auditoría de descarga en la ruta de preview. — CA: CA-3, CA-4, CA-5, CA-8, CA-11 — Archivos: `apps/api/src/modules/storage/application/{storage-preview.facade,accessible-file-url-issuer,file.service}.ts` y specs, `domain/errors/preview-unsupported.error.ts`, `domain/errors/index.ts`, `storage.module.ts`, `index.ts`, `index.spec.ts`, `apps/api/test/int/storage/{preview-delivery,preview-composition}.int-spec.ts` — Depende: T-01

- [x] **T-03** **(Abel; backend preview)** API de emisión de URL. Con pruebas primero, crear `PreviewModule`, `PreviewService`, configuración, errores propios y `PreviewController` para `POST /api/v1/files/:fileId/preview-url`: solo `CLIENT`, UUID por Zod, tasa `storage:preview-url:${actor.id}` independiente de descarga, 429 con `Retry-After`, defensa contra roles internos también en invocación directa y mapeo estricto a `PreviewUrlResponse`. La tasa vive aquí, no en la fachada. No capturar mensajes/stacks/URLs del firmador ni auditar como descarga. — CA: CA-3, CA-4, CA-6, CA-10, CA-11, CA-12 — Archivos: `apps/api/src/modules/storage/preview/{index.ts,preview.module.ts,application/preview.service.ts,application/preview-config.ts,presentation/preview.controller.ts,presentation/preview-validation.ts,domain/preview-errors.ts}` y specs; `apps/api/src/app.module.ts` solo mediante el descriptor acordado — Depende: T-01, T-02

- [ ] **T-04** Aislamiento y operación real de preview. Integración con Postgres/Redis/MinIO reales: sin sesión 401, roles internos 403, ajeno e inexistente indistinguibles, RLS también sobre carga/versión, tasa por actor y contador separado, Redis caído falla cerrado, logs saneados, URL de 300 s para un objeto con `attachment`, `application/octet-stream`, `no-store` y `nosniff` también en preview (igual que descarga 005) y regresión de `presignDownload`. Probar CORS con allowlist `CORS_ORIGIN`, rangos/206, cabeceras expuestas (`Content-Range`, `Content-Length`) y ausencia de Cookie/Bearer en el origen efectivo. — CA: CA-3, CA-4, CA-5, CA-8, CA-10, CA-11, CA-12 — Archivos: `apps/api/test/isolation/storage-preview.iso-spec.ts`, `apps/api/test/int/storage/{preview-delivery,preview-operation,preview-composition}.int-spec.ts`, regresiones `download.int-spec.ts` y `minio-storage.adapter.int-spec.ts` — Depende: T-02, T-03

- [x] **T-05** **(Adrián; habilitación web + mockup)** Costura del explorador y retorno acotado. Entregar mockup 360/1440 con todos los estados de spec §6; agregar un solo slot `firstAction` en `file-row-menu.tsx` (sin `renderFirstFileAction`), exports públicos `MyFiles`/`locationPath`/`useFileDownload` y wrappers. Volver abre `file.folderId` o raíz y enfoca el control de esa fila si sigue en la lista; si no, el encabezado del explorador. Esperar el listado y no guardar orden, paginación, desgloses ni overlays de carga; no persistir URL firmada ni contenido. Sin provider persistente nuevo ni recuperación de páginas previas. Pruebas de foco primero. — CA: CA-7, CA-9 — Archivos: `apps/web/src/features/storage/{index.ts,routes.ts,components/file-row-menu.tsx,components/my-files.tsx,components/file-explorer.tsx,hooks/use-my-files-state.ts,hooks/use-return-focus.ts,hooks/use-file-download.ts}`, `apps/web/src/app/(app)/(cliente)/archivos/{page.tsx,carpeta/[folderId]/page.tsx,vista-previa/[fileId]/page.tsx}`, `docs/design/mockups/storage/vista-previa/`

- [x] **T-06** **(Abel; web base)** Shell del visor y estados. Crear cliente de preview, rutas, `usePreview`, `PreviewPage`, `PreviewMenuItem` y `PreviewStates`; `Previsualizar` es primer ítem solo para kinds admitidos. Manejar cargando con espera >2 s, éxito, vacío válido, no disponible, protegido, corrupto, expirado, cancelación silenciosa, 404 sin nombre y acciones Reintentar/Descargar, incluido fallo de memoria como CA-2. Volver entrega a los wrappers solo `file.folderId`/raíz e ID de fila, con foco de fila o encabezado según T-05, sin capturar estado del explorador. Reintento manual destruye la lectura previa y reemite; URL/contenido solo en memoria, sin persistencia. Pruebas de componente y `jest-axe` primero. — CA: CA-2, CA-6, CA-7, CA-9 — Archivos: `apps/web/src/features/storage/preview/{index.ts,routes.ts,api.ts,hooks/use-preview.ts,preview-failure.ts,components/PreviewPage.tsx,components/PreviewMenuItem.tsx,components/PreviewStates.tsx}` y specs; `apps/web/src/lib/error-catalog.ts` mediante habilitación acordada — Depende: T-01, T-05

- [x] **T-07** **(Abel; helper único + lectores nativos)** Obtener bytes e imagen/TXT/MD. Crear y probar primero `readers/object-bytes.ts`: GET con `credentials: 'omit'`, sin Authorization, Cookie ni cabeceras de Nimbo; propagar AbortSignal; para rangos exigir 206 y Content-Range válido y cancelar respuestas inválidas. Ese único helper centraliza la política para PDF, ZIP e imagen: los consumidores no la reimplementan. Imagen usa sus bytes, Blob/object URL y decodificador nativo PNG/JPG/JPEG/GIF/WebP, sin proxy/optimización; liberar recursos. TXT/MD con UTF-8 incremental y texto escapado, nunca Markdown→HTML ni `dangerouslySetInnerHTML`; no truncar ni imponer límite nuevo; fallos saneados. — CA: CA-1, CA-2, CA-11 — Archivos: `apps/web/src/features/storage/preview/readers/object-bytes.ts`, `readers/object-bytes.spec.ts`, `components/{ImagePreview,TextPreview}.tsx`, lectores nativos y specs — Depende: T-06

- [x] **T-08** **(Abel; PDF, una tarea principal con dos subtareas)** Lector con PDF.js fijado; ambas partes deben quedar completas. — CA: CA-1, CA-2, CA-9, CA-11 — Depende: T-01, T-06, T-07
  - [x] **T-08a:** transporte por rangos mediante el helper único de T-07, worker local de la misma versión y una página en canvas, sin scripting ni recursos remotos. El adaptador PDF.js no repite GET/credenciales/validación de rango/cancelación; sin viewer, acciones, formularios interactivos ni XFA; errores de transporte saneados y liberación. Pruebas de consumo del helper y página real primero. — CA: CA-1, CA-2, CA-11 — Archivos: `apps/web/src/features/storage/preview/components/PdfPreview.tsx`, `readers/{pdfjs-adapter,pdf-range-transport}.ts`, `workers/pdfjs.worker.ts`, specs/fixtures — Depende: T-01, T-06, T-07
  - [x] **T-08b:** resto de páginas navegables bajo demanda, capa de texto y bloques accesibles, PDF escaneado visible sin OCR, contraseña y corrupción. `onPassword` informa protegido sin pedir contraseña; cancelar/liberar y tratar fallo de memoria con causa saneada y Descargar, sin límite distinto de 005. Pruebas multipágina, escaneado, protegido/corrupto y con JavaScript, sin depender de mocks para la garantía browser. — CA: CA-1, CA-2, CA-9 — Archivos: `components/PdfPreview.tsx`, `readers/{pdfjs-adapter,pdf-text-reader}.ts`, specs/fixtures, bajo `apps/web/src/features/storage/preview/` — Depende: T-08a

- [x] **T-09** **(Abel; XLSX/PPTX, una tarea principal con dos subtareas)** Lector OOXML incremental con zip.js + saxes en worker propio; ambas partes deben quedar completas. — CA: CA-1, CA-2, CA-9, CA-11 — Depende: T-01, T-06, T-07
  - [x] **T-09a:** paquete ZIP por rangos usando el helper único de T-07, CRC y SAX secuencial UTF-8/UTF-16, namespaces Strict/Transitional y relaciones OPC internas. Rechazar DTD, entidades no admitidas, rutas/partes ambiguas y recursos externos. El fetch de zip.js consume el helper sin repetir su política; cancelar/liberar worker y buffers. Pruebas de paquete/CRC/XML hostil y consumo del helper primero. — CA: CA-2, CA-11 — Archivos: `apps/web/src/features/storage/preview/readers/{ooxml-package-reader,ooxml-xml-reader,ooxml-relations}.ts`, `workers/{ooxml.worker,ooxml-protocol}.ts`, specs/fixtures — Depende: T-01, T-06, T-07
  - [x] **T-09b:** proyección de todas las hojas con valores cacheados y texto visible de todas las diapositivas en orden, más protección y corrupción. No recalcular fórmulas; sin cache → «Sin valor guardado»; sin animaciones/notas/recursos activos. Liberar al cambiar unidad; fallo de memoria con causa saneada y Descargar, sin límite nuevo. Pruebas de proyecciones y estados primero. — CA: CA-1, CA-2, CA-9 — Archivos: `apps/web/src/features/storage/preview/components/{SpreadsheetPreview,PresentationPreview}.tsx`, `readers/{xlsx-reader,pptx-reader}.ts`, `readers/preview-readers.spec.ts`, fixtures — Depende: T-09a

- [x] **T-10** Integración browser, accesibilidad y regresión. Recorrido automatizado con formatos admitidos/excluidos, todas las páginas/hojas/diapositivas, vuelta a `file.folderId`/raíz y foco en control de fila o encabezado, cargas concurrentes, error + Reintentar/Descargar, URL expirada, logout/acceso revocado, CORS/rangos/cookies reales y axe a 360/1440. Confirmar helper único para PDF/ZIP/imagen y que fallo de preview no bloquea navegación/carga/descarga ni agrega control comercial. Ejecutar `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:int`, `pnpm test:isolation`, `pnpm test:e2e`, `pnpm env:check`; si PD-41 sigue siendo marcador, no reportar E2E como acreditado. — CA: CA-1 a CA-12 — Archivos: `e2e/storage-preview.e2e.ts`, suites de T-04/T-06/T-07/T-08a/b/T-09a/b y regresiones existentes — Depende: T-04, T-05, T-07, T-08b, T-09b

- [ ] **T-11** **(humana, Adrián + Abel)** Recorrido de demo local con Docker: abrir PDF multipágina y escaneado; imagen; TXT/MD literal; XLSX con varias hojas/fórmula sin cache; PPTX con varias diapositivas; archivo vacío válido; corrupto/protegido; formato excluido; Reintentar y Descargar; volver a la carpeta de origen/raíz y enfocar control de fila o encabezado sin recuperar estado previo; otra cuenta no ve contenido; rol interno recibe 403; 429 muestra `Retry-After`; 360 y 1440 px. Verificar en DevTools que los bytes salen del origen aislado sin Cookie/Bearer y que download sigue `attachment`. Nota/capturas en el PR. — CA: CA-1 a CA-12 — Depende: T-10

## Dependencias críticas

- T-02 y T-05 son habilitaciones fuera de la frontera de Abel (storage de Adrián / web storage); conformidad ya dada en G-2.
- T-03 necesita la fachada y contracts reales de T-01/T-02; no duplica SQL, repositorios ni cliente MinIO.
- T-07 entrega el helper único de bytes antes de T-08a/T-09a; PDF, ZIP e imagen lo reutilizan sin reimplementar GET/credenciales/rangos/AbortSignal.
- T-08a → T-08b y T-09a → T-09b, dentro de las mismas tareas principales; T-10 espera ambas subtareas b. Las dependencias de Q-4 ya están aceptadas (G-3).
- T-10 no sustituye la demo humana: acredita automatización y regresión; T-11 valida el recorrido visible y el origen efectivo.
- Ninguna tarea cambia la descarga de 005, agrega `tipo_mime`, OCR, conversión backend, cuota comercial, compartición o edición.

## Matriz de CA → tareas

| CA | Tareas | CA | Tareas |
|---|---|---|---|
| CA-1 | T-01, T-07, T-08a, T-08b, T-09b, T-10, T-11 | CA-7 | T-05, T-06, T-10, T-11 |
| CA-2 | T-01, T-06, T-07, T-08a, T-08b, T-09a, T-09b, T-10, T-11 | CA-8 | T-02, T-04, T-10, T-11 |
| CA-3 | T-02, T-03, T-04, T-10, T-11 | CA-9 | T-05, T-06, T-08b, T-09b, T-10, T-11 |
| CA-4 | T-02, T-03, T-04, T-10, T-11 | CA-10 | T-03, T-04, T-10, T-11 |
| CA-5 | T-02, T-04, T-10, T-11 | CA-11 | T-01, T-02, T-03, T-04, T-07, T-08a, T-09a, T-10, T-11 |
| CA-6 | T-03, T-06, T-10, T-11 | CA-12 | T-01, T-03, T-04, T-10, T-11 |

CA sin cubrir: ninguno.

## Notas para la revisión conjunta

- Revisado el 2026-10-06 tras la decisión de Adrián (opción 4): sin `inline`/MIME/procedencia/migración; ADR-0027 Rechazado.
- Si Adrián/architect cambian fachada, retorno/foco o motores, actualizar primero `plan.md` y después las tareas afectadas antes de `/implement`.
- Mantener ownership: Abel trabaja en `storage/preview`; T-01, T-02 y T-05 contienen cambios compartidos/ajenos explícitos.

## Lectura de la evidencia histórica

Los bloques fechados del 2026-10-09 al 2026-10-16 que siguen conservan sus resultados, RED/GREEN, límites y decisiones originales. Sus expresiones «actual», «vigente», «pendiente» o «sin commit» describen exclusivamente aquella ronda. No sustituyen el [estado vigente del 2026-10-19](#estado-vigente-2026-10-19) ni el [cierre técnico final](#cierre-técnico-t-06-y-t-07-2026-10-18).

En particular, los bloqueos históricos Redis/CORS fueron resueltos en las rondas posteriores aquí registradas. Las afirmaciones de ausencia de `object-bytes`, shell sin lectores y T-06/T-07 pendientes quedaron superadas por los commits del cierre técnico. Se conserva la historia sin presentar esos pendientes como abiertos hoy.

## Corrección de T-03 — evidencia local (2026-10-09)

Fase de corrección autorizada por Abel. RED y checks observados durante la corrección; evidencia posterior de integración ejecutada y aportada por Abel con Docker disponible. No acredita TDD anterior ni presenta esas integraciones como ejecutadas por el agente.

### RED observado antes de cambiar producción

Comando: `pnpm --filter api test --runInBand --runTestsByPath src/modules/storage/preview/application/preview.service.spec.ts src/shared/infrastructure/logging/logger.options.spec.ts src/modules/storage/index.spec.ts`.

La primera ejecución excedió 120 s sin resultado; al reintentar con 300 s se observaron 5 fallos / 29 pases en 3 suites. Tras precisar los fixtures, la última corrida RED confirmó los mismos 5 fallos por estas razones:

- Defensa directa: `CLIENT` con `canReadContent=false` resolvió con una entrega en vez de rechazar con 403.
- Fallos de fachada y limiter (2 pruebas): salió `PreviewUrlIssuanceError extends DomainError`, contrario a la rama operativa canónica del filtro.
- Logging histórico: `http.request` de un 500 no tenía `err.message = "failed with status code 500"`.
- Frontera pública: faltaba `NodeNotFoundError` entre los exports de storage.

Intento inicial de integración durante RED: `pnpm --filter api test:int --runInBand --runTestsByPath test/int/storage/preview.int-spec.ts`. Falló antes de las pruebas, en `globalSetup`: `Could not find a working container runtime strategy`. No es RED funcional ni evidencia HTTP. Ese impedimento inicial quedó resuelto con las ejecuciones posteriores de Abel registradas abajo.

### GREEN observado y checks

Comando focalizado: `pnpm --filter api test --runInBand --runTestsByPath src/modules/storage/preview/application/preview.service.spec.ts src/modules/storage/preview/presentation/preview-validation.spec.ts src/modules/storage/preview/presentation/preview.controller.spec.ts src/modules/storage/preview/preview.module.spec.ts src/app.module.spec.ts src/shared/infrastructure/logging/logger.options.spec.ts src/shared/presentation/domain-exception.filter.spec.ts src/modules/storage/index.spec.ts src/modules/storage/application/storage-preview.facade.spec.ts src/modules/storage/application/accessible-file-url-issuer.spec.ts src/modules/storage/application/file.service.spec.ts`.

- 11 suites / 90 pruebas en verde. Incluye las regresiones unitarias de descarga, fachada, issuer, composición y filtro sin modificar su producción.
- `pnpm --filter api typecheck`: pasa.
- `pnpm exec eslint "apps/api/src/modules/storage/preview/**/*.ts" "apps/api/src/modules/storage/index.ts" "apps/api/src/modules/storage/index.spec.ts" "apps/api/src/shared/infrastructure/logging/logger.options.ts" "apps/api/src/shared/infrastructure/logging/logger.options.spec.ts" "apps/api/test/int/storage/preview.int-spec.ts" --max-warnings 0`: pasa sin warnings.
- `pnpm exec prettier --check "apps/api/src/modules/storage/preview/**/*.ts" "apps/api/src/modules/storage/index.ts" "apps/api/src/modules/storage/index.spec.ts" "apps/api/src/shared/infrastructure/logging/logger.options.ts" "apps/api/src/shared/infrastructure/logging/logger.options.spec.ts" "apps/api/test/int/storage/preview.int-spec.ts"`: pasa.
- `git diff --check`: pasa.
- `pnpm test`: pasa. Raíz 3 suites / 34 pruebas; config 7 / 240; contracts 17 / 328; API 171 / 1633; web 143 / 1122; worker sin pruebas. `file-row-menu` pasó; web emitió un aviso de React `act(...)` en la ruta de vista previa, sin fallo.
- Integración focalizada ejecutada por Abel: 6 suites / 42 pruebas en verde, con el comando siguiente.
- `pnpm test:int` completo ejecutado por Abel: 102 suites / 961 pruebas en verde; 0 snapshots; todas las suites ejecutadas.

Comando de integración focalizada aportado por Abel:

```powershell
pnpm --filter api test:int --runInBand --runTestsByPath `
  test/int/storage/preview.int-spec.ts `
  test/int/storage/preview-composition.int-spec.ts `
  test/int/shared/domain-exception-filter.int-spec.ts `
  test/int/shared/auth-logs.int-spec.ts `
  test/int/shared/correlation-id.int-spec.ts `
  test/int/storage/download.int-spec.ts
```

Resultado: `Test Suites: 6 passed, 6 total`; `Tests: 42 passed, 42 total`.

Después, `pnpm test:int`: `Test Suites: 102 passed, 102 total`; `Tests: 961 passed, 961 total`; `Snapshots: 0`; `Ran all test suites.`

### Corrección y frontera

`PreviewService` exige rol CLIENT y lectura de contenido antes del limiter. Conserva los DomainError esperados y el 429; fallos desconocidos se descartan y se reemplazan por un Error local nuevo de mensaje fijo, sin cause ni datos originales. `preview.url_failed` registra solo campos cerrados. Se restaura el logging global previo a T-03, sin cambiar el filtro. `setup()` local usa dobles tipados y la DI existente de Nest; decisiones, entregas, errores y orden quedan en cada prueba. Los 11 archivos indicados de preview quedan UTF-8 sin BOM.

Habilitación pública mínima provocada por la revisión: export TS de `NodeNotFoundError` desde storage y consumo en la validación UUID. No se agrega export Nest ni otra implementación del 404. El constructor de cuatro dependencias de PreviewService queda como punto de revisión manual.

### Cierre de T-03 y alcance pendiente

T-03 queda `[x]`: unitarias focalizadas (11 suites / 90 pruebas), integración focalizada (6 / 42), `pnpm test` completo, `pnpm test:int` completo (102 / 961) y typecheck/lint/prettier/`git diff --check` en verde. Docker ya está disponible y no constituye un bloqueo de T-03. La integración de preview incluye el 500 canónico, `http.unhandled_error`, ausencia de `http.domain_error` para fallos inesperados y ningún secreto en respuestas/logs, incluido fallo del limiter inyectado en aplicación.

T-04 permanece `[ ]`: sus verificaciones específicas de Redis/MinIO realmente detenidos, RLS/aislamiento completo, CORS, Range/206, cookies/Bearer y entrega real completa siguen pendientes y no fueron absorbidas por T-03 ni acreditadas por el verde de la suite existente. La inyección en aplicación no sustituye esas verificaciones. T-06…T-11 siguen pendientes; la spec 017 permanece `En curso`. No se ejecutó E2E (sigue siendo placeholder). Sin commit, amend, push ni cambios de rama.

## T-04 — evidencia parcial y bloqueo (2026-10-10)

> Evidencia histórica: los bloqueos de esta ronda no representan el estado actual. Ver [resumen vigente de T-04](#t-04--resumen-vigente).

T-03 sigue cerrada; T-04 permanece `[ ]`. Trabajo observado en esta sesión, sin cambios de producción, contratos, infraestructura compartida ni frontend. La spec permanece `En curso`.

### Mapa inicial y pruebas agregadas

- Existentes: `preview.int-spec.ts` cubre 401/403, contrato, 429, correlación y saneamiento de fallos inyectados; `preview-composition` cubre DI única; `preview-delivery` cubre fachada → objeto real, TTL 300, bytes, disposición forzada y auditoría; download/adapter cubren regresiones, firma sobre otro objeto y caducidad del firmador. Storage y `rls-context` ya cubren RLS y contexto, sin el flujo HTTP de preview completo.
- Nuevas: `storage-preview.iso-spec.ts` (Postgres/JWT reales, una conexión) y `preview-operation.int-spec.ts` (Redis Testcontainer propio, contadores, 429 y parada real).
- Helper reutilizado: `storage-http.ts` agrega la opción `preview` y `StorageClient.previewUrl`; compone un único descriptor de storage. Se reutilizan `createIsolationWorld`, sus fixtures escritos como `nimbo_app`, `world.appAs`, tokens de identity, `createStorageHttpApp`, uploads y `LogSink`; no hay repositorios simulados ni infraestructura de aislamiento nueva.
- No se modificaron `preview-delivery`, download ni el adapter. La ampliación de entrega/Range/CORS se detuvo ante el bloqueo operativo que alcanza una frontera compartida.

### Aislamiento acreditado sin cambio de lógica

`pnpm --filter api test:isolation --runInBand --runTestsByPath test/isolation/storage-preview.iso-spec.ts`: 1 suite / 10 pruebas en verde desde la primera corrida; no se fabricó RED.

Comprueba `nimbo_app` sin SUPERUSER/BYPASSRLS y no dueño, ENABLE/FORCE RLS en archivo/versión/carga, dueño permitido, sin sesión 401, tres roles internos 403 por HTTP y fachada, ajeno=inexistente 404, SQL sin contexto sin filas y repositorio sin ámbito rechazado. Tras A → B → A, la misma conexión (`pg_backend_pid`, pool máximo 1) no conserva actor ni permisos. RLS niega versiones/cargas ajenas incluso sin `accessibleNodes`. En el fixture adversarial que cruza `version_actual_id`, la consulta bajo RLS no devuelve la clave real ajena y la URL firmada no la utiliza: conserva el namespace del archivo autorizado, aunque el UUID de la versión referenciada sí es visible en el path. El fixture se restaura. Este test de filas no acredita existencia ni entrega de bytes de esa referencia incoherente.

`pnpm test:isolation`: 18 suites / 308 pruebas en verde, incluida la suite nueva y la regresión de limpieza de cargas.

### Redis real: resultados y RED conservado

`pnpm --filter api test:int --runInBand --runTestsByPath test/int/storage/preview-operation.int-spec.ts`: última corrida, 4 pases / 1 fallo. Pasan independencia por actor, separación preview/download en ambos sentidos, código/mensaje/Retry-After del 429 y ausencia de lookup después del rechazo.

Reproducción aislada: `pnpm --filter api test:int --runInBand --runTestsByPath test/int/storage/preview-operation.int-spec.ts --testNamePattern 'Redis realmente detenido'`: falla. Tras `redis.stop()` del contenedor propio, la solicitud no recibe respuesta en 5 s; el Promise de `consume` real sigue pendiente y el cliente está en estado `connect`. Facade, repositorio y firmador no se ejecutan. El primer intento agotó 120 s; se agregó un deadline HTTP de diagnóstico y limpieza de conexiones/cola para que el RED no retenga el arnés. No hay `mockRejectedValue` ni se detiene el Redis global.

La corrida focalizada amplia sí pasó una vez: 12 suites / 94 pruebas. El fallo volvió a reproducirse al ejecutar el caso aislado y la suite de operación sola; ese verde no acredita estabilidad ni cierra el bloqueo. No se atribuye una causa definitiva a PreviewService: investigar cliente Redis compartido, ready-check/reconexión y transporte del arnés Docker antes de decidir una corrección. Fronteras de coordinación con Adrián: `src/shared/infrastructure/redis/redis-client.provider.ts`, `src/shared/infrastructure/rate-limit/redis-rate-limiter.ts` o el arnés compartido si se demuestra un problema de transporte. No se editaron esas fronteras ni se relajó la expectativa del 500 canónico.

Comando focalizado amplio: `pnpm --filter api test:int --runInBand --runTestsByPath test/int/storage/preview-operation.int-spec.ts test/int/storage/preview-delivery.int-spec.ts test/int/storage/preview-composition.int-spec.ts test/int/storage/preview.int-spec.ts test/int/storage/download.int-spec.ts test/int/storage/rate-limit.int-spec.ts test/int/storage/minio-storage.adapter.int-spec.ts test/int/shared/redis-rate-limiter.int-spec.ts test/int/shared/auth-logs.int-spec.ts test/int/identity/auth-logs.int-spec.ts test/int/shared/correlation-id.int-spec.ts test/int/shared/domain-exception-filter.int-spec.ts`.

### Privacidad, entrega pendiente y tensión de secuenciación

Las inspecciones de logs de los casos por actor y 429 comprueban ausencia de URL firmada, firma, token, object key y nombre privado; en 429 hay correlación y `preview.rate_limited` sin fallo duplicado, y Authorization/Cookie se redactan. En el RED no hay emisión ni lookup y los logs capturados hasta el timeout no contienen los secretos del fixture. El caso preparado exige 500 canónico, `preview.url_failed`, `http.unhandled_error` y descarte del message/stack original de Redis; no se declara acreditado de forma estable porque la respuesta no llega en las reproducciones. Se permite `err` seguro, conforme a T-03.

Las regresiones existentes de MinIO/descarga pasaron en la corrida focalizada amplia: objeto real, GET 200, bytes, TTL 300, attachment/octet-stream/no-store, auditoría y firma/caducidad del adapter. No se acredita todavía GET/Range/206/CORS/`nosniff` desde el endpoint preview ni el consumo sin auditoría. Discrepancia detectada por lectura, no por probe CORS: el plan cita MinIO 2025, el arnés usa Silo 2026 y `startMinio` no fija `MINIO_API_CORS_ALLOW_ORIGIN`; Compose sí lo configura. No se cambió configuración ni se inventaron respuestas/headers CORS.

`object-bytes.ts` no existe. Ausencia efectiva de Cookie/Bearer/correlationId/headers Nimbo y uso de `credentials: 'omit'` en navegador dependen de T-07 y de verificación browser en T-10. T-04 exige literalmente esa ausencia, aunque se programa antes: tensión de secuenciación documentada, sin absorber T-06+ ni simular evidencia browser. T-04 permanece abierta también por esa comprobación y por la entrega pendiente. E2E placeholder no ejecutado.

### Checks y condición de cierre

- `pnpm --filter api typecheck`: verde.
- `pnpm exec eslint "apps/api/test/isolation/storage-preview.iso-spec.ts" "apps/api/test/int/storage/preview-operation.int-spec.ts" "apps/api/test/int/storage/storage-http.ts" --max-warnings 0`: verde (se corrigió un orden de imports señalado por lint).
- `pnpm exec prettier --check "apps/api/test/isolation/storage-preview.iso-spec.ts" "apps/api/test/int/storage/preview-operation.int-spec.ts" "apps/api/test/int/storage/storage-http.ts"`: verde.
- `git diff --check`: verde.
- `pnpm test` y `pnpm test:int` completos no se ejecutaron en esta fase: persiste RED focalizado y la instrucción condiciona esas corridas a todo focalizado verde. Los 102/961 de T-03 no se presentan como validación nueva de T-04.
- Jest emitió avisos de salida tardía en algunas corridas; las últimas reproducciones aisladas terminaron sin timeout del cierre. El lifecycle dedicado se cierra sin modificar contenedores globales.

Recomendación: mantener T-04 `[ ]`, coordinar el bloqueo Redis compartido y luego completar entrega/CORS y la verificación web correspondiente. Sin commit, amend, push ni cambios de rama.

## T-04 — ronda MinIO/HTTP y RED CORS (2026-10-10)

T-04 permanece `[ ]`. Esta ronda deja explícitamente aparte el bloqueo Redis anterior, pendiente de coordinación con Adrián: no se investigaron ni modificaron sus proveedores, limiter, BullMQ, Redis compartido ni el caso de Redis detenido; tampoco se ejecutó `preview-operation`. Solo se amplió `preview-delivery.int-spec.ts` y se actualizó esta evidencia y la fila 017 del backlog. Sin cambios de producción, frontend, infraestructura ni configuración compartida.

### Cobertura previa y ampliación

- Previa: fachada → MinIO, TTL 300, bytes y política de 005, emisión sin auditoría; download acredita su endpoint y GET simple/multipart; adapter acredita firma válida, caducidad y rechazo de la misma firma sobre otra clave. Esa cobertura del adapter se reutiliza para la restricción a un solo objeto.
- `preview-delivery` ahora usa `createStorageHttpApp({ preview: true })`, ya disponible, y encadena carga real → `POST /api/v1/files/:fileId/preview-url` → GET directo a MinIO. Valida 200, `PreviewUrlResponse`, URL absoluta, host distinto de web/API, `X-Amz-Expires=300` y `expiresAt` con TTL 300 y holgura de reloj de 30 s.
- GET devuelve los 2048 bytes exactos; Range sobre la misma URL/objeto comprueba `bytes=0-9` y `bytes=37-63`: 206, segmentos exactos, `Content-Range` respectivamente `bytes 0-9/2048` y `bytes 37-63/2048`, y longitudes 10/27. MinIO expone `Accept-Ranges: bytes`.
- GET/Range conservan `Content-Disposition: attachment`, `Content-Type: application/octet-stream`, `Cache-Control: no-store`, `X-Content-Type-Options: nosniff` y ausencia de `Set-Cookie`. Funcionan con peticiones Node directas sin Authorization Nimbo ni Cookie. Esto no acredita `credentials: 'omit'` ni política del navegador.
- Firma válida acreditada por GET/Range; alterar `response-content-type` de la URL de preview se rechaza sin entregar los bytes. El caso nuevo exige rechazo 4xx, sin fijar un código exacto de MinIO. La suite del adapter sigue verde, incluido rechazo sobre otro objeto y caducidad.
- Emitir preview no genera `audit.record`/`download.url_issued`; consumir la URL tampoco. Emitir download posteriormente conserva `file.download_url_issued` para ese archivo. La suite download completa focalizada sigue verde.
- Privacidad: se comprueba ausencia de URL, firma, object key y nombre del fixture en logs; tampoco aparecen Bearer/Cookie. Comparaciones sensibles se reducen a booleanos; los errores de transporte descartan la causa original. El diagnóstico CORS imprime solo Origin, método, status y headers de una lista segura, sin URL, clave, firma, contenido, nombre ni credenciales. No se cambió logging global.

### Probes CORS reales: permitido pasa; denegado falla

Peticiones directas al origen de objetos. GET usa `Range: bytes=0-9`; OPTIONS envía `Access-Control-Request-Method: GET` y `Access-Control-Request-Headers: range`.

| Origin enviado | Método | Status | Access-Control-Allow-Origin real | Otros headers CORS reales |
|---|---|---|---|---|
| `http://localhost` (allowlist de la API de test) | GET | 206 | `http://localhost` | Allow-Credentials `true`; Expose-Headers incluye Content-Range, Content-Length y Accept-Ranges; Vary `Origin, Accept-Encoding` |
| `http://localhost` | OPTIONS | 204 | `http://localhost` | Allow-Methods `GET`; Allow-Headers `range`; Allow-Credentials `true`; Vary `Origin, Access-Control-Request-Method, Access-Control-Request-Headers` |
| `https://not-allowed.example` (fuera de allowlist) | GET | 206 | `https://not-allowed.example` | Allow-Credentials `true`; misma exposición de headers y Vary que GET permitido |
| `https://not-allowed.example` | OPTIONS | 204 | `https://not-allowed.example` | Allow-Methods `GET`; Allow-Headers `range`; Allow-Credentials `true`; mismo Vary que OPTIONS permitido |

`Access-Control-Expose-Headers` real en ambos GET: `Date, Etag, Server, Connection, Accept-Ranges, Content-Range, Content-Encoding, Content-Length, Content-Type, Content-Disposition, Last-Modified, Content-Language, Cache-Control, Retry-After, X-Amz-Bucket-Region, Expires, X-Amz*, X-Amz*, *`. En OPTIONS no se devuelve Expose-Headers; en GET no se devuelven Allow-Methods/Allow-Headers. Los GET también devuelven Accept-Ranges `bytes`, Content-Range `bytes 0-9/2048`, Content-Length `10`, octet-stream/no-store/nosniff.

**RED funcional conservado:** el origen denegado recibe autorización CORS válida. Aunque ACAO no es literalmente `*`, el servidor refleja también el origen no permitido. No se relajó la expectativa ni se corrigió infraestructura. La primera corrida tuvo un error del test (`CORS_ORIGIN` validado es un array, no string); se corrigió antes de los probes efectivos. Ese error no se atribuye a producción ni se presenta como RED funcional.

### Configuración efectiva y frontera de coordinación

- `apps/api/test/int/setup/global-setup.ts` fija `CORS_ORIGIN=http://localhost` para la API. `containers.ts` → `startMinio()` arranca `pgsty/silo:RELEASE.2026-09-16T00-00-00Z`, `server /data`, puerto 9000 mapeado, solo variables raíz; **no configura `MINIO_API_CORS_ALLOW_ORIGIN`**. El comportamiento observado acepta ambos orígenes.
- El archivo exacto a coordinar con Adrián es `apps/api/test/int/setup/containers.ts`, `startMinio()`: alinear la allowlist del contenedor de objetos con la configuración del arnés. La API valida su allowlist, pero no la transmite automáticamente a MinIO. No se editó este archivo.
- Corrección de la discrepancia histórica por lectura actual: `compose.yml` base también usa Silo 2026 y sí fija `MINIO_API_CORS_ALLOW_ORIGIN=${CORS_ORIGIN:-http://localhost,http://localhost:3002}`. Por tanto, base y tests coinciden en imagen, no en configuración CORS.
- `compose.override.yml`, cargado en local, sustituye la imagen por `nimbo-minio-local:2025-09-07` y usa `infra/minio/Dockerfile.local`, que compila MinIO 2025, como el plan aprobado. El arnés difiere del Compose **local efectivo** también en versión. Estos probes no acreditan el runtime local ni staging/producción. Ningún Compose/Dockerfile/init fue editado.

### Ejecución focalizada y condición de cierre

Docker Desktop estaba detenido y se arrancó para esta verificación. Comando ejecutado sin incluir el caso Redis detenido:

```powershell
pnpm --filter api test:int --runInBand --runTestsByPath test/int/storage/preview-delivery.int-spec.ts test/int/storage/preview-composition.int-spec.ts test/int/storage/preview.int-spec.ts test/int/storage/download.int-spec.ts test/int/storage/minio-storage.adapter.int-spec.ts
```

Última corrida funcional: **5 suites: 4 verdes / 1 roja; 42 pruebas: 41 pases / 1 fallo**. `preview-delivery`: 8 pases / 1 fallo CORS; las otras cuatro suites pasan. El RED CORS se reprodujo en corridas efectivas sucesivas; no hay RED nuevo de lógica propia de preview ni modificación de producción. No se ejecutaron suites completas: la condición de todas las partes MinIO verdes no se cumple.

Checks estáticos de esta ronda:

- `pnpm --filter api typecheck`: verde.
- `pnpm exec eslint "apps/api/test/int/storage/preview-delivery.int-spec.ts" "apps/api/test/int/storage/preview-composition.int-spec.ts" "apps/api/test/int/storage/preview.int-spec.ts" "apps/api/test/int/storage/download.int-spec.ts" "apps/api/test/int/storage/minio-storage.adapter.int-spec.ts" "apps/api/test/int/storage/storage-http.ts" --max-warnings 0`: verde, sin warnings.
- `pnpm exec prettier --check "apps/api/test/int/storage/preview-delivery.int-spec.ts" "apps/api/test/int/storage/preview-composition.int-spec.ts" "apps/api/test/int/storage/preview.int-spec.ts" "apps/api/test/int/storage/download.int-spec.ts" "apps/api/test/int/storage/minio-storage.adapter.int-spec.ts" "apps/api/test/int/storage/storage-http.ts"`: verde tras corregir formato del test ampliado.
- `git diff --check`: verde. Sin commit, amend, push, merge, rebase, reset ni cambio de rama.

Para cerrar T-04 faltan: (1) resolver y volver a verificar el bloqueo Redis ya documentado con Adrián; (2) coordinar la allowlist del MinIO del arnés y conseguir verde CORS permitido/denegado; (3) alinear/acreditar la versión/configuración de objetos respecto del plan y del entorno local efectivo; (4) acreditar en T-07/T-10 el helper `object-bytes.ts` y el navegador sin Cookie/Bearer/cabeceras Nimbo, `credentials: 'omit'` y CORS/rangos efectivos. E2E placeholder no ejecutado. T-06…T-11 y la spec permanecen en su estado anterior.

## 017 — pulido de tests y evidencia antes de T-06 (2026-10-10)

Correcciones autorizadas por Abel, limitadas a cuatro suites de integración/aislamiento, `preview.service.spec.ts` y este archivo. T-04 permanece `[ ]`. Producción, contratos funcionales, fronteras públicas, shared, configuración de contenedores y frontend no cambiaron.

### Correcciones acreditadas

- **Privacidad de diagnósticos:** comprobaciones sensibles de logs, paths, errores y cuerpos se evalúan a booleanos; los matchers se conservan sin imprimir el valor inspeccionado. Los spies sensibles se verifican por cantidad de llamadas. Una resolución inesperada de la fachada no vuelca la entrega firmada mediante el diagnóstico de `.rejects`. El test de Redis usa errores de transporte de categoría fija, sin propagar la petición/cabeceras originales. No se cambió logging global ni se retiró cobertura.
- **Lifecycle Redis:** el caso destructivo tiene su propio `describe`, contenedor y app, con cleanup dedicado. Está situado antes de los casos no destructivos, que crean otro Redis. Escenario, request con deadline, diagnóstico de Promise pendiente, comprobación del 500 y comprobación de logs están separados en helpers locales específicos. Se conservan el consume real y los spies de observación, la expectativa de 500 canónico, ausencia de lookup/firma, correlación y descarte de secretos.
- **Referencia cruzada:** nombre, comentario y assertions describen namespace del archivo permitido y no utilización de la object key real ajena. El UUID referenciado puede ser visible. El fixture de filas no acredita entrega de bytes; la evidencia anterior de aislamiento quedó precisada arriba.
- **Error operacional:** se retiró únicamente la exigencia de la lista exacta `['message', 'stack']`. Se mantiene Error seguro, distinto del original y de DomainError, sin cause/code/status inesperados ni valores privados en propiedades, message, stack o logs. Inspeccionar valores de propiedades no fija la representación interna de Error.
- **TTL:** el helper toma `before` inmediatamente antes del POST y `after` inmediatamente después de su respuesta, antes de parsearla. `expiresAt` debe estar entre `before + 300 s` y `after + 300 s`, inclusive; no se necesita tolerancia adicional. Se mantiene `X-Amz-Expires=300`, sin fake clock sobre MinIO. Esto sustituye la holgura de 30 s de la ronda anterior.
- **CORS:** se separaron permitido/denegado en dos casos para validar el permitido en verde y ejecutar el RED denegado por separado, con las mismas expectativas y los probes GET/OPTIONS reales.

### A. Pruebas verdes

- `pnpm --filter api test --runInBand --runTestsByPath src/modules/storage/preview/application/preview.service.spec.ts`: **1 suite / 16 pruebas verdes**.
- `pnpm --filter api test:int --runInBand --runTestsByPath test/int/storage/preview.int-spec.ts test/int/storage/preview-operation.int-spec.ts test/int/storage/preview-delivery.int-spec.ts --testNamePattern '^(?!.*(?:Redis realmente detenido|origen denegado)).*$'`: **3 suites / 23 pruebas verdes**, incluidos CORS permitido, GET/Range y TTL acotado. Jest muestra 2 casos omitidos solo por este filtro de ejecución; ambos se ejecutaron en las corridas siguientes, sin `.skip` ni cambios de expectativa.
- `pnpm --filter api test:isolation --runInBand --runTestsByPath test/isolation/storage-preview.iso-spec.ts`: **1 suite / 10 pruebas verdes**, incluida la precisión del caso cruzado y RLS/roles/contexto.

Total de pruebas distintas verdes afectadas: **49**, sin contar dos veces los casos de operación ejecutados de nuevo.

### B. RED Redis externo conservado

`pnpm --filter api test:int --runInBand --runTestsByPath test/int/storage/preview-operation.int-spec.ts --verbose`: **4 pases / 1 fallo**. El caso de Redis detenido falla primero: no recibe respuesta en 5 s y el consume real sigue pendiente, sin lookup ni firma. El diagnóstico es de categoría fija. Los **cuatro casos posteriores pasan** usando su propio Redis, acreditando que no heredan el contenedor detenido. La corrida y el cleanup terminan sin timeout del arnés. No es una regresión nueva ni se investigó/corrigió shared.

### C. RED CORS externo conservado

`pnpm --filter api test:int --runInBand --runTestsByPath test/int/storage/preview-delivery.int-spec.ts --testNamePattern 'origen denegado'`: **1 fallo esperado**. Para `https://not-allowed.example`, GET devuelve 206 y OPTIONS 204, ambos con ACAO igual al origen enviado y Allow-Credentials `true`. No se tocó `startMinio` ni se relajó la allowlist. Los otros 9 casos quedan fuera de esta selección; pasaron en la corrida verde anterior.

### Checks y estado

- `pnpm --filter api typecheck`: verde.
- ESLint focalizado en las cinco suites modificadas, `--max-warnings 0`: verde, sin warnings.
- Prettier focalizado en las mismas cinco suites: verde tras corregir formato.
- `git diff --check`: verde.
- El único archivo modificado bajo `apps/api/src` es `preview.service.spec.ts`; no hay cambio de producción. Los dos RED externos siguen pendientes de coordinación y browser sigue diferido a T-07/T-10. No se resolvieron decisiones de contrato, DI ni lint compartido en esta ronda. Sin commit, push ni otras operaciones de escritura Git.

## T-04 — CORS del arnés resuelto y diagnóstico Redis (2026-10-16)

> Evidencia histórica: el diagnóstico inicial y sus opciones preceden al ajuste Redis autorizado registrado a continuación. El pendiente vigente está en [el resumen T-04](#t-04--resumen-vigente).

Continuación autorizada sobre `feat/017-previsualizacion`, HEAD `92b6bf0`. Precheck: solo cambios locales API T-04 y documentación; ningún cambio web pendiente. T-04 permanece `[ ]`. Esta evidencia se agrega sin reescribir las rondas históricas ni editar T-06 o `specs/README.md`.

### CORS: causa, RED y corrección mínima

- Lectura de ambos caminos: `compose.yml:48` entrega a MinIO `MINIO_API_CORS_ALLOW_ORIGIN=${CORS_ORIGIN:-http://localhost,http://localhost:3002}`; el override local conserva ese environment, aunque sustituye la imagen por MinIO local 2025. `test/int/setup/containers.ts` arrancaba Silo 2026 sin allowlist. `global-setup.ts` fijaba `CORS_ORIGIN=http://localhost` para la API después de arrancar los contenedores; no configuraba el servidor de objetos.
- RED nuevo antes del cambio: `pnpm --filter api test:int --runInBand --runTestsByPath test/int/storage/preview-delivery.int-spec.ts --testNamePattern 'probes CORS'`: **1 suite FAIL; 1 prueba PASS / 1 FAIL / 8 fuera del filtro**. Permitido pasa; denegado GET 206 y OPTIONS 204 reflejan `https://not-allowed.example` con `Access-Control-Allow-Credentials: true`. El diagnóstico solo imprimió Origin/status/cabeceras seguras, sin URL firmada ni contenido.
- Corrección: el valor existente `http://localhost` pasa de `global-setup.ts` a la constante del arnés `TEST_CORS_ORIGIN` en `containers.ts`. `startMinio()` lo entrega como `MINIO_API_CORS_ALLOW_ORIGIN` y `TestInfra.env()` como `CORS_ORIGIN`; globalSetup consume el mismo `infraEnv`, sin duplicar el literal. No se inventó otra política ni se cambió Compose, imagen, bucket CORS, API de preview o firma.
- `preview-delivery` refuerza el GET completo con Content-Length y los probes con credenciales, rango/longitud exactos y cabeceras de entrega. Para el origen denegado exige ausencia tanto de ACAO como de Allow-Credentials, conservando GET/OPTIONS reales.

### GREEN CORS, entrega y regresiones

```powershell
pnpm --filter api test:int --runInBand --runTestsByPath test/int/storage/preview-delivery.int-spec.ts test/int/storage/download.int-spec.ts test/int/storage/minio-storage.adapter.int-spec.ts test/int/shared/health.int-spec.ts test/int/worker/worker-health.int-spec.ts
```

**5 suites PASS / 39 pruebas PASS / 0 FAIL; 0 snapshots.** Las dos suites de salud son los consumidores adicionales de `startTestInfra()`; no existe una suite separada del helper. Preview-delivery completo: sus 10 casos pasan, incluidos ambos probes antes separados por filtro.

- Origen permitido `http://localhost`: ACAO exactamente ese origen y Allow-Credentials `true`; OPTIONS exitoso admite GET/Range; GET con rango devuelve 206 y expone explícitamente Content-Range, Content-Length y Accept-Ranges.
- Origen denegado `https://not-allowed.example`: GET y OPTIONS sin ACAO ni Allow-Credentials. CORS deja de ser pendiente **en el arnés de integración**.
- GET normal: 200, 2048 bytes exactos y Content-Length 2048. Rangos 0–9 y 37–63: 206, Content-Range `bytes 0-9/2048` / `bytes 37-63/2048`, longitudes 10 / 27 y bytes exactos. GET/Range mantienen attachment, application/octet-stream, no-store, nosniff y ausencia de Set-Cookie. Los probes permitidos también comprueban las cabeceras de entrega.
- Peticiones Node directas con `fetch` al host de objetos, sin Authorization/Cookie en sus opciones ni reutilización de las cabeceras autenticadas de Supertest; Node no aporta el cookie jar del navegador. No se acredita con ello el navegador, `credentials: 'omit'` ni el futuro helper de bytes. Browser continúa en T-10/T-11.
- Download y adapter MinIO conservan sus regresiones, incluida firma/caducidad y descarga de 005. La suite de salud del worker pasó, pero emitió `console.error` con `write ECONNABORTED` desde BullMQ al detener su Redis dedicado. No se ocultaron esos mensajes ni se modificaron la suite o la infraestructura de colas.

### Redis detenido: RED conservado, intermitencia y diagnóstico concreto

1. Con CORS ya corregido, `pnpm --filter api test:int --runInBand --runTestsByPath test/int/storage/preview-operation.int-spec.ts --verbose`: **1 suite FAIL; 4 pruebas PASS / 1 FAIL**. El caso destructivo tardó **5736 ms en total**, incluido fixture/parada. El POST agotó el límite diagnóstico de respuesta de **5000 ms**; el Promise del consume real seguía pendiente. Spies de observación: consume 1, fachada 0, lookup 0, firma 0. La inspección de logs hasta ese límite no encontró secretos; el 500 canónico y sus eventos finales no llegaron a acreditarse en esa ejecución.
2. Se amplió únicamente el diagnóstico de `preview-operation.int-spec.ts`: tiempo del POST, opciones/estado, eventos de conexión y nombres de comandos pendientes; nunca argumentos, claves, URLs ni excepciones originales. Se conservan las implementaciones reales, la expectativa de 500 y el RED ante timeout. No es un timeout de producción ni convierte el timeout del test en GREEN.
3. La siguiente corrida completa de la misma suite pasó **5/5**, caso destructivo **1062 ms totales**. La selección posterior `--testNamePattern 'Redis realmente detenido'` pasó **1/1**, caso **1284 ms totales** (los otros cuatro casos quedaron fuera del filtro). Esas duraciones incluyen fixture/parada: no son medidas aisladas de latencia HTTP. Los verdes comprobaron 500 canónico, cero lookup/firma, correlación y saneamiento. No sustituyen el RED anterior ni demuestran una corrección: no cambió producción y el comportamiento es intermitente.
4. Diagnóstico independiente ejecutado con `node -e` en `apps/api`, sin crear archivos: un RedisContainer propio, factory real `redisClientProviders` de `dist-int` (compilación de la corrida), RedisRateLimiter real y reloj de sistema. Primero consume permitido/status ready; luego se detuvo únicamente ese Redis. El siguiente consume permanecía **pending a los 6017 ms**. Estado `connect`, cola offline de **2** comandos, dos comandos en vuelo llamados **client**, socket escribible/no destruido. Traza: close→reconnecting→connecting→connect repetido, sin nuevo ready; el último connect quedó esperando respuestas. El plazo de observación solo clasificó pending, no declaró éxito; el cliente y su contenedor se limpiaron al terminar.

Configuración efectiva confirmada en el cliente real y en ioredis **5.11.1**:

| Opción | Valor actual |
|---|---|
| maxRetriesPerRequest | 1, explícito en el provider |
| enableOfflineQueue | true, default |
| connectTimeout | 1000 ms, explícito |
| commandTimeout | sin configurar |
| socketTimeout | sin configurar |
| lazyConnect | true, explícito; después del primer consume ya estaba ready |
| retryStrategy | default `min(intento * 50, 2000)` ms: 50, 100, …, 2000; sin corte por número de intentos |
| enableReadyCheck | true, default |
| autoResendUnfulfilledCommands | true, default |

Causa sustentada por traza y lectura del driver instalado: después del TCP connect se espera el handshake `CLIENT SETINFO` antes del ready check. En el caso observado el transporte del puerto publicado permanece conectado/escribible tras la parada, pero no devuelve las respuestas. connectTimeout se cancela al establecer TCP; maxRetriesPerRequest limita los comandos al procesar cierres/reconexiones, no el tiempo en ese handshake. Mientras no llega otro cierre, no vence un comando por elapsed time y el eval queda en espera offline. RedisRateLimiter está esperando ese eval; PreviewService todavía no recibe un rechazo que pueda traducir. Esto precisa la hipótesis de reencolado: se observó además un bloqueo concreto durante handshake, no solo reintentos ilimitados.

### Frontera Redis pendiente, checks y estado

- Archivo exacto a coordinar: `apps/api/src/shared/infrastructure/redis/redis-client.provider.ts`, opciones de `createRedisClient` (líneas 30–35). **No se modificó**, ni tampoco `redis-rate-limiter.ts` o PreviewService/fachada/controller/autorización/logging.
- Cambio mínimo recomendado, **sin aplicar**: configurar un `commandTimeout` finito para este cliente no BullMQ, con presupuesto técnico acordado (1000 ms sería el candidato inicial coherente con connectTimeout). El driver arma ese timeout también antes de encolar offline; limita la espera de cada comando/handshake sin agregar Promise.race a preview. No basta asumir que maxRetriesPerRequest=1 ya establece un deadline. Desactivar solo offlineQueue rompería la primera operación con lazyConnect y no es la propuesta.
- Impacto a revisar: tasa de registro/contraseña/login/carga/descarga/preview, lockout y marcadores idempotentes de correo usan el cliente compartido. Un timeout puede rechazar operaciones bajo latencia legítima y no prueba que una escritura no se ejecutó; no agregar reintentos de negocio por suposición. BullMQ tiene otra configuración (`buildBullConnection`, maxRetriesPerRequest=null) y sus comandos bloqueantes requieren tratamiento separado.
- Tras autorizar el cambio compartido: unitarias de redis-client.provider, redis-rate-limiter y shared.module; integraciones shared/redis-rate-limiter, identity/redis-attempt-lockout y límites/login/password, storage/rate-limit, preview-operation y notificaciones/degradación/idempotencia. Es necesaria una prueba del cliente real ya conectado con servidor detenido/TCP sin respuesta y recuperación, además del caso actual de puerto cerrado que usa opciones distintas al provider. No se declararon ejecutadas esas regresiones futuras.
- Checks nuevos: `pnpm --filter api typecheck` PASS; ESLint sobre `test/int/setup/{containers,global-setup}.ts` y `test/int/storage/{preview-delivery,preview-operation}.int-spec.ts` con `--max-warnings 0` PASS; Prettier en esos cuatro TS PASS; `git diff --check` PASS.
- T-04 sigue `[ ]`: quedan corregir/acreditar el deadline Redis en la frontera compartida, alinear/acreditar la diferencia de runtime Silo 2026 de integración frente al MinIO local 2025 del plan y la comprobación efectiva browser/helper sin Cookie/Bearer/cabeceras Nimbo. Esta ronda cierra el pendiente CORS del arnés; no acredita el runtime local ni staging. La evidencia de aislamiento previa se conserva, sin presentarla como una corrida nueva.

Sin commit, push, staging ni cambios de rama. No se editaron archivos web/T-06, `specs/README.md`, configuración Redis compartida ni producción de preview.

### Ajuste Redis compartido autorizado — deadline y recuperación (2026-10-16)

Adrián autorizó el ajuste compartido, según confirmación de Abel. Precheck: `feat/017-previsualizacion`, HEAD `92b6bf0`, index vacío y cambios locales T-04 intactos. Esta evidencia nueva sustituye el pendiente Redis de la ronda anterior; su tabla/opciones y resultados RED se conservan como históricos. T-04 permanece `[ ]`; no se modifica T-06 ni `specs/README.md`.

#### RED → GREEN del provider

- Antes de producción se agregó la prueba de `commandTimeout: 1000` a `redis-client.provider.spec.ts`, seleccionando solo cuatro opciones para no imprimir credenciales. `pnpm --filter api test --runInBand --runTestsByPath src/shared/infrastructure/redis/redis-client.provider.spec.ts`: **1 FAIL / 3 PASS**. Única diferencia: commandTimeout era undefined; connectTimeout=1000, maxRetriesPerRequest=1 y lazyConnect=true ya coincidían.
- Único cambio de producción: una línea `commandTimeout: 1000` en `apps/api/src/shared/infrastructure/redis/redis-client.provider.ts`. Sin cambios de retryStrategy, offlineQueue, autoResend, RedisRateLimiter, PreviewService, claves o configuración BullMQ.
- `pnpm --filter api test --runInBand --runTestsByPath src/shared/infrastructure/redis/redis-client.provider.spec.ts src/shared/infrastructure/rate-limit/redis-rate-limiter.spec.ts src/shared/shared.module.spec.ts`: **3 suites / 11 pruebas PASS**, incluido el provider 4/4, composición/DI y limiter.

#### Caída real y tres repeticiones explícitas

`preview-operation.int-spec.ts` conserva su Redis/app dedicados, preview exitoso antes de parar Redis, POST real, 500 canónico, spies sin sustitución y comprobaciones de correlación/logs/secretos. Se agregó medida del POST y cota de respuesta de 2500 ms (margen de scheduling sobre el deadline de comando de 1000 ms), por debajo de la guardia diagnóstica HTTP existente de 5000 ms. El límite del test nunca sustituye un rechazo Redis ni produce GREEN.

Primera ejecución de preview-operation completo con el cambio: **5/5 PASS**, POST 500 en **1084 ms**, rechazo real `Command timed out`. Esa corrida incluyó además la prueba nueva de recuperación, que falló por el endpoint del arnés descrito abajo: total conjunto **1 suite PASS / 1 FAIL; 5 pruebas PASS / 1 FAIL**. No se oculta ese fallo.

Se ejecutó **tres veces como comandos separados**, sin reintento automático:

```powershell
pnpm --filter api test:int --runInBand --runTestsByPath test/int/storage/preview-operation.int-spec.ts --testNamePattern 'Redis realmente detenido' --verbose
```

| Ejecución | Resultado del caso seleccionado | POST hasta 500 | Rechazo real |
|---|---|---|---|
| 1 | PASS | 1033 ms | command-timeout |
| 2 | PASS | 1026 ms | command-timeout |
| 3 | PASS | 1042 ms | command-timeout |

En cada ejecución quedaron cuatro casos fuera del filtro (sin `.skip`); esos cuatro pasan en las corridas completas. Cada repetición acredita consume real rechazado, **fachada 0 / lookup 0 / firma 0**, cuerpo 500 exacto, correlación, eventos saneados y ausencia de secretos, incluido message/stack originales. Las primeras dos emitieron el aviso de Jest de salida posterior a un segundo; la tercera no. Todas terminaron, sin forceExit ni ocultar avisos. La evidencia temporal se imprime solo con event/status/milisegundos y categoría cerrada de rechazo, sin datos privados.

#### Recuperación real sobre el mismo endpoint

Nueva suite `test/int/shared/redis-client.int-spec.ts`: RedisContainer propio, factory Nest real `redisClientProviders`, RedisRateLimiter real y solo el logger como doble. Tras un consume permitido/status ready, `redis-cli CLIENT PAUSE 5000 ALL` hace que el servidor real deje de procesar comandos sin cerrar TCP. El siguiente consume debe rechazar con **`Command timed out`**, entre 900 y 2500 ms; no se reemplaza la dependencia ni se simula un rechazo. Después se reinicia ese contenedor y se espera un nuevo evento ready sin reconectar manualmente el cliente ni cambiar sus opciones; un consume con clave nueva vuelve a funcionar.

- Primer intento: el comando sí venció, pero no llegó ready en la guardia de recuperación de 10 s. Diagnóstico independiente con Testcontainers confirmó que un reinicio con puerto Docker aleatorio cambia el endpoint: **32826 → 32827**, sameEndpoint=false. No se atribuyó ese fallo de recuperación al provider ni se relajó la expectativa.
- Corrección solo del arnés nuevo: elegir un puerto efímero libre y fijarlo como binding desde el arranque. Testcontainers puede reiniciar entonces el mismo contenedor/puerto. La prueba exige que el endpoint completo antes/después sea igual.
- Corrida de recuperación sola: **1 suite / 1 prueba PASS**, rechazo a los **1002 ms**, nuevo ready y consume permitido en el mismo endpoint. Corrida de regresión final: el mismo caso pasa con rechazo a los **1015 ms**. La guardia de 10 s solo hace fallar si no llega ready; no declara recuperación por tiempo transcurrido. El cleanup desconecta el cliente y detiene su contenedor dedicado.

#### Regresiones focales del cliente compartido y CORS

```powershell
pnpm --filter api test:int --runInBand --runTestsByPath test/int/shared/redis-client.int-spec.ts test/int/shared/redis-rate-limiter.int-spec.ts test/int/identity/redis-attempt-lockout.int-spec.ts test/int/identity/login-rate-limit.int-spec.ts test/int/identity/login-lockout.int-spec.ts test/int/identity/rate-limits.int-spec.ts test/int/identity/password-reset.int-spec.ts test/int/identity/change-password.int-spec.ts test/int/storage/rate-limit.int-spec.ts test/int/storage/preview-operation.int-spec.ts test/int/storage/preview-delivery.int-spec.ts test/int/notifications/mailer-contract.int-spec.ts test/int/notifications/mail-degradation.int-spec.ts
```

**13 suites PASS / 85 pruebas PASS / 0 FAIL; 0 snapshots.** Incluye registro/reenvío, login por IP/correo, recuperación/cambio de contraseña y lockout, límites storage, emisión preview, recuperación del cliente y entrega/idempotencia/degradación de correo. No hubo fallo de un comando legítimo por exceder 1000 ms ni se aumentó el deadline. La duración de 140 s de mail-degradation corresponde a los backoffs SMTP deliberados, no a una operación Redis pendiente.

- Preview-operation completo vuelve a pasar **5/5**. En esa corrida el POST recibió 500 en **494 ms**, clasificado por el diagnóstico como `redis-error` (otro rechazo real Redis, anterior al timeout), con los mismos controles de cero lookup/firma y saneamiento. No se obliga a esperar 1000 ms cuando la conexión falla antes; la ruta commandTimeout quedó acreditada por las tres repeticiones y la pausa real.
- Preview-delivery conserva **10/10 PASS**: CORS permitido/denegado, Range/206, exposición de Content-Range/Content-Length y política attachment/octet-stream/no-store/nosniff/sin Set-Cookie. CORS del arnés sigue resuelto.
- La corrida final emitió el aviso de salida tardía de Jest, aunque concluyó correctamente; no hubo console.error de BullMQ en esa corrida. No se cambió BullMQ ni se silenció el aviso. No se ejecutó toda la API a ciegas ni se presenta una suite completa como acreditada.

#### Checks y estado vigente

- `pnpm --filter api typecheck`: PASS.
- `pnpm exec eslint "apps/api/src/shared/infrastructure/redis/redis-client.provider.ts" "apps/api/src/shared/infrastructure/redis/redis-client.provider.spec.ts" "apps/api/test/int/shared/redis-client.int-spec.ts" "apps/api/test/int/storage/preview-operation.int-spec.ts" --max-warnings 0`: PASS, sin warnings.
- Prettier focalizado en esos cuatro TS: PASS tras ajustar únicamente formato de la suite nueva.
- `git diff --check`: PASS; index vacío.
- Archivos de esta ronda: provider y su spec, nueva integración `shared/redis-client.int-spec.ts`, medición/evidencia del test `storage/preview-operation.int-spec.ts` y esta evidencia T-04. Los cambios CORS y demás locales anteriores se conservaron.

**Redis deja de ser el bloqueo de espera indefinida en los escenarios acreditados:** deadline compartido, tres paradas HTTP y recuperación real están verdes. T-04 sigue `[ ]` por la alineación/acreditación pendiente del runtime de objetos (Silo 2026 de integración frente a MinIO local 2025 del plan) y la verificación efectiva de browser/helper con `credentials: 'omit'`, sin Cookie/Bearer/cabeceras Nimbo, en T-07/T-10/T-11. Los avisos de salida tardía quedan registrados, sin ocultarlos. No se cierra la spec ni se modifica T-06. Sin staging, commit, push ni cambio de rama.

### Delimitación T-04: runtime de objetos y evidencia browser diferida (2026-10-16)

Ronda de lectura y documentación sobre `feat/017-previsualizacion`, HEAD `92b6bf0`, index vacío. Redis/CORS y el diagnóstico del timer transitorio de ioredis se conservan; no se modificó código, teardown, imágenes ni versiones, ni se descargaron imágenes. Solo se agrega esta evidencia T-04; T-06 y `specs/README.md` permanecen intactos.

#### Runtime: diferencia deliberada, no defecto por nombre/tag

- **Spec 017 CA-11/§5:** exige el comportamiento de entrega (origen aislado, URL de 300 s, un objeto, attachment/octet-stream/no-store y lectura sin credenciales de la app), sin fijar una imagen o tag. El plan usa MinIO y en §5, línea 142, describe `compose.yml` como MinIO `RELEASE.2025-09-07T16-13-09Z`; esa descripción de la fuente quedó desactualizada, aunque el Dockerfile local sí compila ese tag.
- **Testcontainers:** `test/int/setup/containers.ts:14–15` fija `pgsty/silo:RELEASE.2026-09-16T00-00-00Z`. `startMinio()` usa `server /data`, puerto 9000 publicado en puerto efímero y allowlist `TEST_CORS_ORIGIN`, entregada también a la API por `infra.env()`. El arnés de storage firma con el alias público de ese mismo endpoint y lo distingue de web/API.
- **Compose base:** `compose.yml:40–48` fija el mismo Silo 2026 y transmite `CORS_ORIGIN` a `MINIO_API_CORS_ALLOW_ORIGIN`; `minio-init` usa `pgsty/mc` del mismo tag. No hay divergencia de imagen entre Compose base y Testcontainers.
- **Override local de este worktree:** selecciona `nimbo-minio-local:2025-09-07`, construido mediante `infra/minio/Dockerfile.local` con MinIO `RELEASE.2025-09-07T16-13-09Z` y mc `RELEASE.2025-08-13T08-35-41Z`; conserva el environment CORS heredado del base y publica 9000/9001. Se verificó además `git show HEAD:compose.override.yml`: la versión registrada en HEAD solo publica puertos de MinIO y hereda Silo; no contiene ese build/image local. El Dockerfile local está ignorado. Estos archivos locales se preservan; la configuración leída no se presenta como una inspección de un contenedor actualmente ejecutándose.
- **Intención documentada:** el commit integrado de Adrián `10c7b8e` (#58, 2026-10-07), `docs/adr/0025-imagenes-de-minio-desde-el-fork-de-pigsty.md`, `docs/operations/ambientes.md:80–84` y las notas T-26 de fundaciones documentan el reemplazo por el fork compatible debido a la indisponibilidad de las imágenes originales. El adaptador mantiene S3/SigV4. ADR-0025 todavía muestra **Propuesto**: esta ronda no inventa su aceptación formal ni modifica ADR/plan.
- **Clasificación principal B:** diferencia deliberada/documentada y compatible con el contrato de entrega ya verificado, no un defecto de T-04 que obligue a sustituir Silo por MinIO. La atribución de MinIO 2025 al Compose base en el plan es una referencia documental obsoleta (C para esa afirmación concreta). Se retira como pendiente funcional de T-04 «hacer coincidir Silo 2026 / MinIO 2025». Las pruebas sobre Silo no se presentan como evidencia browser o de un despliegue local/staging diferente; esos recorridos posteriores deben comprobar su runtime efectivo.

#### Recorrido actual: emisión autenticada separada de lectura del objeto

> Recorrido observado en esa ronda, antes de T-07 y de la integración final T-06; la ausencia de helper/lectores descrita aquí quedó superada.

1. `PreviewPage.tsx:144–160` compone `useAuthFetch`, `requestPreviewUrl` y `usePreview`. `preview/api.ts:18–21` hace únicamente `POST /files/:fileId/preview-url` contra `apiPublicUrl`; authFetch añade Bearer y requestJson añade cabeceras de API como x-correlation-id/Accept. Esas cabeceras pertenecen a la petición autenticada a Nimbo.
2. `usePreview` conserva `{ file, url, expiresAt }` en el estado RAM del intento vigente. PreviewPage muestra metadata/estados, pero no hace GET de `delivery.url`, no monta lectores ni obtiene bytes. Descargar usa el flujo público separado de 005 y abre una URL nueva de descarga; no consume la URL de preview como fallback.
3. La búsqueda en web no encontró `preview/readers/object-bytes.ts`, lectores PDF/imagen/texto/OOXML ni un helper GET de bytes presignados. `upload/xhr-put.ts` es un PUT de carga existente, con `withCredentials=false`; no es el helper GET de preview y no acredita ese recorrido. El `objectRequest` de preview-delivery es solo un helper de pruebas Node, no un lector web.
4. Por tanto, **no hay hoy un helper web de preview al que corregirle credentials**. `credentials: 'omit'` está definido como requisito del helper único de T-07 (plan §2.4 y tarea T-07), no como una propiedad ya implementada. No se crea ese helper en T-04 ni se utiliza authFetch para leer objetos.

#### Qué está acreditado y qué queda diferido

- Se conserva la última evidencia ejecutada de preview-delivery **10/10 PASS**, incluida en las 13 suites / 85 pruebas verdes: endpoint autenticado → URL al host de objetos distinto de web/API → GET Node directo, TTL 300, CORS permitido/denegado con GET/OPTIONS reales, Range/206, Content-Range, Content-Length, exposición de headers, attachment/octet-stream/no-store/nosniff y ausencia de Set-Cookie. Las peticiones Node no copian Authorization/Cookie ni cabeceras privadas de Supertest. Esta lectura no repite la suite porque no cambió código/configuración ni apareció una regresión.
- **Ningún GET de preview desde navegador real está acreditado todavía.** Los tests de componentes/jsdom acreditan el shell y la emisión, no el envío de cookies de un navegador, su aplicación de CORS ni las cabeceras del lector. Node no tiene el cookie jar de la app; su resultado no demuestra `credentials: 'omit'` en web.
- **T-07:** implementar/probar el helper GET/rangos con `credentials: 'omit'`, sin authFetch, Bearer, Cookie ni cabeceras Nimbo, y con cancelación. **T-08/T-09:** consumidores reales PDF/OOXML del mismo helper, sin duplicar la política. **T-10:** acreditar el GET/Range desde navegador y el tráfico efectivo del lector integrado, ausencia de credenciales y aplicación de CORS en el runtime/origen utilizado. **T-11:** comprobar el recorrido humano y DevTools correspondiente. Nada de ello se adelanta en esta ronda.
- **Estado T-04:** se mantiene `[ ]`, sin un nuevo RED ni un fallo abierto de Redis/CORS/backend. La salvedad que sigue sin acreditarse con la aplicación real es la frase literal «ausencia de Cookie/Bearer en el origen efectivo» para el GET del lector en navegador (spec CA-11/§5); queda explícitamente como **evidencia transversal diferida** a T-07/T-10/T-11, no como una implementación de lector a cargo de T-04. La tensión de secuenciación ya documentada no se resuelve cambiando tareas/criterios para marcar la casilla. La diferencia de nombres/tags deja de ser un bloqueo funcional separado; la trazabilidad/estado documental de ADR-0025 y la referencia antigua del plan se señalan sin corregir documentos ajenos a esta autorización.

Verificación de esta ronda documental: `git diff --check`. Sin commit, push, staging ni cambio de rama.

## T-06 — continuación del worktree y evidencia web (2026-10-12)

> Evidencia histórica: el stub, los fallos y los pendientes de esta continuación fueron atendidos en las revisiones posteriores. El cierre vigente está [al final](#cierre-técnico-t-06-y-t-07-2026-10-18).

T-06 permanece `[ ]`; T-04 permanece `[ ]`. Continuación autorizada por Abel sobre `feat/017-previsualizacion`, sin reiniciar el trabajo. La habilitación explícita del catálogo permite exclusivamente las cuatro entradas de `STORAGE_PREVIEW_FAILURE_CODES` y sus pruebas; no se agregaron códigos a `STORAGE_ERROR_CODES`. Redis y CORS son pendientes de T-04/infra compartida y no bloquean esta implementación web.

### Estado recuperado y revalidación

- Precheck read-only: `git status --short`, `git diff --stat` y lectura del código actual, spec/plan/tasks y APIs públicas T-05. La rama se verificó con `git branch --show-current`. Existían 14 archivos de preview: siete piezas y siete suites. `PreviewPage.tsx` era un stub `null`; sus pruebas ya existían. Faltaba el index público y `PreviewStates` todavía omitía los fallos locales de lectores.
- Se conservaron los cambios previos de T-04 en las seis suites/helpers API señalados por Abel, así como los cambios previos de este archivo y de `specs/README.md`. Ninguno de esos archivos API ni el backlog fue editado en esta continuación.
- Revalidación inicial de `PreviewMenuItem.spec.tsx` + `PreviewStates.spec.tsx`: **2 suites / 25 pruebas PASS**, incluido axe, sin warnings `act` ni `next/link`.
- Después, `routes.spec.ts`, `api.spec.ts`, `preview-failure.spec.ts` y `hooks/use-preview.spec.tsx`: **4 suites / 23 pruebas PASS**. No se recrearon los RED históricos aportados por Abel.

### RED → GREEN observado en esta continuación

- Catálogo: `pnpm --filter web test --runInBand --runTestsByPath src/lib/error-catalog.spec.ts`. Antes de producción: **4 fallos / 29 pases**; `storageMessage` devolvía `null` para las cuatro entradas ausentes. Después: **33/33 PASS**, incluyendo el texto completo exacto de `messageForCode` y causa/solución separadas. Corrupción usa «su tipo»; `unsupported` conserva su entrada HTTP distinta.
- Estados: **6 fallos / 34 pases** en la corrida de `PreviewStates` + `preview-failure`: faltaban las cinco presentaciones locales y el vacío válido. Tras conectarlas: **40/40 PASS**. `protected`, `corrupt`, `unavailable` y `expired` consumen el catálogo; `memory` reutiliza unavailable. Descargar es primario/primero salvo en expiración. Solo hay callbacks manuales. Corrupto usa alert; protegido/indisponibilidad/expiración usan status. Los códigos de lector sintéticos siguen clasificándose como unexpected si se introducen indebidamente como errores HTTP; no se atribuyen al POST.
- `PreviewPage.spec.tsx` se ejecutó intacto contra el stub antes de editarlo: **7 fallos / 6 pases**, sin región, encabezado ni acciones. Los seis pases sobre DOM vacío no acreditaban privacidad/axe del shell. Se corrigió el harness para aportar el único `main` desde el layout de prueba y exigir región/h1 antes de axe; las firmas de T-05 usadas por la suite eran reales. Implementación y pruebas ampliadas: **19/19 PASS** en la validación final.
- Comprobación nueva del borde temporal exacto: **2 fallos / 28 pases** en `PreviewPage` + `usePreview` al exigir que a 2000 ms aún no haya espera prolongada y que retry/cambio de archivo reinicien el timer. Se ajustó el umbral a 2001 ms: **30/30 PASS**. No reemite ni mueve el foco al vencer.
- Revisión de calidad posterior: `classifyPreviewFailure` consultaba propiedades heredadas de `API_REASONS`. Con códigos desconocidos `constructor`, `toString` y `__proto__`, `reason` recibía funciones/objetos en vez de `unexpected`. Regresión mínima observada en `preview-failure.spec.ts`: **RED de 3 fallos / 11 pases**. La corrección funcional ya realizada exige propiedad propia del mapa, sin alterar los códigos HTTP admitidos ni las razones locales. **GREEN final de preview-failure: 14/14 PASS**. Las tres guardias nuevas elevan el focal de 120 a 123 pruebas.

### Comportamiento acreditado de la base T-06

- `PreviewPage` adapta `useAuthFetch` + `apiPublicUrl` a `requestPreviewUrl`, valida la entrega por contracts y usa `usePreview`. Solo después de entrega válida muestra nombre, kind mediante `FileTypeChip`, tamaño, fecha de modificación y «Solo lectura». El área de éxito es el shell sin lector; no realiza GET de objetos ni crea bytes, Blob/object URLs, canvas, iframe, workers o motores.
- Loading anuncia «Abriendo la vista previa…»; después de >2 s, «Preparando la vista previa…», con progressbar indeterminado sin porcentaje. No usa metadata recordada ni supone archivo grande. Se prueban limpieza del timer al resolver/rechazar, retry, cambio de fileId y unmount.
- Retry manual elimina la entrega anterior, reautoriza y devuelve foco a la región estable antes de retirar el control. AbortSignal e identidad del intento descartan respuesta/error tardíos, incluso si el transporte ignora el aborto. El shell está keyed por fileId para retirar inmediatamente también metadata y lifecycle de descarga anteriores.
- Descargar solicita una URL nueva mediante el `useFileDownload` público de 005. Nunca usa `delivery.url` como enlace ni fallback. Se prueban descarga por teclado, petición no duplicada, reintento de descarga con nueva URL, fallo saneado sin excepción original y descarte tras unmount/cambio de archivo/retry de preview. El puerto 005 no ofrece cancelación: se invalida la continuación, sin fingir aborto del transporte de descarga.
- Privacidad: pruebas de DOM, atributos, storage, cookies y consola; URL firmada/clave/firma/`expiresAt` no llegan al DOM. Producción no persiste ni registra delivery, contenido o errores crudos. La entrega vive en el estado RAM del intento vigente.
- Foco/accesibilidad: entrada a región estable con nombre «Vista previa», h1 seguro, `aria-busy`, controles con nombres accesibles, foco visible, timer sin movimiento de foco y axe del shell/estados. El shell no agrega `main`; AppLayout lo aporta.
- Vacío válido se presenta únicamente como éxito explícito sin unidades (`PreviewStates.empty`), con «Este archivo no tiene contenido para mostrar.», status y Descargar; no se infiere del tamaño ni de la URL. Los estados locales y el vacío están probados a nivel presentacional. Detectarlos sobre documentos reales y conectarlos a sus productores corresponde a T-07/T-08/T-09; no se simuló un reader.
- `PreviewMenuItem` usa kind, no extensión: pdf/texto/imagen/xlsx/pptx primero en el slot real `firstAction`; docx/otro excluidos. Abrir el menú no emite URL de preview. Teclado y axe pasan.
- Retorno por `returnPathOf({ id, folderId })`: solo id/carpeta de la entrega vigente; sin entrega/404, raíz con el fileId de ruta para foco. No hay captura de orden/páginas/filtros/overlays/breadcrumbs/nombre de carpeta. Las pruebas existentes de MyFiles acreditan el `useReturnFocus` real: fila o encabezado y espera del listado.
- `preview/index.ts` publica `PreviewPage`/props, `PreviewMenuItem` y el puente cliente existente `PreviewFiles`. No publica cliente HTTP, clasificación ni estado/helpers internos.

### Validación focal final y checks

```powershell
pnpm --filter web test --runInBand --runTestsByPath src/features/storage/preview/routes.spec.ts src/features/storage/preview/api.spec.ts src/features/storage/preview/preview-failure.spec.ts src/features/storage/preview/hooks/use-preview.spec.tsx src/features/storage/preview/components/PreviewMenuItem.spec.tsx src/features/storage/preview/components/PreviewStates.spec.tsx src/features/storage/preview/components/PreviewPage.spec.tsx src/lib/error-catalog.spec.ts
```

**8 suites focales / 123 pruebas PASS**, 0 snapshots, sin warnings del harness T-06. Los 120 pases anteriores se conservan como evidencia histórica previa a las tres regresiones de códigos heredados.

- `pnpm --filter web typecheck`: PASS. Se corrigió el paso de `signal: undefined` del cliente recuperado para respetar `exactOptionalPropertyTypes`; si no hay señal, se omite esa propiedad.
- `pnpm exec eslint "apps/web/src/features/storage/preview/**/*.{ts,tsx}" "apps/web/src/lib/error-catalog.ts" "apps/web/src/lib/error-catalog.spec.ts" --max-warnings 0`: PASS, sin warnings. Sin excepciones ni cambios de reglas.
- `pnpm exec prettier --check "apps/web/src/features/storage/preview/**/*.{ts,tsx}" "apps/web/src/lib/error-catalog.ts" "apps/web/src/lib/error-catalog.spec.ts"`: PASS.
- `git diff --check`: PASS. No se formatearon archivos ajenos a T-06.

Pulido de cierre autorizado: solo se ajustaron dos títulos de pruebas, sin cambiar comportamiento, fixtures ni assertions. El caso de tasa en `PreviewStates.spec.tsx` se identifica como guardia complementaria de **017 CA-12**, sin ampliar las CA oficiales de T-06 (**CA-2, CA-6, CA-7, CA-9**). El título de persistencia/consola de `PreviewPage.spec.tsx` describe únicamente la entrega exitosa que ejecuta; los fallos se cubren en otras pruebas. Esta pasada no modifica producción ni repite la suite web completa.

### Regresiones, suite completa y pendientes de cierre

```powershell
pnpm --filter web test --runInBand --runTestsByPath src/features/storage/components/my-files.spec.tsx src/features/storage/components/file-row-menu.spec.tsx src/features/storage/hooks/use-file-download.spec.tsx src/features/storage/routes.spec.ts "src/app/(app)/(cliente)/archivos/page.spec.tsx" "src/app/(app)/(cliente)/archivos/carpeta/[folderId]/page.spec.tsx" "src/app/(app)/(cliente)/archivos/vista-previa/[fileId]/page.spec.tsx"
```

- Regresiones: **6 suites PASS / 1 FAIL; 75 pruebas PASS / 1 FAIL**. MyFiles incluye las cinco pruebas de retorno/foco de `useReturnFocus`; no existe una suite separada de ese hook. Download público, rutas y los tres wrappers pasan.
- `FileRowMenu`: falla `CA-21: usa solo tokens de Cielo Sereno, sin colores crudos`, línea 366: tras descargar con 429 y volver a pulsar Enter, `[role="menu"]` es `null`. Reproducción sola mediante `pnpm --filter web test --runInBand --runTestsByPath src/features/storage/components/file-row-menu.spec.tsx`: **18 pases / 1 fallo**. Test y producción no tienen diff; esa suite no importa preview ni el catálogo modificado. No se atribuyó una causa definitiva ni se modificó su expectativa/producción fuera de ownership.
- El wrapper marcador de vista previa pasa, pero conserva el warning `act` de `ForwardRef(LinkComponent)`/`next/link`; no es un warning de las suites nuevas de T-06.
- Última suite web completa ejecutada mediante `pnpm --filter web test --runInBand`, después del ajuste de composición y antes de la revisión de códigos heredados/pulido de títulos: **149 suites PASS / 1 FAIL (150); 1212 pruebas PASS / 1 FAIL (1213)**; 0 snapshots. Único fallo: el mismo FileRowMenu. No se declara la suite completa verde ni una nueva corrida completa en esta pasada.
- Ownership actual: plan §2.2/§2.5 y T-05 mantienen los tres wrappers en Adrián; no hay habilitación explícita de T-06 para editarlos. Integración mínima pendiente: raíz/carpeta deben usar `PreviewFiles` público conservando ubicación/key/`returnFocusOf`; vista-previa debe reemplazar el marcador por `PreviewPage fileId={fileId} apiPublicUrl={getEnv().API_PUBLIC_URL}`, dentro del layout existente, sin otro `main`. Los wrappers y sus suites no se tocaron.
- Para proponer el cierre T-06 faltan esa integración autorizada y resolver/revalidar la regresión FileRowMenu en su frontera; al sustituir el marcador, revalidar también su harness sin warning. No es correcto afirmar que solo queda un wrapper mientras la regresión está roja. Las garantías browser/360–1440 y lectura real continúan en T-07+/T-10/T-11 y no se acreditan con jsdom.

Archivos de esta continuación: cambios sobre piezas/tests existentes dentro de `apps/web/src/features/storage/preview/`, nuevo `preview/index.ts`, los dos archivos autorizados `apps/web/src/lib/error-catalog.{ts,spec.ts}` y este registro agregado al final de tasks. No se ejecutaron Redis/CORS de T-04, commits, push, amend, merge, rebase, reset ni cambios de rama. No se marcó T-06 `[x]` ni se cerró la spec.

### Revisión T-06 sobre integración actual — evidencia nueva (2026-10-16)

Base verificada mediante precheck read-only: rama `feat/017-previsualizacion`, HEAD `150e76b` (`test(storage): FileRowMenu reabre el menú tras el cierre de foco de Radix [017 T-06]`), precedido por `8de5dec` (`feat(storage): conecta PreviewFiles y PreviewPage en las rutas [017 T-06]`). Ambos cambios de Matul ya estaban incorporados antes de editar. Esta evidencia sustituye los pendientes históricos de wrappers/FileRowMenu descritos arriba; no eran trabajo faltante en esta ronda. Los cambios locales API de T-04, `specs/README.md` y los bloques documentales ajenos a T-06 se conservaron.

#### Observaciones atendidas y cobertura

- **DRY:** `FILE_TYPES` y `CHIP_TYPE_BY_KIND` tenían los mismos siete pares: docx→docx, pdf→pdf, xlsx→xlsx, pptx→pptx, imagen→img, texto→text, otro→other; solo difería el orden. Fuente neutral única en `features/storage/file-type.ts`, `Readonly<Record<FileKind, FileType>>`, exportada por `storage/index.ts`. NodeRows, QuickAccessSection, PreviewPage y el consumidor adicional TrashList usan ese mapa; preview no importa NodeRows. La extracción conserva comportamiento y usa la cobertura existente de chips/listas, sin fabricar RED para mover una constante.
- **Fecha:** no existe en `lib/format-date.ts` un helper con el formato de modificación requerido. PreviewPage reutiliza `DATE_LOCALE` (`es-GT`) con `dateStyle: 'medium'`. Se amplió la prueba de metadata autorizada: RED real `10 oct 2026` frente a `10/10/2026`; GREEN con la convención compartida.
- **YAGNI:** las vistas T-06 no consumían `PreviewFailure.retryAfterSeconds`; solo el clasificador y su test lo transportaban. Se retiraron la propiedad y su propagación/validación locales. Se ajustaron las cinco expectativas de clasificación al modelo reducido; conservan `STORAGE_TOO_MANY_REQUESTS`→`rate-limited`. El 429 mantiene mensaje y acciones manuales existentes, sin segundos ni countdown. `ApiClientError`, cliente HTTP y contratos siguen intactos: identity sí consume Retry-After, y `preview/api.spec.ts` conserva la prueba de propagación del error compartido.
- **SRP:** `PreviewFiles` y su prueba de composición viven en archivos propios `components/PreviewFiles.{tsx,spec.tsx}`. El export público `preview/index.ts` conserva `PreviewFiles`, `PreviewMenuItem`, `PreviewPage` y sus props existentes. La prueba movida consume ese export público y verifica las mismas props + `firstAction`, sin estado adicional; no se fabricó RED para el movimiento.
- **Enlace:** PreviewMenuItem usa Radix `DropdownMenuItem asChild` con el `Link` real, `href={previewPathOf(file.id)}` y `prefetch={false}`. Se retiraron useRouter/router.push y los mocks de next/navigation en su suite y en las specs de raíz/carpeta. Solo se sustituyeron las expectativas de push por anchor/href; las demás expectativas de Matul se conservaron. Las cinco categorías admitidas siguen primero aunque el nombre termine en docx; docx/otro siguen excluidos por kind. Se verifican activación con Enter, foco del ítem, cierre del menú, ruta, ausencia de descarga/emisión anticipada y axe. El listener de la prueba cancela únicamente la navegación nativa de jsdom, sin simular next/link ni next/navigation.
- **Regla de tres:** openInBrowser conserva sus dos implementaciones sin extracción. `quick-access-sidebar.tsx` ya reutiliza la de FileRowMenu; es un consumidor adicional, no una tercera implementación duplicada.

RED observado antes de cambiar producción: `pnpm --filter web test --runInBand --runTestsByPath src/features/storage/preview/preview-failure.spec.ts src/features/storage/preview/components/PreviewMenuItem.spec.tsx src/features/storage/preview/components/PreviewPage.spec.tsx`: **3 suites FAIL; 12 pruebas FAIL / 32 PASS (44)**. Fallos: seis de semántica/ruta del enlace, uno de fecha y cinco por la propiedad local retirada. GREEN posterior con toda la cobertura focal siguiente.

#### Integración de Matul revalidada

- Raíz: PreviewFiles público, `folderId={null}` y `returnFocusOf(await searchParams)`, sin estado adicional.
- Carpeta: PreviewFiles público con `folderId`, `key={folderId}` y `returnFocusOf(search)` conservados.
- Vista previa: PreviewPage público con `fileId` y `getEnv().API_PUBLIC_URL` dentro de StorageAppLayout. AppLayout aporta el único main; no se agregaron breadcrumbs ni estado del explorador. El wrapper y su spec no precisaron cambios; pruebas de POST, retorno, layout/cuota y axe pasan sin el warning act histórico.
- FileRowMenu: producción y spec sin modificaciones en esta ronda. Su suite completa de **19 pruebas PASS**, incluido `CA-21: usa solo tokens de Cielo Sereno, sin colores crudos`, pasó en regresión focalizada y nuevamente dentro de la suite web completa, usando la corrección de foco ya incorporada en HEAD.

#### Validación final ejecutada

```powershell
pnpm --filter web test --runInBand --runTestsByPath src/features/storage/preview/routes.spec.ts src/features/storage/preview/api.spec.ts src/features/storage/preview/preview-failure.spec.ts src/features/storage/preview/hooks/use-preview.spec.tsx src/features/storage/preview/components/PreviewMenuItem.spec.tsx src/features/storage/preview/components/PreviewStates.spec.tsx src/features/storage/preview/components/PreviewPage.spec.tsx src/lib/error-catalog.spec.ts src/features/storage/preview/components/PreviewFiles.spec.tsx
```

**9 suites PASS / 0 FAIL; 123 pruebas PASS / 0 FAIL; 0 snapshots; sin warnings.** La prueba de composición se movió a su propia suite: no se perdió cobertura ni se incrementó artificialmente el número de pruebas.

```powershell
pnpm --filter web test --runInBand --runTestsByPath src/features/storage/components/my-files.spec.tsx src/features/storage/components/file-row-menu.spec.tsx src/features/storage/hooks/use-file-download.spec.tsx src/features/storage/routes.spec.ts src/features/storage/components/node-table.spec.tsx src/features/storage/components/file-explorer.spec.tsx src/features/storage/components/folder-disclosure.spec.tsx src/features/storage/components/quick-access-section.spec.tsx "src/app/(app)/(cliente)/papelera/page.spec.tsx" "src/app/(app)/(cliente)/archivos/page.spec.tsx" "src/app/(app)/(cliente)/archivos/carpeta/[folderId]/page.spec.tsx" "src/app/(app)/(cliente)/archivos/vista-previa/[fileId]/page.spec.tsx"
```

**12 suites PASS / 0 FAIL; 180 pruebas PASS / 0 FAIL; 0 snapshots; sin warnings.** Incluye NodeRows mediante NodeTable/FileExplorer/FolderDisclosure, QuickAccessSection, TrashList mediante papelera, MyFiles/retorno/foco, descarga pública, rutas y los tres wrappers. Total focal + regresiones, sin solapamiento: **21 suites / 303 pruebas PASS**.

- `pnpm --filter web typecheck`: PASS.
- `pnpm exec eslint "apps/web/src/features/storage/preview/**/*.{ts,tsx}" "apps/web/src/features/storage/file-type.ts" "apps/web/src/features/storage/index.ts" "apps/web/src/features/storage/components/node-rows.tsx" "apps/web/src/features/storage/components/quick-access-section.tsx" "apps/web/src/features/storage/components/trash-list.tsx" "apps/web/src/app/(app)/(cliente)/archivos/page.spec.tsx" "apps/web/src/app/(app)/(cliente)/archivos/carpeta/[folderId]/page.spec.tsx" --max-warnings 0`: PASS, 0 warnings. Primera ejecución: un error import-x/order en PreviewFiles.spec.tsx; se corrigió únicamente el orden y se repitió con éxito antes de la suite completa.
- `pnpm exec prettier --check "apps/web/src/features/storage/preview/**/*.{ts,tsx}" "apps/web/src/features/storage/file-type.ts" "apps/web/src/features/storage/index.ts" "apps/web/src/features/storage/components/node-rows.tsx" "apps/web/src/features/storage/components/quick-access-section.tsx" "apps/web/src/features/storage/components/trash-list.tsx" "apps/web/src/app/(app)/(cliente)/archivos/page.spec.tsx" "apps/web/src/app/(app)/(cliente)/archivos/carpeta/[folderId]/page.spec.tsx"`: PASS.
- `git diff --check`: PASS.
- **Suite web completa final:** `pnpm --filter web test --runInBand`: **151 suites PASS / 0 FAIL; 1221 pruebas PASS / 0 FAIL; 0 snapshots; 172.065 s; sin warnings**, incluidos FileRowMenu y todos los wrappers. Sustituye como validación actual el resultado histórico rojo de 150 suites.

#### Comparación literal de T-06 y decisión de cierre

> Decisión histórica del 2026-10-16: la ausencia de lifecycle real que impedía cerrar T-06 quedó superada por el cierre técnico del 2026-10-18.

El wording oficial de T-06 (fila de tareas) se conserva y la casilla permanece `[ ]`. Shell/cliente/rutas/usePreview, kinds y primer ítem, progreso >2 s, estados presentacionales (incluidos vacío y memoria), acciones, cancelación/descarte, privacidad en memoria, retorno/foco y pruebas de componente/axe están acreditados por las suites citadas. Los wrappers ya están integrados y FileRowMenu está verde; ninguno sigue siendo pendiente.

La frase literal **«Reintento manual destruye la lectura previa y reemite»** solo está acreditada en su parte de emisión: el shell retira delivery, aborta/descarta el intento previo y reemite. Todavía no existe un lector montado ni su lifecycle de destrucción; no se puede presentar la prueba de aborto del POST como prueba de liberación de una lectura real. **Pendiente exacto para proponer cierre literal:** conectar y acreditar la destrucción/liberación de la lectura previa al reintentar cuando T-07/T-08/T-09 incorporen sus lectores. Los estados locales/vacío/memoria están cubiertos presentacionalmente; su detección en documentos reales corresponde a esas tareas. No se implementaron lectores en esta revisión ni se modificaron requisitos para cerrar la casilla. Browser 360/1440 y demo continúan en T-10/T-11; mostrar Retry-After continúa en T-11.

Archivos de esta revisión: fuente neutral `storage/file-type.ts`, export `storage/index.ts`, imports en `components/{node-rows,quick-access-section,trash-list}.tsx`; `preview/components/PreviewFiles.{tsx,spec.tsx}` nuevos; ajustes en `PreviewMenuItem.{tsx,spec.tsx}`, `PreviewPage.{tsx,spec.tsx}`, `preview/index.ts` y `preview-failure.{ts,spec.ts}`; specs de raíz/carpeta y únicamente este bloque T-06. Sin staging, commit, amend, push ni otras operaciones de escritura Git. T-04 y la spec conservan su estado.

## Cierre técnico T-06 y T-07 (2026-10-18)

### T-06 — evidencia final de cierre

- **Commit:** `88a55ad47b7fc33d3c7e52c5c1dfb199f9f0c351`.
- **Mensaje:** `feat(storage): integrar lectores en shell de previsualización [017 T-06]`.
- `PreviewReader` integrado en `PreviewPage`, seleccionado por `kind`; `usePreview` crea una generación nueva por retry, aunque la URL reemitida sea la misma, y se inicia otra lectura de bytes.
- **«Reintento manual destruye la lectura previa y reemite» ya está acreditado con lectores reales Image/Text:** `usePreviewContent.retire()` invalida callbacks y espera cleanup antes de reemitir. Las pruebas comprueban cancel/release y revoke de A antes del POST siguiente, sin confundir aborto de emisión con liberación del lector.
- `ready`/`failure` obsoletos no afectan a la generación vigente; unmount aborta/libera y salir durante cleanup impide una reemisión posterior. Progreso de lectura después de >2 s, sin reemisión automática ni movimiento de foco.
- Fallos del lector saneados, con Descargar/Volver conservados cuando corresponde; la descarga mantiene el flujo público 005. Un 403/404 posterior de la API retira metadata y contenido previos.
- Lifecycle real de `ImagePreview`/`TextPreview`, pruebas de componentes y `jest-axe`; URL firmada fuera del DOM y URL/contenido solo en memoria, sin persistencia ni logs privados.

**T-06 queda `[x]`**. Se conserva íntegro el wording oficial. La integración usa lectores y helper reales con red y eventos gráficos controlados; browser real/360–1440 y demo se consolidan en T-10/T-11.

### T-07 — evidencia final de cierre

- **Commit:** `3b12c55fff76e9ac4fbce51d315b858158f84181`.
- **Mensaje:** `feat(storage): implementar lectores nativos de previsualización [017 T-07]`.
- **`object-bytes`:** helper único de GET con `credentials: 'omit'`, sin Authorization/Cookie/cabeceras Nimbo, propagación de AbortSignal y cancelación. Range exige 206 y Content-Range compatible; valida Content-Length cuando existe y la longitud real al consumir el stream. Admite ajuste legítimo al EOF, rechaza rangos/respuestas inválidos sin fallback automático a GET completo y sanea errores incluso tardíos.
- **Imagen:** PNG/JPG/JPEG/GIF/WebP mediante detección MIME local, bytes del helper, Blob/object URL e `img` nativo, sin proxy/optimización. Cleanup idempotente, abort/cancel/release, revoke y protección frente a resultados obsoletos. Firmas y eventos gráficos controlados en tests; la decodificación gráfica en navegador real corresponde a T-10.
- **TXT/MD:** TextDecoder UTF-8 incremental con `fatal: true`; preserva caracteres multibyte partidos entre chunks y muestra texto literal escapado, sin Markdown→HTML ni `dangerouslySetInnerHTML`. Sin truncamiento ni límite nuevo; texto vacío o blanco válido; UTF-8 inválido retira el parcial. Cancelación/liberación y protección frente a entregas/lecturas obsoletas.
- `ReaderEvents` pertenece a T-07 porque los lectores consumen directamente `onReady` y `registerCleanup`. T-07 no depende de las piezas nuevas T-06; T-06 consume el transporte y los lectores de T-07.

**T-07 queda `[x]`**. Se conserva íntegro el wording oficial; los consumidores PDF/OOXML siguen pendientes en T-08/T-09.

### Regresión vigente consolidada

Ejecuciones posteriores a ambos commits técnicos, acreditadas en la ronda técnica anterior. Esta actualización documental registra sus resultados sin presentarlos como pruebas reejecutadas ahora.

| Verificación | Resultado |
|---|---|
| `pnpm --filter web test --runInBand src/features/storage/preview` | 15 suites / 269 tests PASS |
| `pnpm --filter web test --runInBand` | 158 suites / 1400 tests PASS; 0 fallos, sin warnings observados, exit code 0 |
| `pnpm --filter web typecheck` | PASS |
| `pnpm exec eslint "apps/web/src/features/storage/preview/**/*.{ts,tsx}" --max-warnings 0` | PASS / 0 warnings |
| `pnpm exec prettier --check "apps/web/src/features/storage/preview/**/*.{ts,tsx}"` | PASS |
| `git diff --check` | PASS |

La spec permanece **En curso**; T-04 `[ ]`, T-08 `[ ]`, T-09 `[ ]`, T-10 `[ ]` y T-11 `[ ]`. Sus requisitos no cambian. Esta ronda es exclusivamente documental y no implementa lectores adicionales.

> Estado de la ronda del cierre T-06/T-07; T-08 quedó cerrada después, en el bloque siguiente.

## Cierre técnico T-08 (2026-10-18)

- **Commit:** `3e591627`, `feat(storage): implementar lector PDF con PDF.js por rangos [017 T-08]`. 25 archivos, todos bajo `apps/web/src/features/storage/preview/`: 6 existentes modificados y 19 nuevos. Sin cambios en `package.json`, `pnpm-lock.yaml`, contracts, API ni otras fronteras.
- Las extensiones de `readers/object-bytes.ts` (`totalLength` del `Content-Range` ya validado; el GET completo conserva su contrato) y de `hooks/use-preview-content.ts` (`pdf` como lector gestionado y razones cerradas `protected`/`corrupt`/`unavailable`/`memory`/`expired`) son habilitación de T-08, no reapertura de T-06/T-07.

### T-08a — transporte, worker y página

- `readers/pdf-range-transport.ts`: `PDFDataRangeTransport` público que delega cada rango en `fetchObjectBytes`; la longitud se obtiene con `Range: bytes=0-0` validado por el helper, sin HEAD. No repite GET/credenciales/validación de rango/cancelación. Detecta un objeto que cambia de longitud durante la lectura y comunica solo `unavailable`.
- `readers/pdfjs-runtime.ts` + `workers/pdfjs.worker.ts`: motor y `pdf.worker.mjs` del mismo paquete fijado (`6.4.299`, comprobado en ejecución), cargados solo en el cliente. cMaps, fuentes estándar y WASM locales mediante `require.context` y `pdf-asset-loader.cjs`; se leen con `fetch` de mismo origen y `credentials: 'omit'`, sin pasar por el helper de objetos firmados, que queda reservado al PDF privado. `iccUrl` termina en `?profile=/` porque PDF.js exige `/` final y el worker concatena el nombre del perfil: el nombre queda en la query y se sirve el asset ICC local con hash.
- `readers/pdfjs-adapter.ts`: `getDocument` solo con `range` (la URL firmada nunca llega al motor ni a `httpHeaders`), `disableStream`, `disableAutoFetch`, `stopAtErrors`, `enableXfa: false`, `useWorkerFetch: false` y `VerbosityLevel.ERRORS`. `AnnotationMode.ENABLE` solo pinta apariencias estáticas en el canvas; no hay AnnotationLayer, scripting manager/sandbox, viewer, formularios ni acciones. Errores de transporte saneados; destruye task, rangos, página y runtime de forma idempotente.

### T-08b — páginas, texto y estados

- `components/PdfPreview.tsx`: todas las páginas navegables bajo demanda con Anterior/Siguiente, un solo canvas, ready solo tras representar la página y progreso >2 s del shell. Registra cleanup esperable para retry/unmount; descarta aperturas y eventos tardíos.
- `readers/pdf-text-reader.ts`: TextLayer transparente `aria-hidden` para selección y bloque literal `sr-only` desde `streamTextContent`, completo aunque TextLayer limite sus textDivs; sin duplicación visual ni HTML.
- Escaneado visible en canvas sin OCR. `onPassword` informa `protected` sin pedir contraseña; `InvalidPDFException` → `corrupt`; PDF de 0 páginas → «Este archivo no tiene contenido para mostrar.».
- Memoria: `memory` solo para el texto exacto de asignación fallida de V8 (`RangeError: Array buffer allocation failed`), SpiderMonkey (`InternalError: out of memory`) y JavaScriptCore (`RangeError: Out of memory`), ya sea directo o como `details` de `UnknownErrorException` del worker. Un `RangeError` genérico, otro mensaje o un `TypeError` con el mismo texto siguen siendo `unavailable`; el mensaje original nunca se propaga. Causa saneada con Descargar primero y Reintentar, sin límite distinto de 005. Una imposibilidad de crear un canvas muy grande no tiene señal fiable y queda como `unavailable`, con la misma presentación al usuario.

### Evidencia

| Verificación | Resultado |
|---|---|
| Lifecycle focal (`PreviewPage.pdf.spec.tsx` + `PdfPreview.spec.tsx`), revalidación inicial | 15/15 PASS |
| `readers/pdfjs-adapter.real.spec.ts` — **PDF.js real + canvas nativo en Node, no navegador real**: válido, multipágina con texto, escaneado, protegido, corrupto, fallo de transporte, fallo de rango, JavaScript detectable no ejecutado y retry con la misma URL | 9/9 PASS |
| `pnpm --filter web test --runInBand src/features/storage/preview` | 22/22 suites, 328/328 tests PASS |
| `pnpm --filter web test --runInBand` | 165/165 suites, 1459/1459 tests PASS; 0 warnings; exit code 0 |
| `pnpm --filter web typecheck` | PASS |
| `pnpm exec eslint "apps/web/src/features/storage/preview/**/*.{ts,tsx,mjs,cjs}" --max-warnings 0` | PASS, 0 warnings |
| `pnpm exec prettier --check "apps/web/src/features/storage/preview/**/*.{ts,tsx,mjs,cjs,css}"` | PASS |
| `git diff --check` | PASS |
| `readers/testing/pdf-build-check.mjs` (webpack interno de Next) | 3 WASM, 168 CMaps, 14 fuentes, 1 ICC, 1 worker local, 0 referencias a CDN, 0 assets de scripting |

- El build check fija invariantes, no el número incidental de chunks JS; crea su directorio temporal directamente bajo `tmpdir()`. `next build` no se ejecutó en esta ronda (EPERM conocido de symlinks standalone en Windows/OneDrive).
- Las suites de componentes y de integración con el shell usan jsdom con el motor sustituido; la garantía del motor proviene de la suite real en Node. Ninguna de ellas es evidencia de navegador real.
- Privacidad: URL firmada fuera de DOM, `href`/`src`, logs, `localStorage`/`sessionStorage`, cookies y mensajes de error; el objeto se lee solo con `fetchObjectBytes`, `credentials: 'omit'` y `Range` como única cabecera.

### Diferencias de UX a revisar en T-10

No son defectos funcionales ni cambios obligatorios de T-10; se registran para revisarlas contra el mockup `docs/design/mockups/storage/vista-previa/`:

1. El visor navega una página a la vez con Anterior/Siguiente; el mockup muestra páginas apiladas con campo de página.
2. En un PDF de 0 páginas, Descargar se ofrece en el encabezado del shell; el mockup lo ubica dentro del estado vacío y lo retira del encabezado.

### Nota no bloqueante de reproducibilidad del tooling

La suite real utiliza `@napi-rs/canvas`, actualmente disponible como dependencia opcional/transitiva de `pdfjs-dist` y presente en el lockfile; declararlo directamente puede evaluarse como endurecimiento compartido posterior.

### Estado

**T-08 queda `[x]`**, con T-08a y T-08b `[x]`. La evidencia en navegador real (GET/Range, CORS, ausencia efectiva de Cookie/Bearer/cabeceras Nimbo, origen de objetos, axe 360/1440 y E2E) queda para T-10/T-11. T-04 permanece `[ ]`; T-06 y T-07 permanecen `[x]`; T-09, T-10 y T-11 permanecen `[ ]`. La spec permanece **En curso**.

> Estado de la ronda del cierre T-08; T-09 quedó cerrada después, en el bloque siguiente.

## Cierre técnico T-09 (2026-10-19)

Commits, todos bajo `apps/web/src/features/storage/preview/` salvo el registro D1 en `plan.md`; sin cambios en `package.json`, `pnpm-lock.yaml`, contracts, API ni otras fronteras:

| Subtarea | Commit | Mensaje |
|---|---|---|
| T-09a | `2ca51dd1` | `feat(storage): implementar base OOXML segura por rangos [017 T-09a]` |
| T-09a | `40fd1420` | `test(storage): validar cancelación OOXML y registrar D1 [017 T-09a]` |
| T-09b | `297fb873` | `feat(storage): implementar lector XLSX por ventanas [017 T-09b]` |
| T-09b | `06ae2fa1` | `fix(storage): corregir fechas y estilos XLSX [017 T-09b]` |
| T-09b | `ad75c78a` | `feat(storage): se implementó lector PPTX por diapositivas [017 T-09b]` |
| T-09b | `4c85f1bf` | `feat(storage): se integró la previsualización de XLSX y PPTX [017 T-09b]` |

### T-09a — paquete, XML y relaciones

- `readers/ooxml-range-reader.ts`: subclase de la API pública `Reader` de zip.js (D1); cada rango, incluido `bytes=0-0` para el tamaño, pasa por `fetchObjectBytes`, sin `HttpRangeReader`, HEAD ni fetch propio. `readers/ooxml-package-reader.ts`: `getData` con `checkCrc32: true`; errores clasificados solo por constantes publicadas de zip.js (cifrado → `protected`, `ERR_CODEC_OUT_OF_MEMORY` → `memory`, formato/CRC → `corrupt`, lo desconocido → `unavailable`).
- `readers/ooxml-xml-reader.ts`: SAX secuencial UTF-8/UTF-16 (BOM o patrón `<?` declarado, ECMA-376-2 §8.1.4), declaración coherente con lo detectado; DTD, entidades internas o externas rechazadas, sin fetch. Namespaces Strict y Transitional.
- `readers/ooxml-relations.ts`: relaciones OPC internas, rutas normalizadas y partes ambiguas o ausentes como `corrupt`; un target externo nunca se sigue. `readRelationships` acepta una `AbortSignal` opcional (corrección del bloque PPTX) para cancelar los GET de `.rels` de la unidad.
- `workers/{ooxml.worker,ooxml-session,ooxml-protocol}.ts` + `readers/{ooxml-worker-client,ooxml-runtime}.ts`: worker local con `configure({ useWebWorkers: false })`, sesiones numeradas, una unidad a la vez, cancelación y descarte de obsoletos; del worker solo salen sesión, proyecciones estrechas y razones cerradas, nunca URL, `Error`, XML ni bytes.
- Un OOXML cifrado por Office es un contenedor CFB, no ZIP: el detector de 005 lo rechaza en la carga por firma (`magic-bytes.detector.ts`), por lo que no llega al visor como xlsx/pptx. Las restricciones sin contraseña (protección de hoja/libro) no se etiquetan como protegido.

### T-09b — proyecciones XLSX y PPTX

- **XLSX** (`readers/{xlsx-reader,xlsx-sheet,xlsx-format}.ts`): hojas en el orden de `<sheets>`, tipos worksheet/chartsheet/dialogsheet/macrosheet y estados visible/hidden/veryHidden. Ventanas de filas por `offset`/`nextOffset` (unidad de paginación, no límite); shared strings solo las necesarias por relectura; valores cacheados `<v>` ya formateados (fecha 1900/1904, porcentaje, número, booleano, error). Fórmula sin cache → «Sin valor guardado» y `missingCache` por ventana, sin evaluar ni inventar cero.
- **PPTX** (`readers/{pptx-reader,pptx-text,pptx-xml,pptx-model}.ts`): diapositivas en el orden de `p:sldIdLst`, ocultas por `p:sld/@show` y navegables; texto por runs, párrafos, `a:br` y `a:fld` solo con su texto cacheado; grupos (también anidados), tablas, shapes ocultas excluidas y placeholders; capas master → layout → diapositiva según `showMasterSp`, sin repetir el texto de ejemplo de los placeholders de plantilla. `mc:AlternateContent` solo por `Fallback`. Relación estructural externa → `corrupt`; hyperlink/media externos se ignoran; cero fetch externo. Notas, comentarios, imágenes, audio, video, OLE, timing, transiciones, charts y SmartArt no se leen.
- **UI** (`components/{SpreadsheetPreview,PresentationPreview,ReaderNavigation}.tsx`, `hooks/use-ooxml-reading.ts`): un worker por lectura mediante `startOoxmlWorker`/`connectOoxmlWorker`; la UI consume solo metadata y la proyección vigente (`null` mientras se lee: nunca una ventana o diapositiva anterior). XLSX con pestañas (`tablist`, flechas, Inicio, Fin), «Oculta»/«Muy oculta» en texto, cuadrícula con fila y columna reales en región desplazable con foco, «Filas anteriores/siguientes» y nota de fórmulas sin cache por ventana. PPTX con Anterior/Siguiente, «Diapositiva i de n», «Oculta», bloques de texto y tablas en orden y vacío discreto por diapositiva. `PreviewReader` monta ambos y `use-preview-content` los gestiona como lectores (carga, espera >2 s, ready, fallo).
- Ciclo de vida: unmount, cambio de archivo y Reintentar abortan y terminan el worker; Reintentar espera ese cleanup antes de reemitir; sin callbacks tardíos. Fallos por el shell existente (CA-2) con Descargar y Reintentar; Descargar sigue el flujo 005. Memoria: el OOM del códec de zip.js llega como `memory`; cualquier otro error no clasificado del worker llega como `unavailable`. Ambos se presentan con la misma causa saneada del catálogo y Descargar primero, sin límite nuevo.
- `ReaderNavigation` se extrajo de `PdfPreview` (tercer uso: páginas, ventanas y diapositivas); el DOM y las pruebas de PDF se conservan, con una regresión nueva para PDF de 0 páginas.

### Decisiones y limitaciones aprobadas

- PPTX se navega una diapositiva a la vez; no se busca fidelidad gráfica completa de PowerPoint (coordenadas, temas, fuentes, imágenes, animaciones). Charts y SmartArt quedan fuera de 017.
- XLSX no recalcula fórmulas; una fórmula sin valor cacheado se informa como «Sin valor guardado».
- XLSX no materializa columnas sin datos: cada encabezado conserva su columna real y, si hay saltos, se avisa en texto («Solo se muestran las columnas con datos en estas filas; cada encabezado indica su columna real.»).
- chartsheet/dialogsheet/macrosheet se presentan como «Esta hoja no tiene celdas para mostrar.», sin dibujar gráficos ni ejecutar nada.
- Filas con número repetido (archivo malformado) se pintan en el orden recibido. Dos celdas de una misma fila con la misma columna muestran la última; no bloquea el cierre y no se modificó el reader por ese caso.
- DOCX sigue excluido (spec §7).

### Precisiones respecto del plan y de la tarea

- `plan.md` §3 dice «orden de hojas por relaciones» y «orden de relaciones de presentación». La implementación usa el orden de `<sheets>` y de `p:sldIdLst`, resueltos mediante sus relaciones; el orden de las entradas `.rels` y el del ZIP no se usan. Es la lectura que fija ECMA-376; queda registrada aquí para que Adrián decida si ajusta la redacción del plan.
- La tarea nombraba `readers/preview-readers.spec.ts`; las pruebas quedaron por pieza: `ooxml-*.spec.ts`, `xlsx-*.spec.ts`, `pptx-*.spec.ts`, `pptx-engine.real.spec.ts`, `ooxml-engine.real.spec.ts`, `workers/{ooxml,pptx}-*.spec.ts` y, para la UI, `components/{SpreadsheetPreview,PresentationPreview,PreviewPage.ooxml}.spec.tsx`.
- Este registro no acredita el orden histórico de cada prueba frente a su código. Sí se observaron RED → GREEN en los defectos encontrados por las auditorías: espera por ticks en `ooxml-cancellation.spec.ts`, pérdida de foco al volver a la primera ventana, columnas omitidas sin aviso y claves React duplicadas.

### Evidencia

Resultados de la ronda de integración/UI sobre los bytes de `4c85f1bf`; esta actualización documental los registra sin presentarlos como reejecutados ahora.

| Verificación | Resultado |
|---|---|
| UI OOXML + `PreviewReader` + PDF | 58/58 PASS |
| XLSX focal | 104/104 PASS |
| PPTX/OOXML focal (incluye `pptx-engine.real` y `ooxml-engine.real` con zip.js y saxes reales en Node) | 257/257 PASS |
| `src/features/storage/preview` | 42 suites, 732/732 PASS |
| Web completa | 185 suites, 1863/1863 PASS |
| `pnpm --filter web typecheck` | PASS |
| `pnpm --filter web exec eslint src/features/storage/preview --max-warnings 0` | PASS |
| `pnpm exec prettier --check "apps/web/src/features/storage/preview"` | PASS |
| `git diff --check` | PASS |
| `readers/testing/ooxml-build-check.mjs` (última ejecución en el bloque UI; runtime y worker sin cambios después) | 1 entrada de worker local, 3 chunks, 0 WASM, 0 WASM inline, 0 blob workers, 0 `importScripts` inesperados, 0 código dinámico, 0 referencias a CDN |

- Mutation checks: PPTX técnico (5/5 detectadas: `showMasterSp`, External estructural, `Choice`, señal de `.rels`, propiedades extra del protocolo) y UI (7/7 detectadas tras cerrar dos huecos de prueba), siempre restauradas con hash.
- Las suites de componentes y de shell usan jsdom con un puerto de worker controlado sobre el cliente real; la garantía de los motores viene de las suites reales en Node. Ninguna es evidencia de navegador real.
- Privacidad comprobada en DOM, logs y almacenamiento: sin URL firmada, query, XML, nombres de partes, targets de relaciones, bytes ni `Error.stack`.

### Residuos no bloqueantes

- El mapeo `ERR_CODEC_OUT_OF_MEMORY` → `memory` no tiene prueba unitaria propia; la razón `memory` sí está probada en protocolo, cliente, UI y shell.
- `PdfPreview.tsx` conserva `loadPdf` y `PdfCanvas` con 33 líneas (constitución: 30); anteriores a T-09 y no modificadas en este bloque.

### Pendiente para T-10 y T-11

- **T-10:** recorrido en navegador real de todas las hojas y diapositivas; GET/Range, CORS, ausencia efectiva de Cookie/Bearer/cabeceras Nimbo y origen de objetos aislado con el worker OOXML real; axe, contraste efectivo y foco real a 360/1440, incluidos tablist, regiones desplazables y tarjetas 16:9; costo de la activación automática de pestañas con libros grandes. Revisar contra el mockup: Descargar del estado vacío en el encabezado (igual que PDF).
- **T-11:** demo Docker con XLSX de varias hojas y fórmula sin cache, PPTX de varias diapositivas, archivo vacío válido, corrupto/protegido, Reintentar/Descargar y verificación en DevTools.

### Estado

**T-09 queda `[x]`**, con T-09a y T-09b `[x]`. CA-1, CA-2 y CA-11 quedan acreditados en lo que corresponde a T-09; CA-9 en navegador real (360/1440, contraste y foco efectivos) se consolida en T-10/T-11, igual que en T-08. T-04 permanece `[ ]` por evidencia efectiva en navegador real; T-10 y T-11 permanecen `[ ]`. La spec permanece **En curso**.

## T-10 — evidencia en navegador real (2026-10-19)

Recorrido automatizado propio con Chrome real por CDP (arnés temporal fuera del repo, sin dependencias nuevas): cuentas sintéticas creadas por los endpoints reales, archivos sintéticos subidos por el input de la UI y apertura desde el menú real de la fila. Primero sobre `pnpm dev` (React StrictMode) y después sobre el build de producción servido con `next start`. No sustituye el E2E de `e2e/storage-preview.e2e.ts` (PD-41) ni la demo humana T-11.

Procedencia: la primera ronda cubrió PDF multipágina y escaneado, PNG, TXT/MD, XLSX, PPTX, vacío, DOCX, sesión, ajeno/inexistente, revocación, logout, concurrencia, progreso y la expiración de XLSX; una auditoría posterior revisó sus scripts y añadió el resto (JPG, JPEG, GIF, WebP, PDF protegido/corrupto/con JavaScript, PNG corrupto, SVG, plan Personal, 429, retorno desde carpeta, foco a 1440, ciclo de vida, expiración de PPTX y el build de producción), y repitió axe limitado al visor.

### Formatos y estados

- **PDF:** multipágina con todas las páginas por Anterior/Siguiente y teclado; escaneado sin capa de texto; protegido con contraseña → causa propia con Descargar y Reintentar; corrupto con firma `%PDF` válida → «No pudimos leer este archivo.»; con `/OpenAction` JavaScript → dos páginas pintadas y el script no se ejecuta.
- **Imágenes:** PNG, JPG, JPEG, GIF y WebP a 360 y 1440 px: una emisión efectiva, un GET al mismo objeto entregado, presentación por `blob:` local, sin desbordamiento (una panorámica de 1600×200 px se ajusta al visor) y metadatos del archivo sin cambios. PNG con firma válida y cuerpo dañado → corrupto.
- **TXT/MD:** texto literal, sin renderizar Markdown ni HTML.
- **XLSX:** todas las hojas por teclado (flechas, Inicio, Fin), hidden y veryHidden rotuladas, chartsheet sin celdas, fórmula sin cache como «Sin valor guardado», hoja dispersa con aviso y ventanas de filas con foco correctivo, a 360 y 1440 px.
- **PPTX:** todas las diapositivas, oculta navegable, tablas y diapositiva vacía.
- **Vacío válido:** «Este archivo no tiene contenido para mostrar.» con Descargar en el encabezado.
- **Excluidos:** DOCX y SVG (tipo `otro`) no ofrecen «Previsualizar»; la ruta directa responde 422 con «Este tipo de archivo no tiene vista previa.» y no hay GET al objeto.
- **Retry y Descargar:** un POST `preview-url` por clic de Reintentar (también con cinco clics síncronos); Descargar desde el visor usa `download-url` de 005 con `attachment`, sin otra emisión de vista previa y sin salir del visor.
- **Acceso:** sin sesión → 401 y redirección a iniciar sesión; archivo ajeno e inexistente con la misma UI y el mismo cuerpo de API salvo la correlación, sin el nombre ajeno; revocación (papelera en otra pestaña) y logout en otra pestaña sin contenido. La cuenta de prueba en plan Personal previsualiza sin controles de edición ni de cambio de plan y con «Solo lectura».
- **429:** tras agotar la tasa real (115 emisiones en la ventana), la API responde `429 STORAGE_TOO_MANY_REQUESTS` con `Retry-After: 44`; la UI muestra «Hiciste demasiadas solicitudes. Espera un momento e inténtalo de nuevo.» sin GET al objeto, y Reintentar tras ese plazo vuelve a entregar (200).

### Accesibilidad, foco y responsive

- Recorrido con Tab dentro del visor a 360 y 1440 px (XLSX, PPTX y error): orden coherente y foco visible en todos los controles.
- axe limitado al contenedor del visor, sobre el build de producción: sin violaciones en PDF, XLSX, PPTX, corrupto, protegido e imágenes, a 360 y 1440 px. La única violación de página completa es el contraste compartido de la barra lateral (ver pendientes).
- Espera larga: la barra de progreso aparece pasados 2 s y desaparece al terminar.
- Volver con la entrega recibida: desde una carpeta creada por la UI vuelve a `/archivos/carpeta/:folderId?foco=:id` con el foco en el control de la fila, con ratón y con Enter; desde la raíz, a `/archivos?foco=:id`. Medido a 360 y 1440 px (`innerWidth` real).

### Ciclo de vida, concurrencia y expiración

- Cambio rápido de archivo A → B por navegación cliente: solo se ve B, el worker de A se termina y no hay GET posteriores de A.
- Ráfagas de hojas (Resumen → Dispersa → …) y de diapositivas (siguiente, siguiente, anterior): la UI final coincide con la referencia de la selección vigente.
- Desmontaje durante un GET retenido: el GET termina como `ERR_ABORTED`, sin workers vivos ni errores de consola, y el foco vuelve a la fila.
- Error corrupto → otro archivo: sin estado residual.
- Cinco ciclos de abrir y cerrar una imagen: el `blob:` sirve mientras el visor está abierto y queda revocado al salir. Recargar el visor emite una entrega nueva con otra firma.
- Expiración real (sin acortar el TTL de 300 s): en XLSX y en PPTX el GET con la firma vencida recibe 403, la UI muestra «La vista previa caducó.» y Reintentar emite una URL con firma nueva (PPTX: 1 POST 200 y 43 GET 206; ningún GET reutiliza la firma vencida); el worker anterior se termina.

### Peticiones al host de objetos y privacidad

- Con una cookie canario de dominio `localhost`, las cabeceras efectivas del navegador (incluidas las de los workers) no llevan Cookie, Authorization ni cabeceras Nimbo; un control positivo con `credentials: 'include'` sí adjunta la canario, así que la ausencia no es un artefacto del arnés.
- Range/206 con `Content-Range` real en PDF y OOXML (los GET OOXML salen del worker); 200 sin Range en imagen y texto.
- CORS: el origen permitido recibe `Access-Control-Allow-Origin: http://localhost`; desde `http://127.0.0.1:3002`, fuera de la allowlist, el navegador bloquea la lectura.
- Firma manipulada → 403 de MinIO. Ninguna navegación del documento al host de objetos; la URL firmada no aparece en el DOM, `localStorage` ni `sessionStorage`; los errores visibles no contienen stack, token, Bearer ni URL privada. Las bitácoras de la API registran la ruta como `/files/:id/preview-url`, sin `X-Amz`, nombres de archivo ni Bearer.

### Desarrollo frente a producción

- En `pnpm dev`, `reactStrictMode: true` monta dos veces el visor: aparece un POST `preview-url` abortado más el real, y un GET abortado más el real. La API procesa también el POST abortado (en desarrollo una apertura consume dos fichas de la tasa); la respuesta tardía se descarta por la identidad del intento, sin efecto funcional.
- En el build de producción, por formato: imagen 1 POST + 1 GET 200; PDF 1 POST + 2 GET 206 desde el hilo principal; XLSX 1 POST + 23 GET 206 desde el worker; PPTX 1 POST + 43 GET 206 desde el worker; 0 GET abortados, un worker abierto y cerrado por lectura y sin errores de consola atribuibles al visor.
- `pnpm --filter web build`: compilación, validación de tipos, recolección de páginas, 12 páginas estáticas, optimización y `BUILD_ID` correctos; el paso `standalone` falla en local solo por `EPERM` al crear symlinks en Windows sin privilegios (exit 1). `next start` sirvió ese build para el smoke. El build `standalone` e imagen Docker corresponden a CI/staging.

### Pulido de código

- `2a34d09a` (`refactor(storage): se eliminó el estado vacío obsoleto de previsualización [017]`): se eliminaron `PreviewStates.empty`, `EmptyPreviewState` y su prueba. Ese camino de T-06 nunca se conectó en producción: lo sustituyó `EmptyFileNotice` en los lectores PDF, XLSX y PPTX (T-08/T-09b), que dejan Descargar en el encabezado. El registro histórico de T-06 se conserva tal cual. Validación: web 185 suites, 1862/1862 PASS (la diferencia con 1863 es la prueba eliminada); `pnpm --filter web typecheck`, ESLint de `storage/preview`, Prettier de los archivos tocados y `git diff --check` PASS.
- Sobre `5a3c3f97`, antes de ese commit: `pnpm typecheck`, `pnpm test`, `pnpm test:int` (104 suites, 972 pruebas), `pnpm test:isolation` (18 suites, 308 pruebas) y `pnpm env:check` PASS; `pnpm test:e2e` sigue siendo marcador y no acredita E2E. `pnpm lint` termina con exit 1 solo por Prettier sobre cuatro archivos locales excluidos en `.git/info/exclude`; `pnpm exec eslint . --max-warnings 0` y Prettier sobre los archivos versionados PASS.

### Límites de esta evidencia

- Local, el host de objetos es `localhost:9000`, mismo sitio que la web: la ausencia de cookies la garantiza el código (`credentials: 'omit'`), no un hostname aislado.
- Del arnés: el axe de la primera ronda PDF fue de página completa (se repitió limitado al visor); el primer conteo de GET del DOCX acumulaba la sesión (se repitió aislado: 0 GET); las peticiones abortadas antes de salir no tienen cabeceras efectivas, y ninguna conclusión de cookies se apoya en ellas.
- No se midió específicamente el costo de la activación automática de pestañas con libros grandes; el libro de prueba tiene 450 filas.
- Las diferencias de UX frente al mockup registradas en T-08 (una página a la vez; Descargar del vacío en el encabezado) siguen como están, sin cambio.

### Pendientes externos (no bloquean el cierre de T-10)

- **PD-41 (infraestructura compartida, Adrián):** `pnpm test:e2e` sigue siendo marcador; el E2E con Playwright (`e2e/storage-preview.e2e.ts`) **no está acreditado** y no se creó ningún E2E ficticio. Por decisión de la revisión del 2026-10-19, no bloquea el cierre de T-10.
- **PD-33 (contraste del `AppLayout`, Fátima con Adrián):** el ítem activo «Mis archivos» de la barra lateral da 4.05:1 (`#4a6fa5` sobre `#dde6f0`; requiere 4.5:1). Está fuera de `storage/preview`; el axe de T-10 se evalúa sobre la región del visor, sin violaciones. No es una regresión de 017 ni bloquea T-10.
- **Hostname aislado real:** solo verificable en staging o en la demo T-11.
- **Rol interno real en navegador:** para T-11; el 403 está acreditado por aislamiento (`storage-preview.iso-spec.ts`).

### Revalidación humana en T-11

T-10 ya acredita estos comportamientos mediante automatización y Chrome real. T-11 los revalida de forma humana en el entorno final y completa los puntos que solo pueden demostrarse allí:

- [ ] Hostname realmente aislado para el host de objetos.
- [ ] CORS efectivo en el navegador.
- [ ] Range real con 206 y `Content-Range`.
- [ ] En DevTools: GET al origen de objetos sin Cookie ni Bearer.
- [ ] axe a 360 px.
- [ ] axe a 1440 px.
- [ ] Descargar sigue entregando `attachment`.
- [ ] Un rol interno real recibe 403.
- [ ] Recorrido humano final de Volver a la carpeta de origen o a la raíz, con el foco correspondiente (corregido en `aa28a163`).

### Cierre de T-10 (2026-10-19)

**Volver durante la carga, corregido** en `aa28a163`, con una prueba adicional en `e8c2353c`, sin cambiar el contrato de la ruta: `previewPathOf` sigue identificando solo `fileId` (sin `folderId`, búsqueda ni fragmento).

- Mientras `preview-url` está pendiente, Volver registra la intención y espera: `aria-busy` y `aria-disabled`, atenuado y con el foco conservado.
- Con éxito, navega una vez a la carpeta de `delivery.file.folderId`, la única fuente autoritativa, con foco en la fila. Con fallo sin entrega, vuelve a la raíz segura con foco en el encabezado, sin revelar la carpeta.
- No hay navegación tardía tras desmontar. Las activaciones repetidas, Enter, Ctrl/Cmd/Shift y el clic central no usan el href provisional; el clic derecho no se intercepta. Con la entrega ya recibida, el enlace se comporta como siempre, modificadores incluidos.
- Pruebas A–I en `PreviewPage.spec.tsx`, con RED antes del arreglo. Chrome real a 360 y 1440 px: carpeta, raíz, 404 real de la API y fallo de red; una sola navegación, 0 pestañas con modificadores (con control positivo) y sin errores de consola.

**Auditoría final de `storage/preview`:** revisión completa sin defectos bloqueantes ni de seguridad, ciclo de vida o accesibilidad; el único hueco (clic derecho sin prueba) quedó cubierto en `e8c2353c`. Cobertura de la carpeta: 92.6 % sentencias, 89.6 % ramas y 95.4 % funciones.

**Validación sobre `e8c2353c`:** preview 42 suites / 740 pruebas y web 185 suites / 1871 pruebas PASS; `pnpm test` PASS en todos los paquetes; `pnpm typecheck`, `pnpm env:check`, `pnpm exec eslint . --max-warnings 0`, Prettier y `git diff --check` PASS. `pnpm test:int` (104 suites, 972 pruebas) y `pnpm test:isolation` (18 suites, 308 pruebas) PASS, repetidos sobre `e8c2353c`. `pnpm lint` termina con exit 1 solo por Prettier sobre los cuatro archivos locales excluidos en `.git/info/exclude`, como antes. `pnpm test:e2e` es marcador y no acredita E2E (PD-41).

### Estado

**T-10 `[x]`**: la parte técnica de `storage/preview` está cerrada y el último defecto propio conocido quedó corregido. PD-41 queda explícitamente no acreditado y PD-33 como deuda externa conocida; ninguno bloquea T-10. T-10 depende de T-04: lo que T-04 esperaba de T-10 quedó acreditado aquí, y su único resto (hostname aislado real) pasa a T-11. **T-04 permanece `[ ]`** por ese resto; **T-11 permanece `[ ]`**. La spec permanece **En curso**.

## T-11 — demo humana local (2026-10-19)

Recorrido humano de Abel en Chrome sobre el entorno local (`pnpm --filter web dev`, API y worker en el host, Docker Compose con Postgres, Redis, MinIO, Traefik y Mailpit), con las cuentas sintéticas A y B de T-10. El agente solo preparó el entorno, verificó por API lo que se le pidió y registró los resultados; no sustituyó ninguna comprobación manual. Sin cambios de código, configuración versionada ni `.env`.

**27/27 comprobaciones locales completadas; demo funcional PASS.**

- **Formatos y estados:** PDF multipágina y escaneado, imágenes, TXT/MD literal, XLSX con varias hojas y fórmula sin cache, PPTX con varias diapositivas, corrupto/protegido, formato excluido, Reintentar y Descargar: PASS.
- **Archivo vacío válido:** PASS con un `.pptx` sin diapositivas rehecho y guardado con PowerPoint, que se previsualiza vacío y se descarga y abre en PowerPoint sin reparación.
- **Fixture `vacia.pptx` anterior:** clasificado como **fixture inválido**, sin regresión de descarga. Lo generó el arnés sintético de T-10 con solo 4 partes OPC (sin slide master, layout, tema ni `notesSz`), por lo que PowerPoint pide repararlo. Original, objeto almacenado en MinIO y descarga 005 tienen 1268 bytes y el mismo SHA-256, idénticos byte a byte; la descarga responde `attachment` y `application/octet-stream`.
- **Volver y foco:** a la carpeta de origen con foco en la fila y a la raíz con foco correspondiente: PASS. Volver pulsado durante el `preview-url` pendiente: PASS.
- **Acceso:** archivo ajeno (cuenta B) e inexistente indistinguibles: PASS.
- **Responsive:** 360 y 1440 px: PASS.
- **DevTools, host de objetos local `localhost:9000`:** CORS PASS; Range con 206 y `Content-Range` PASS; GET sin Cookie, Authorization, Bearer ni cabeceras Nimbo PASS; ninguna navegación del documento al host de objetos PASS; Descargar sigue entregando `attachment` PASS.
- **axe:** a 360 px, 0 incidencias. A 1440 px, el visor está limpio; la única incidencia es PD-33, el ítem «Mis archivos» de la barra lateral con 4.05:1, externa a `storage/preview` y no regresión de 017.
- **Teclado y foco:** PASS.
- **429:** PASS. Se reinició solo la API con `RATE_LIMIT_PREVIEW_URL_PER_MINUTE=3` como variable efímera del proceso. La cuarta emisión del minuto respondió 429 con `Retry-After` y la UI lo mostró; pasado el plazo, Reintentar recuperó la vista previa. Después la API se reinició sin la variable (default 120): `health/live` y `health/ready` 200 con Postgres, Redis y MinIO `up`, y cinco emisiones seguidas respondieron 200.

### Pendientes externos

1. **Hostname realmente aislado del host de objetos.** En local la web es `localhost` y los objetos `localhost:9000`, el mismo sitio; la ausencia de cookies la garantiza el código (`credentials: 'omit'`), no el aislamiento del hostname. Requiere staging o un entorno equivalente.
2. **Cuenta interna real (ADMIN, SUPPORT u OPERATOR) para el 403 humano.** La base local solo tiene cuentas CLIENT y no se creó una cuenta interna falsa. El 403 sigue acreditado por aislamiento (`storage-preview.iso-spec.ts`).

### Estado

**T-11 permanece `[ ]`** hasta acreditar esos dos pendientes y **T-04 permanece `[ ]`** hasta acreditar el primero. La spec permanece **En curso**.
