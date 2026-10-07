# Tareas 017 — Previsualización

> Spec: `./spec.md` · Plan: `./plan.md` (**Propuesto; aprobación pendiente**, 2026-10-06)
> **Borrador para revisión conjunta con el plan. No autoriza `/implement`.**
> 11 tareas verticales, un commit por tarea (`feat(storage): … [017 T-xx]`). Toda tarea de lógica empieza por su prueba.
> Abel es dueño de `storage/preview`; los cambios fuera de esa frontera se marcan como habilitación de Adrián/compartida y no se asumen como autorizados.

## Compuertas antes de implementación

- **G-1 — ADR-0025 / IX.7:** el equipo acepta `inline` solo para la URL temporal de preview en origen aislado; la descarga de 005 conserva `attachment` y `application/octet-stream`.
- **G-2 — Ownership:** Adrián acepta las propuestas Q-2, Q-3 y Q-6 del plan: fachada/DI de storage, procedencia MIME e integración de menú/retorno/foco, y entrega el mockup `docs/design/mockups/storage/vista-previa/`.
- **G-3 — Arquitectura/dependencias:** architect acepta las dependencias de Q-4 (`pdfjs-dist`, `@zip.js/zip.js`, `saxes`) y registra el ADR/hallazgos que correspondan.
- **G-4 — Aprobación:** Adrián registra aprobación de spec + plan. Hasta entonces este archivo sirve solo para revisión conjunta, como pidió Matul.

## Orden y paralelismo

| Ola | Tareas | Propiedad principal |
|---|---|---|
| 1 | T-01 ∥ T-05 | T-01: Adrián/compartido (`storage`, contracts, env, dependencias). T-05: Adrián/web storage + mockup |
| 2 | T-02 ∥ T-06 | T-02: Adrián/storage. T-06: Abel `web/features/storage/preview` |
| 3 | T-03 ∥ T-07 | T-03: Abel `api/modules/storage/preview`. T-07: Abel lectores nativos |
| 4 | T-04 ∥ T-08 ∥ T-09 | aislamiento/entrega; PDF; OOXML |
| 5 | T-10, luego T-11 | integración browser/regresión; recorrido humano |

## Tareas

- [ ] **T-01** **(Adrián/compartida; habilitación)** Contratos, configuración y dependencias aprobadas. Crear `PreviewUrlResponse` y códigos públicos de preview en `packages/contracts`; agregar `RATE_LIMIT_PREVIEW_URL_PER_MINUTE` con default 120 y validación/env; declarar únicamente las dependencias aceptadas de Q-4 (`pdfjs-dist@6.4.299`, `@zip.js/zip.js@2.23.0`, `saxes@6.0.0`) y lockfile. Pruebas de contratos/configuración primero; no modificar `downloadUrlSchema`. — CA: CA-1, CA-2, CA-11, CA-12 — Archivos: `packages/contracts/src/storage/preview-schemas.ts`, `preview-schemas.spec.ts`, `packages/contracts/src/storage/index.ts`, `apps/api/src/shared/infrastructure/config/env.schema.ts`, `.env.example`, `apps/web/package.json`, `pnpm-lock.yaml` — Bloqueo: G-2, G-3, G-4

- [ ] **T-02** **(Adrián; habilitación storage)** Fuente autorizada, MIME validado y firma `inline`. Implementar `StoragePreviewFacade.issueUrl(actor, fileId)`, errores saneados `PreviewUnsupportedError`/`PreviewUnavailableError`, `findAccessiblePreviewSource`, `presignPreview`, índice reversible `idx_carga_version_completada` y exports/DI públicos sin exponer repositorios, entidades ni claves. La consulta debe distinguir inaccesible (404) de fuente autorizada ausente/incoherente (503), usar la carga completada ligada a la versión y conservar descarga 005 sin cambios. Pruebas unitarias/integración de fuente, índice up/down, MIME tras rename, TTL y firma primero. — CA: CA-3, CA-4, CA-5, CA-8, CA-11 — Archivos: `apps/api/src/modules/storage/application/storage-preview.facade.ts`, `application/ports/i-node.repository.port.ts`, `infrastructure/persistence/typeorm-node.repository.ts`, `application/ports/i-object-storage.port.ts`, `infrastructure/minio-storage.adapter.ts`, `domain/errors/preview-delivery.errors.ts`, `domain/errors/index.ts`, `storage.module.ts`, `index.ts`, `index.spec.ts`, migración nueva, `apps/api/test/int/storage/{preview-source,preview-delivery,preview-composition}.int-spec.ts` — Depende: T-01 — Bloqueo: G-1, G-2, G-4

