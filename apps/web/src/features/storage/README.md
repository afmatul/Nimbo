# Storage en la web

Componentes de las specs 005, 006 y 007 para cargar, navegar carpetas, crear carpetas, descargar y ver el espacio. Cada componente recibe sus datos y
callbacks por props; solo `api.ts` habla con la API.

**Proveedor de la pestaña (T-53)**: `app/(app)/(cliente)/layout.tsx` monta `SessionUploadsProvider`
(`components/uploads-provider.tsx`), que arma el cliente de `api.ts` sobre `session/auth-fetch.ts` con el token en
memoria de la sesión y crea **un** `UploadManager` por pestaña (`hooks/use-upload-manager.ts`). Escucha
`online`/`offline`, pinta el panel flotante y abre los diálogos. Navegar dentro de `(cliente)` conserva las cargas;
recargar las pierde (RN-7). Las páginas leen el contexto con `useUploads()`.

**Resumen de espacio (007 T-10)**: dentro del proveedor de cargas, el layout monta `UploadsSpaceProvider`
(`components/space-provider.tsx`), que hace **una** lectura de `GET /storage/summary` para toda la pestaña (D-15) y la
expone con `useSpace()` (`{ state: loading | error | ready, refresh }`). La leen la tarjeta de cuota de la barra lateral,
el `{máximo}` del explorador y `/espacio`. `refresh()` conserva la cifra visible hasta la respuesta (desde `error` vuelve
a «cargando») y descarta respuestas de intentos anteriores. Se refresca al completar una carga (cambia
`uploadedFiles.length`; el `UploadManager` no se toca), al mandar a la papelera, restaurar, eliminar definitivamente y al
terminar de vaciar (D-16). Sin empuje en tiempo real (P-2). Si el resumen falla, el resto de la app sigue usable (CA-8).

