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
| `components/node-rows.tsx`, `hooks/use-folder-disclosure.ts`                        | Filas de carpeta y archivo con sangría; desglose de carpetas en la lista (cargando, vacía, error)  | 006 CA-26  |
| `components/new-folder-dialog.tsx`                                                  | «Nueva carpeta» (sobre `components/ui/dialog`): errores 400/409 en el campo y 422 como aviso       | 006 T-08   |
| `components/rename-dialog.tsx`                                                      | «Renombrar»: extensión fija como sufijo; 409 de archivo con «Conservar ambos»                      | 006 T-09   |
| `components/move-dialog.tsx`, `move-folder-tree.tsx`, `hooks/use-folder-tree.ts`    | «Mover a…»: árbol `tree` con carga perezosa, destinos deshabilitados y 409/422                     | 006 T-09   |
| `components/tree-new-folder-field.tsx`, `folder-name-failure.ts`                    | «Nueva carpeta» en línea del árbol; reglas y errores de nombre de carpeta                          | 006 T-09   |
| `components/folder-row-menu.tsx`, `organized-nodes.ts`                              | Menú ⋮ de carpeta; lo renombrado o movido se ve sin volver a pedir la carpeta                      | 006 T-09   |
| `components/upload-panel.tsx`                                                       | Panel de cargas; reutiliza `components/nimbo/upload-progress.tsx`                                  | T-14       |
| `components/name-conflict-dialog.tsx`, `cancel-upload-dialog.tsx`                   | Diálogos de nombre repetido y de cancelar                                                          | T-15       |
| `components/file-explorer.tsx`, `upload-dropzone.tsx`, `explorer-error-state.tsx`   | Raíz, arrastre y error del listado                                                                 | T-16       |
| `trash-api.ts`, `trash-dates.ts`                                                    | Papelera en la API (`DELETE` de nodos, `/trash`, restaurar, purgar, vaciar); días desde `purgeAt`  | 006 T-10   |
| `components/trash-view.tsx`, `hooks/use-trash.ts`, `hooks/use-trash-actions.tsx`    | `/papelera`: carga, error, vacía, lista; restaurar, eliminar definitivamente y vaciar en diferido  | 006 T-10   |
| `components/trash-list.tsx`, `trash-summary.tsx`, `trash-selection-bar.tsx`         | Tabla con selección y ⋮, resumen y retención, aviso de purga próxima y «Vaciando…»                 | 006 T-10   |
| `components/restore-result.tsx`, `purge-confirm-dialog.tsx`                         | Resultado de restaurar por elemento (CA-14/15/17) y confirmación con el espacio que se libera      | 006 T-10   |
| `components/move-to-trash-menu-item.tsx`, `hooks/use-move-to-trash.tsx`             | «Mover a la papelera» en los menús ⋮ (sin rojo) y aviso «Movimos…» con «Ver papelera» (`sonner`)   | 006 T-10   |
| `hooks/use-trash-count.ts`                                                          | Contador de la Papelera en la barra lateral (`GET /trash/summary`), vía `AppLayout.trashCount`     | 006 T-10   |
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
- La barra lateral muestra «Carpetas» (solo las de primer nivel, sin cantidades) y enlaza la Papelera con su contador
  (006 T-10). Los avisos de éxito van por `components/ui/sonner.tsx` (`<Toaster />` en `AppLayout`, ADR-0024); los
  errores siguen arriba de la lista. Las migas van en la barra superior desde `md`; por debajo, «‹ {carpeta anterior}».
- La API no envía nombres en los errores: la web pone el nombre guardado en el `409` de carpetas (de la lista abierta).
  Al mover una carpeta, el `409` dice también el destino («… en {destino}…», `folderMoveConflictMessage`).
- `FileRowMenu` y `FolderRowMenu` abren `RenameDialog` y `MoveDialog`, que `MyFiles` monta solo mientras están
  abiertos. El resultado se guarda en `organized-nodes.ts` (listado y barra lateral) y, si es un archivo subido en la
  pestaña, en `reviseUploaded` para que no reaparezca en su carpeta anterior.
- `maxFileLabel` es opcional: ningún contrato expone todavía `PlanLimits.maxFileBytes` a `web`, así que la página no lo
  pasa y los textos omiten la cifra (propuesta en el registro de cambios de la spec).
- La página muestra solo la primera página de `GET /folders/contents` (carpetas primero, luego más recientes);
  «Cargar más» llega con 007.
- Desglose (006 CA-26): `useFolderDisclosure` pide `GET /folders/contents` de cada carpeta desglosada y descarta la
  respuesta de una carpeta ya contraída. `MyFiles` aplica a cada nivel lo mismo que a la ubicación abierta (cargas,
  `organized-nodes.ts` con lo que llegó por «Mover a…» y lo enviado a la papelera), así una acción en cualquier nivel
  se ve en el nivel correcto; «Renombrar» y «Mover a…» toman las hermanas y las migas del nivel del elemento.
  «Actualizar lista» vuelve a pedir también las carpetas desglosadas.
  Solo se pide la primera página: si trae `nextCursor`, al final del nivel va la fila «Ver más», un enlace a la página
  de la carpeta (Q-2). La sangría y las guías usan el token del desglose (`tree-indent`, `tree-guides` y
  `--tree-level` en la fila, `ui-guidelines.md` §3).