- [ ] **T-03** **(Abel; backend preview)** API de emisión de URL. Con pruebas primero, crear `PreviewModule`, `PreviewService`, configuración, errores propios y `PreviewController` para `POST /api/v1/files/:fileId/preview-url`: solo `CLIENT`, UUID por Zod, tasa `storage:preview-url:${actor.id}` independiente de descarga, 429 con `Retry-After`, defensa contra roles internos también en invocación directa y mapeo estricto a `PreviewUrlResponse`. No capturar mensajes/stacks/URLs del firmador ni auditar como descarga. — CA: CA-3, CA-4, CA-6, CA-10, CA-11, CA-12 — Archivos: `apps/api/src/modules/storage/preview/{index.ts,preview.module.ts,application/preview.service.ts,application/preview-config.ts,presentation/preview.controller.ts,presentation/preview-validation.ts,domain/preview-errors.ts}` y specs; `apps/api/src/app.module.ts` solo mediante el descriptor acordado — Depende: T-01, T-02 — Bloqueo: G-4

- [ ] **T-04** Aislamiento y operación real de preview. Integración con Postgres/Redis/MinIO reales: sin sesión 401, roles internos 403, ajeno e inexistente indistinguibles, RLS también sobre carga/versión, tasa por actor y contador separado, Redis caído falla cerrado, logs saneados, URL de 300 s para un objeto, `inline`, MIME correcto, `no-store`, `nosniff`, descarga 005 en `attachment/octet-stream` y regresión de `presignDownload`. Probar CORS/rangos/206 y ausencia de Cookie/Bearer en el origen efectivo. — CA: CA-3, CA-4, CA-5, CA-8, CA-10, CA-11, CA-12 — Archivos: `apps/api/test/isolation/storage-preview.iso-spec.ts`, `apps/api/test/int/storage/{preview-delivery,preview-operation,preview-composition}.int-spec.ts`, regresiones `download.int-spec.ts` y `minio-storage.adapter.int-spec.ts` — Depende: T-02, T-03

- [ ] **T-05** **(Adrián; habilitación web + mockup)** Costura del explorador y retorno. Entregar mockup 360/1440 con todos los estados de spec §6; agregar `firstAction`/`renderFirstFileAction`, export público de storage, `StorageReturnProvider`, `useExplorerReturn`, `useFileDownload` y wrappers de ruta. Guardar en RAM de sesión ubicación/orden/páginas/desgloses/fila, revalidar antes de volver y enfocar la fila; si desapareció, foco al encabezado y aviso contextual. Limpiar en logout y no almacenar URL/contenido. — CA: CA-7, CA-9 — Archivos: `apps/web/src/features/storage/{index.ts,components/file-row-menu.tsx,components/my-files.tsx,components/node-rows.tsx,components/storage-return-provider.tsx,hooks/use-my-files-state.ts,hooks/use-folder-contents.ts,hooks/use-folder-disclosure.ts,hooks/use-file-download.ts}`, `apps/web/src/app/(app)/(cliente)/archivos/{layout.tsx,page.tsx,carpeta/[folderId]/page.tsx,vista-previa/[fileId]/page.tsx}`, `docs/design/mockups/storage/vista-previa/` — Bloqueo: G-2, G-4

- [ ] **T-06** **(Abel; web base)** Shell del visor y estados. Crear cliente de preview, rutas, `usePreview`, `PreviewPage`, `PreviewMenuItem` y `PreviewStates`; `Previsualizar` es primer ítem solo para kinds admitidos. Manejar cargando con espera >2 s, éxito, vacío válido, no disponible, protegido, corrupto, expirado, cancelación silenciosa, 404 sin nombre y acciones Reintentar/Descargar. Reintento manual destruye la lectura previa y reemite; URL/contenido solo en memoria. Pruebas de componente y `jest-axe` primero. — CA: CA-2, CA-6, CA-7, CA-9 — Archivos: `apps/web/src/features/storage/preview/{index.ts,routes.ts,api.ts,hooks/use-preview.ts,preview-failure.ts,components/PreviewPage.tsx,components/PreviewMenuItem.tsx,components/PreviewStates.tsx}` y specs; `apps/web/src/lib/error-catalog.ts` mediante habilitación acordada — Depende: T-01, T-05

- [ ] **T-07** **(Abel; lectores nativos)** Imagen y TXT/MD. Imagen por GET directo `credentials:'omit'`, Blob/object URL y decodificador nativo de PNG/JPG/JPEG/GIF/WebP, sin proxy/optimización; liberar recursos al salir. TXT/MD con `TextDecoder` UTF-8 incremental y texto escapado, nunca Markdown→HTML ni `dangerouslySetInnerHTML`; no truncar ni imponer límite nuevo. Estados de decode/red saneados. — CA: CA-1, CA-2, CA-11 — Archivos: `apps/web/src/features/storage/preview/components/{ImagePreview,TextPreview}.tsx`, lectores/helpers y specs — Depende: T-06

- [ ] **T-08** **(Abel; PDF)** Lector PDF con PDF.js fijado. Adaptador y transporte por rangos GET sin credenciales, worker local de la misma versión, páginas bajo demanda, canvas + texto accesible, PDF escaneado visible sin OCR, sin viewer/scripting/acciones/formularios interactivos/XFA ni recursos remotos. `onPassword` informa protegido sin pedir contraseña; corrupción/expiración saneadas; cancelar y liberar tareas/canvases. Pruebas con PDF multipágina, escaneado, protegido y con JavaScript; no depender de mocks para la garantía browser. — CA: CA-1, CA-2, CA-9, CA-11 — Archivos: `apps/web/src/features/storage/preview/components/PdfPreview.tsx`, `readers/{pdfjs-adapter,pdf-range-transport,pdf-text-reader}.ts`, `workers/pdfjs.worker.ts`, specs/fixtures — Depende: T-01, T-06 — Bloqueo: G-3