| Pieza                                                                               | Qué hace                                                                                                 | Tarea      |
| ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ---------- |
| `upload/upload-manager.ts`                                                          | Máquina de estados de las cargas (2 archivos × 4 partes, pausa, corte, cancelación)                      | T-12, T-13 |
| `upload/xhr-put.ts`                                                                 | `PUT` a MinIO con progreso por bytes y aborto, sin credenciales de la app                                | T-11       |
| `storage-request-error.ts`                                                          | Error HTTP de la API de `storage` (`status`, `code`, `details`); un fallo sin respuesta es de red        | T-12       |
| `api.ts`, `storage-http.ts`                                                         | Cliente de `/uploads` y `/files` sobre `auth-fetch`; valida las respuestas con `contracts/storage`       | T-53       |
| `folders-api.ts`                                                                    | `GET /folders/contents` (reemplaza a `GET /files`) con `sort`, `dir` y `cursor`, y `POST /folders`       | 006, 007   |
| `node-order.ts`                                                                     | `NodeOrder`, orden por defecto (`created` descendente) y textos del orden («Tamaño, mayor primero»)      | 007 T-11   |
| `components/node-sort-menu.tsx`, `components/load-more.tsx`                         | Menú «Ordenar» (dos grupos de radio y la nota de carpetas) y «Cargar más» con cargando y error           | 007 T-11   |
| `routes.ts`                                                                         | `/archivos` y `/archivos/carpeta/[folderId]` (una URL por carpeta)                                       | 006 T-08   |
| `hooks/use-folder-contents.ts`                                                      | Listado de la ubicación (cargando, error, «no encontrada»), orden, «Cargar más»                          | 006, 007   |
| `hooks/use-upload-manager.ts`, `components/uploads-provider.tsx`                    | Manager por pestaña, eventos de red, panel y diálogos conectados                                         | T-53       |
| `components/my-files.tsx`                                                           | Vista de `/archivos` y de cada carpeta: barra lateral, migas, listado, subir a la carpeta abierta        | T-54, 006  |
| `components/node-table.tsx`, `folder-breadcrumbs.tsx`, `folder-not-found-state.tsx` | Tabla de carpetas y archivos, migas («…» con más de 4 niveles) y «‹ Volver», 404 de carpeta              | 006 T-08   |
| `components/sortable-header.tsx`                                                    | Encabezados «Nombre», «Tamaño» y «Modificado» como botones de orden con `aria-sort` en la columna activa | 007 T-11   |
| `components/node-rows.tsx`, `hooks/use-folder-disclosure.ts`                        | Filas de carpeta y archivo con sangría; desglose de carpetas en la lista (cargando, vacía, error)        | 006 CA-26  |
| `components/new-folder-dialog.tsx`                                                  | «Nueva carpeta» (sobre `components/ui/dialog`): errores 400/409 en el campo y 422 como aviso             | 006 T-08   |
| `components/rename-dialog.tsx`                                                      | «Renombrar»: extensión fija como sufijo; 409 de archivo con «Conservar ambos»                            | 006 T-09   |
| `components/move-dialog.tsx`, `move-folder-tree.tsx`, `hooks/use-folder-tree.ts`    | «Mover a…»: árbol `tree` con carga perezosa, destinos deshabilitados y 409/422                           | 006 T-09   |
| `components/tree-new-folder-field.tsx`, `folder-name-failure.ts`                    | «Nueva carpeta» en línea del árbol; reglas y errores de nombre de carpeta                                | 006 T-09   |
| `components/folder-row-menu.tsx`, `organized-nodes.ts`                              | Menú ⋮ de carpeta; lo renombrado o movido se ve sin volver a pedir la carpeta                            | 006 T-09   |
| `components/upload-panel.tsx`                                                       | Panel de cargas; reutiliza `components/nimbo/upload-progress.tsx`                                        | T-14       |
| `components/name-conflict-dialog.tsx`, `cancel-upload-dialog.tsx`                   | Diálogos de nombre repetido y de cancelar                                                                | T-15       |
| `components/file-explorer.tsx`, `upload-dropzone.tsx`, `explorer-error-state.tsx`   | Raíz, arrastre y error del listado                                                                       | T-16       |
| `trash-api.ts`, `trash-dates.ts`                                                    | Papelera en la API (`DELETE` de nodos, `/trash`, restaurar, purgar, vaciar); días desde `purgeAt`        | 006 T-10   |
| `components/trash-view.tsx`, `hooks/use-trash.ts`, `hooks/use-trash-actions.tsx`    | `/papelera`: carga, error, vacía, lista; restaurar, eliminar definitivamente y vaciar en diferido        | 006 T-10   |
| `components/trash-list.tsx`, `trash-summary.tsx`, `trash-selection-bar.tsx`         | Tabla con selección y ⋮, resumen y retención, aviso de purga próxima y «Vaciando…»                       | 006 T-10   |
| `components/restore-result.tsx`, `purge-confirm-dialog.tsx`                         | Resultado de restaurar por elemento (CA-14/15/17) y confirmación con el espacio que se libera            | 006 T-10   |
| `components/move-to-trash-menu-item.tsx`, `hooks/use-move-to-trash.tsx`             | «Mover a la papelera» en los menús ⋮ (sin rojo) y aviso «Movimos…» con «Ver papelera» (`sonner`)         | 006 T-10   |
| `hooks/use-trash-count.ts`                                                          | Contador de la Papelera en la barra lateral (`GET /trash/summary`), vía `AppLayout.trashCount`           | 006 T-10   |
| `space-api.ts`                                                                      | `GET /storage/summary` validado con `spaceSummaryResponseSchema` de `contracts`                          | 007 T-10   |
| `components/space-provider.tsx`                                                     | `SpaceProvider`, `UploadsSpaceProvider` y `useSpace()`: resumen compartido y su refresco                 | 007 T-10   |
| `components/sidebar-quota.tsx`                                                      | Tarjeta «Almacenamiento» de la barra lateral (`AppLayout.quotaCard`): `QuotaBar`, «Ver detalle»          | 007 T-10   |
| `components/space-summary-view.tsx`, `space-breakdown.tsx`                          | `/espacio`: aviso de tramo, medidor, «Tu plan» con su nombre y desglose; cargando y error                | 007 T-08   |
| `components/file-row-menu.tsx`                                                      | Menú ⋮ con «Descargar» y `DownloadNoticeBanner`; «Fijar/Quitar de la barra lateral» (`PinMenuItem`)      | T-17, 006  |
| `quick-access-api.ts`, `hooks/use-quick-access.ts`                                  | `/quick-access`: fijados y recientes, fijar, quitar y registrar aperturas (mejor esfuerzo)               | 006 T-16   |
| `components/quick-access-section.tsx`, `quick-access-sidebar.tsx`                   | «Accesos rápidos» en la barra y el cajón (⋮ en cada fijado); descarga y menús de fila conectados         | 006 T-16   |
| `components/quick-access-limit-alert.tsx`                                           | Aviso `warning` del tope de fijados (`STORAGE_QUICK_ACCESS_LIMIT`), arriba de la lista                   | 006 T-16   |

