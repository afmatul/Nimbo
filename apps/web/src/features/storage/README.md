# Storage en la web

Componentes de la spec 005 para cargar, listar la raíz de Mis archivos y descargar. **Aún no están montados en
`/archivos`**: esa página es el PR-F (T-54). Hasta entonces cada componente recibe sus datos y callbacks por props y
ninguno llama a la red real.

**El proveedor de la pestaña llega en T-53** (`hooks/use-upload-manager.ts` y el proveedor en
`app/(app)/(cliente)/layout.tsx`): crea un `UploadManager` con el cliente HTTP de `api.ts` (sobre
`session/auth-fetch.ts`), escucha `online`/`offline` y conecta el panel y los diálogos.

| Pieza                                                                             | Qué hace                                                                                          | Tarea      |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ---------- |
| `upload/upload-manager.ts`                                                        | Máquina de estados de las cargas (2 archivos × 4 partes, pausa, corte, cancelación)               | T-12, T-13 |
| `upload/xhr-put.ts`                                                               | `PUT` a MinIO con progreso por bytes y aborto, sin credenciales de la app                         | T-11       |
| `storage-request-error.ts`                                                        | Error HTTP de la API de `storage` (`status`, `code`, `details`); un fallo sin respuesta es de red | T-12       |
| `components/upload-panel.tsx`                                                     | Panel de cargas; reutiliza `components/nimbo/upload-progress.tsx`                                 | T-14       |
| `components/name-conflict-dialog.tsx`, `cancel-upload-dialog.tsx`                 | Diálogos de nombre repetido y de cancelar                                                         | T-15       |
| `components/file-explorer.tsx`, `upload-dropzone.tsx`, `explorer-error-state.tsx` | Raíz, arrastre y error del listado                                                                | T-16       |
| `components/file-row-menu.tsx`                                                    | Menú ⋮ con «Descargar» y `DownloadNoticeBanner`                                                   | T-17       |

## Cómo se conectan (para T-53 y T-54)

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
- La barra lateral de `/archivos` no muestra «Carpetas» ni el contador de la Papelera hasta 006.