- [ ] **T-09** **(Abel; XLSX/PPTX)** Lector OOXML incremental con zip.js + saxes en worker propio: rangos obligatorios, CRC, XML UTF-8/UTF-16 secuencial, namespaces Strict/Transitional, relaciones OPC internas y rechazo de DTD/entidades/rutas ambiguas/recursos externos. XLSX muestra hojas en orden y valores cacheados sin recalcular; fórmula sin cache → «Sin valor guardado». PPTX muestra texto visible de diapositivas en orden, sin animaciones/notas/recursos activos. Detectar cifrado/protección/corrupción y liberar worker/buffers al cambiar unidad. — CA: CA-1, CA-2, CA-9, CA-11 — Archivos: `apps/web/src/features/storage/preview/components/{SpreadsheetPreview,PresentationPreview}.tsx`, `readers/{ooxml-package-reader,ooxml-xml-reader,ooxml-relations,xlsx-reader,pptx-reader}.ts`, `workers/{ooxml.worker,ooxml-protocol}.ts`, `readers/preview-readers.spec.ts`, fixtures — Depende: T-01, T-06 — Bloqueo: G-3

- [ ] **T-10** Integración browser, accesibilidad y regresión. Recorrido automatizado con formatos admitidos/excluidos, todas las páginas/hojas/diapositivas, retorno/foco, cargas concurrentes, error + Reintentar/Descargar, URL expirada, logout/acceso revocado, CORS/rangos/cookies reales y axe a 360/1440. Confirmar que fallo de preview no bloquea navegación/carga/descarga y que no aparece control comercial. Ejecutar `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:int`, `pnpm test:isolation`, `pnpm test:e2e`, `pnpm env:check`; si PD-41 sigue siendo marcador, no reportar E2E como acreditado. — CA: CA-1 a CA-12 — Archivos: `e2e/storage-preview.e2e.ts`, suites de T-04/T-06/T-08/T-09 y regresiones existentes — Depende: T-04, T-05, T-07, T-08, T-09

- [ ] **T-11** **(humana, Adrián + Abel)** Recorrido de demo local con Docker: abrir PDF multipágina y escaneado; imagen; TXT/MD literal; XLSX con varias hojas/fórmula sin cache; PPTX con varias diapositivas; archivo vacío válido; corrupto/protegido; formato excluido; Reintentar y Descargar; volver conservando ubicación/foco; otra cuenta no ve contenido; rol interno recibe 403; 429 muestra `Retry-After`; 360 y 1440 px. Verificar en DevTools que los bytes salen del origen aislado sin Cookie/Bearer y que download sigue `attachment`. Nota/capturas en el PR. — CA: CA-1 a CA-12 — Depende: T-10

## Dependencias críticas

- T-02 y T-05 son habilitaciones fuera de la frontera de Abel; no se implementan por Abel sin conformidad de Adrián.
- T-03 necesita la fachada y contracts reales de T-01/T-02; no duplica SQL, repositorios ni cliente MinIO.
- T-08/T-09 no empiezan hasta aceptación arquitectónica de las dependencias de Q-4.
- T-10 no sustituye la demo humana: acredita automatización y regresión; T-11 valida el recorrido visible y el origen efectivo.
- Ninguna tarea cambia la descarga de 005, agrega `tipo_mime`, OCR, conversión backend, cuota comercial, compartición o edición.

## Matriz de CA → tareas

| CA | Tareas | CA | Tareas |
|---|---|---|---|
| CA-1 | T-07, T-08, T-09, T-10, T-11 | CA-7 | T-05, T-06, T-10, T-11 |
| CA-2 | T-06, T-07, T-08, T-09, T-10, T-11 | CA-8 | T-02, T-04, T-10, T-11 |
| CA-3 | T-03, T-04 | CA-9 | T-05, T-06, T-08, T-09, T-10, T-11 |
| CA-4 | T-03, T-04 | CA-10 | T-03, T-04, T-10 |
| CA-5 | T-02, T-04 | CA-11 | T-01, T-02, T-03, T-04, T-07, T-08, T-09, T-10, T-11 |
| CA-6 | T-03, T-06 | CA-12 | T-01, T-03, T-04, T-10, T-11 |

CA sin cubrir: ninguno.

## Notas para la revisión conjunta

- Este `tasks.md` materializa el plan propuesto para que Matul pueda revisar plan + tareas de una vez; no convierte Q-1/Q-2/Q-3/Q-6 ni ADR-0025 en decisiones aceptadas.
- Si Adrián/architect cambian fachada, procedencia MIME, retorno/foco o motores, actualizar primero `plan.md` y después las tareas afectadas antes de `/implement`.
- Mantener ownership: Abel trabaja en `storage/preview`; T-01, T-02 y T-05 contienen cambios compartidos/ajenos explícitos.