Los textos de error de `storage` salen de `lib/error-catalog.ts` (`storageMessage`: causa y acción, con las cifras de
`details`); el panel los usa tal cual.

## Cómo se conectan

- `UploadPanel.rows` es `manager.snapshot()`; `onPause`, `onResume`, `onRetry` y `onRequestCancel` llaman los métodos
  del mismo nombre. `onUploadAgain` abre el selector de archivos compartido por `FileExplorer.fileInputRef`.
- La fila con `awaitingCancel` abre `CancelUploadDialog` (`onConfirm` → `confirmCancel`, `onDismiss` →
  `dismissCancel`); las cifras se formatean con `formatBytes`.
- La primera fila en `conflict` abre `NameConflictDialog` con `finalName = suggestedName` y
  `othersCount = pendingConflictsInBatch(id)`; la respuesta va a `resolveConflict(id, decision, applyToRest)`.
- `FileExplorer.onFiles` entrega `File[]` para `manager.enqueue`; `maxFileLabel` es `maxFileBytes` del resumen de
  espacio (`useSpace()`, 007 CA-6), nunca una constante; mientras no hay resumen, los textos omiten la cifra. `onRetry` vuelve a pedir la primera página con el orden vigente.
- `FileRowMenu.requestUrl` llama `POST /files/:id/download-url` y lanza `StorageRequestError` ante un error HTTP. El
  aviso que emite `onNotice` se pinta con `DownloadNoticeBanner` en `FileExplorer.notice`, arriba de la lista.
- La barra lateral muestra «Accesos rápidos» (006 CA-27; reemplaza a «Carpetas») y enlaza la Papelera con su contador
  (006 T-10). Los avisos de éxito van por `components/ui/sonner.tsx` (`<Toaster />` en `AppLayout`, ADR-0024); los
  errores siguen arriba de la lista. Las migas van en la barra superior desde `md`; por debajo, «‹ {carpeta anterior}».
- La API no envía nombres en los errores: la web pone el nombre guardado en el `409` de carpetas (de la lista abierta).
  Al mover una carpeta, el `409` dice también el destino («… en {destino}…», `folderMoveConflictMessage`).
- `FileRowMenu` y `FolderRowMenu` abren `RenameDialog` y `MoveDialog`, que `MyFiles` monta solo mientras están
  abiertos. El resultado se guarda en `organized-nodes.ts` (listado y barra lateral) y, si es un archivo subido en la
  pestaña, en `reviseUploaded` para que no reaparezca en su carpeta anterior.
- «Liberar espacio» del rechazo por cuota (panel de cargas) y de la tarjeta lateral lleva a `/espacio` (`SPACE_PATH`,
  007 CA-7). La tarjeta muestra «Ver detalle» bajo el 70 % y, en `/espacio`, no lleva enlaces.
