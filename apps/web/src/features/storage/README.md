# Storage en la web

Componentes de las specs 005 y 006 para cargar, navegar carpetas, crear carpetas y descargar. Cada componente recibe sus datos y
callbacks por props; solo `api.ts` habla con la API.

**Proveedor de la pestaña (T-53)**: `app/(app)/(cliente)/layout.tsx` monta `SessionUploadsProvider`
(`components/uploads-provider.tsx`), que arma el cliente de `api.ts` sobre `session/auth-fetch.ts` con el token en
memoria de la sesión y crea **un** `UploadManager` por pestaña (`hooks/use-upload-manager.ts`). Escucha
`online`/`offline`, pinta el panel flotante y abre los diálogos. Navegar dentro de `(cliente)` conserva las cargas;
recargar las pierde (RN-7). Las páginas leen el contexto con `useUploads()`.

| Pieza                                                                               | Qué hace                                                                                           | Tarea      |
| ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ---------- |
| `upload/upload-manager.ts`                                                          | Máquina de estados de las cargas (2 archivos × 4 partes, pausa, corte, cancelación)                | T-12, T-13 |
| `upload/xhr-put.ts`                                                                 | `PUT` a MinIO con progreso por bytes y aborto, sin credenciales de la app                          | T-11       |
| `storage-request-error.ts`                                                          | Error HTTP de la API de `storage` (`status`, `code`, `details`); un fallo sin respuesta es de red  | T-12       |
| `api.ts`, `storage-http.ts`                                                         | Cliente de `/uploads` y `/files` sobre `auth-fetch`; valida las respuestas con `contracts/storage` | T-53       |
| `folders-api.ts`                                                                    | `GET /folders/contents` (reemplaza a `GET /files`) y `POST /folders`                               | 006 T-08   |
| `routes.ts`                                                                         | `/archivos` y `/archivos/carpeta/[folderId]` (una URL por carpeta)                                 | 006 T-08   |
| `hooks/use-folder-contents.ts`                                                      | Listado de la ubicación (cargando, error, «no encontrada») y carpetas de primer nivel              | 006 T-08   |
| `hooks/use-upload-manager.ts`, `components/uploads-provider.tsx`                    | Manager por pestaña, eventos de red, panel y diálogos conectados                                   | T-53       |
| `components/my-files.tsx`                                                           | Vista de `/archivos` y de cada carpeta: barra lateral, migas, listado, subir a la carpeta abierta  | T-54, 006  |
| `components/node-table.tsx`, `folder-breadcrumbs.tsx`, `folder-not-found-state.tsx` | Tabla de carpetas y archivos, migas («…» con más de 4 niveles) y «‹ Volver», 404 de carpeta        | 006 T-08   |
| `components/new-folder-dialog.tsx`                                                  | «Nueva carpeta» (sobre `components/ui/dialog`): errores 400/409 en el campo y 422 como aviso       | 006 T-08   |
| `components/upload-panel.tsx`                                                       | Panel de cargas; reutiliza `components/nimbo/upload-progress.tsx`                                  | T-14       |
| `components/name-conflict-dialog.tsx`, `cancel-upload-dialog.tsx`                   | Diálogos de nombre repetido y de cancelar                                                          | T-15       |
| `components/file-explorer.tsx`, `upload-dropzone.tsx`, `explorer-error-state.tsx`   | Raíz, arrastre y error del listado                                                                 | T-16       |
| `components/file-row-menu.tsx`                                                      | Menú ⋮ con «Descargar» y `DownloadNoticeBanner`                                                    | T-17       |

Los textos de error de `storage` salen de `lib/error-catalog.ts` (`storageMessage`: causa y acción, con las cifras de
`details`); el panel los usa tal cual.

## Cómo se conectan

- `UploadPanel.rows` es `manager.snapshot()`; `onPause`, `onResume`, `onRetry` y `onRequestCancel` llaman los métodos
  del mismo nombre. `onUploadAgain` abre el selector de archivos compartido por `FileExplorer.fileInputRef`.
- La fila con `awaitingCancel` abre `CancelUploadDialog` (`onConfirm` → `confirmCancel`, `onDismiss` →
  `dismissCancel`); las cifras se formatean con `formatBytes`.
- La primera fila en `conflict` abre `NameConflictDialog` con `finalName = suggestedName` y
  `othersCount = pendingConflictsInBatch(id)`; la respuesta va a `resolveConflict(id, decision, applyToRest)`.
- `FileExplorer.onFiles` entrega `File[]` para `manager.enqueue`; `maxFileLabel` sale de los límites del plan por la
  API (nunca de una constante). `onRetry` repite la última petición de listado con el mismo cursor.
- `FileRowMenu.requestUrl` llama `POST /files/:id/download-url` y lanza `StorageRequestError` ante un error HTTP. El
  aviso que emite `onNotice` se pinta con `DownloadNoticeBanner` en `FileExplorer.notice`, arriba de la lista.
- La barra lateral muestra «Carpetas» (solo las de primer nivel, sin cantidades) y enlaza la Papelera; el contador
  llega con 006 T-10. Las migas van en la barra superior desde `md`; por debajo, «‹ {carpeta anterior}».
- La API no envía nombres en los errores: la web pone el nombre guardado en el `409` de carpetas (de la lista abierta).
- `maxFileLabel` es opcional: ningún contrato expone todavía `PlanLimits.maxFileBytes` a `web`, así que la página no lo
  pasa y los textos omiten la cifra (propuesta en el registro de cambios de la spec).
- La página muestra solo la primera página de `GET /folders/contents` (carpetas primero, luego más recientes);
  «Cargar más» llega con 007.