- Desglose (006 CA-26): `useFolderDisclosure` pide `GET /folders/contents` de cada carpeta desglosada y descarta la
  respuesta de una carpeta ya contraída. `MyFiles` aplica a cada nivel lo mismo que a la ubicación abierta (cargas,
  `organized-nodes.ts` con lo que llegó por «Mover a…» y lo enviado a la papelera), así una acción en cualquier nivel
  se ve en el nivel correcto; «Renombrar» y «Mover a…» toman las hermanas y las migas del nivel del elemento.
  «Actualizar lista» vuelve a pedir también las carpetas desglosadas.
  Cada nivel se pide con el orden que muestra la tabla (`controls.shownOrder`) y 10 elementos (`DISCLOSED_PAGE_SIZE`,
  007 CA-20); al cambiar el orden se vuelven a pedir los niveles abiertos, conservando lo visible hasta que llega. Si
  trae `nextCursor`, al final del nivel va la fila «Ver más», un enlace a la página de la carpeta (Q-2). La sangría y las guías usan el token del desglose (`tree-indent`, `tree-guides` y
  `--tree-level` en la fila, `ui-guidelines.md` §3).
- Accesos rápidos (006 CA-27, CA-28): `useQuickAccessSidebar` (en `MyFiles` y `TrashView`) da la sección para
  `AppLayout.sidebarSection` (la misma en la barra y el cajón, que sabe dónde está con `useSidebarSlot()`), el
  `requestUrl` de la descarga y el estado «fijado» de cada fila, que sale de `GET /quick-access` (`NodeSummary` no
  cambia). Montar la página de una carpeta la registra como reciente antes de leer la lista; descargar un archivo (fila
  o barra) también, si la URL llega; desglosar en la lista no. Un fallo al registrar no se muestra. El sexto fijado
  (`422`) deja el aviso del tope arriba de la lista y no cambia nada; el ítem «Fijar» no se deshabilita.

## Orden y «Cargar más» (007 T-11)

- `useFolderContents` pide la primera página con el orden elegido (por defecto `created` descendente, el de 006, D-6)
  y devuelve `controls` (`ListControls`) que `MyFiles` pasa a `FileExplorer`. El orden vive en el estado del
  componente, **no en la URL** (`?orden=…` del mockup es un punto abierto no aprobado, plan §7): se pierde al recargar.
- Cambiar el orden pide la primera página y **conserva lo visible** hasta que llega (`sorting`, botón «Ordenando…»,
  lista con `aria-busy`); la respuesta de un orden anterior se descarta. Si esa primera página falla, se ve el error
  del listado con «Reintentar» (que repite el orden nuevo).
- «Cargar más» pide `nextCursor` **con el mismo orden** con el que se emitió (D-8) y acumula al final sin repetir ids.
  Una página que llega después de cambiar de orden o de carpeta se descarta (su cursor ya no es el siguiente). Si
  falla, lo visible se conserva y el botón cambia por el aviso «No pudimos cargar más elementos.» con «Reintentar» y
  «Cerrar aviso» (reutiliza `DownloadNoticeBanner`); un `role="status"` anuncia «Se cargaron N elementos más.».
- Con otro orden que el de 006, subir, renombrar o mover relee el listado (I-1) **con todas las páginas que ya había**:
  `withPagesUpTo` sigue los `nextCursor` hasta reunir los elementos visibles y reemplaza la lista de una vez (007
  CA-21). Si una de esas páginas falla, se ve el error del listado con «Reintentar».
- Encabezados: «Nombre», «Tamaño» y «Modificado» son botones dentro del `th` (la columna activa invierte la dirección;
  otra empieza ascendente, el valor por defecto de la API) y solo la columna activa lleva `aria-sort`. **Con el orden por
  fecha de creación ninguna columna lleva `aria-sort`**: la tabla muestra «Modificado» (`updatedAt`), no la fecha de
  creación, así que las fechas visibles no salen en orden; es esperado. La tabla marca el orden de lo que muestra, no
  el pedido. Con `size` las carpetas no tienen tamaño y la API las ordena por nombre ascendente (D-7).
- «Modificado» y la segunda línea móvil («{tamaño} · {fecha}», «Carpeta · {fecha}») usan `updatedAt`.
