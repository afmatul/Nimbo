# Revisión 006 — Carpetas y papelera

| Campo | Valor |
|---|---|
| Fecha | 2026-10-01 |
| Rango revisado | `main..feat/006-carpetas-y-papelera` (T-01 a T-10) |
| CI | local: `pnpm lint`, `typecheck` y `test` en verde (api 1339, web 723, contracts 253); `test:isolation` 12 suites / 163 pruebas en verde. `test:int` completo con Docker: 84 suites / 748 pruebas en verde (I-1) |
| Veredicto | ✅ Aprobar, con 3 importantes antes del cierre de fase. T-11 (humana) sigue pendiente |

## Verificación
| CA | Prueba | Estado |
|---|---|---|
| CA-1, CA-5 | `test/int/storage/folders.int-spec.ts` (POST /folders, GET /folders/contents) · web `archivos/**/page.spec.tsx` | ✅ |
| CA-2 | `folder-schemas.spec.ts`, `folder-name.vo.spec.ts`, `folders.int-spec.ts` (400) · `new-folder-dialog.spec.tsx` | ✅ |
| CA-3 | `folders.int-spec.ts` (409, tipo distinto sí convive), `folders-migrations.int-spec.ts` (índice «Ñ/ñ») | ✅ |
| CA-4 | `files-organize.int-spec.ts` · `rename-dialog.spec.tsx` (extensión fija en la UI) | ✅ |
| CA-6 | `uploads-folder.int-spec.ts` (destino y carrera a la papelera), `upload.service.spec.ts` | ✅ |
| CA-7 | `folders.int-spec.ts`, `files-organize.int-spec.ts` · `move-dialog.spec.tsx` | ✅ |
| CA-8, CA-9 | `folder-path.spec.ts`, `folders.int-spec.ts` (422) · `move-dialog.spec.tsx` | ✅ |
| CA-10, CA-11 | `trash.int-spec.ts` (descarga 404, `espacio_usado` igual, suma `bigint`) · `use-move-to-trash.spec.tsx` | ✅ |
| CA-12 | `trash.int-spec.ts` (orden, paginación, resumen) · `papelera/page.spec.tsx` | ✅ |
| CA-13, CA-14, CA-15 | `trash.service.spec.ts`, `trash.int-spec.ts` (original, «(n)», raíz, R-5, 422) · `restore-result.spec.tsx` | ✅ |
| CA-16 | `trash.int-spec.ts`, `trash-purge.int-spec.ts` | ✅ |
| CA-17 | `restore-result.spec.tsx`, `papelera/page.spec.tsx` | ✅ |
| CA-18 | `trash-purge.int-spec.ts` (manual y vaciar 202 + trabajo) · `purge-confirm-dialog.spec.tsx` | ✅ |
| CA-19 | `trash-purge.int-spec.ts` (vencida sí, no vencida no, cuenta no activa), `trash-state.spec.ts`, `plan-limits.adapter*.spec.ts` | ✅ (cuenta vencida real depende de 004, I-3) |
| CA-20 | `trash-purger.spec.ts`, `trash-purge.processor.spec.ts`, `trash-purge.int-spec.ts` (fallo MinIO y reintento) | ✅ |
| CA-21 | `trash-purge.int-spec.ts` (eliminar → restaurar → eliminar → purgar) | ✅ |
| CA-22, CA-23 | `test/isolation/storage-folders.iso-spec.ts`, `storage-maintenance.iso-spec.ts`, `accessible-nodes.spec.ts` | ✅ |
| CA-24 | `trash.service.spec.ts`, `trash.int-spec.ts`, `trash-purge.int-spec.ts`, `log-audit-logger.spec.ts` | ✅ |
| CA-25 | `features/storage/a11y.spec.tsx`, specs de diálogos y `papelera/page.spec.tsx` (axe 360/1440) | ✅ |
| T-11 | Recorrido manual con Docker, capturas en el PR | ⏳ pendiente humano |

## Seguridad
- Datos de cliente: sí. Aislamiento: 163 pruebas ISO en verde; B contra A da 404 idéntico en todas las rutas, RLS de `carpeta` sin filtro, roles internos 403 y sin token 401. `actor` + `accessibleNodes`/`ownedTrashedNodes` dentro de cada consulta: ✅ (`typeorm-trash.repository.ts` los usa en cada rama y en `isDueRoot`/`carriedBy`; todos los joins de `nodo_id` filtran por `tipo_nodo`). Roles internos reciben conjunto vacío: ✅.
- Bitácoras sin nombres, claves ni contenido: ✅ (auditoría y logs solo UUID, tipo, conteo, bytes y `errorName`; `trash.service.ts:349`, `trash-purger.ts:80`). Purga programada: la función `papelera_vencida` devuelve solo `(tipo, id, propietario)`, `SECURITY DEFINER` con `search_path` fijo, límite 1000 y sin `BYPASSRLS`. ✅
- Migraciones: las 3 tienen `down` y se prueban up/down ×3 (`folders-migrations.int-spec.ts`). ✅ Tamaños: SQL con `SUM` en `numeric` y `BigInt(...)` en `typeorm-trash.repository.ts:78,108`. ✅
- Sin hallazgos SEC bloqueantes.

### Adición CA-26 a CA-28 (2026-10-03)
Veredicto: ✅ Sin hallazgos bloqueantes (T-13, T-14 y T-15; auditor de seguridad).

Pruebas ISO agregadas: `apps/api/test/isolation/storage-quick-access.iso-spec.ts` (22) y fixture `withQuickAccess` en
`setup/isolation-world.ts` (escribe con `IQuickAccessRepository` como `nimbo_app` dentro de `withActor`; `close` borra
antes `acceso_rapido`). A y B con carpetas y archivos de igual nombre, 2 fijados y 2 recientes cada uno:
- `GET /quick-access` de B no trae ningún nodo de A; `PUT`/`DELETE /pins` y `POST /recents` de B sobre nodos de A
  (carpeta y archivo, fijados y no fijados) dan el 404 `STORAGE_NODE_NOT_FOUND` idéntico al inexistente salvo
  `correlationId`; quitar «su» fijado con el id de A no cambia ni a A ni a B; B no queda con filas sobre nodos de A.
- RLS: `nimbo_app` sin actor ve 0 filas y su `UPDATE` afecta 0; con el actor de B, `SELECT` sin filtro solo da filas de
  B, `UPDATE`/`DELETE` de filas de A afectan 0 e `INSERT` a nombre de A lo rechaza la política; roles internos ven 0.
- Una fila de B que señala nodos de A (sembrada como dueño) no aparece en el listado ni habilita quitarla (404 idéntico).
- La poda de recientes de B (más de `RECENTS_STORED`) deja 25 suyas y no toca las de A.
- Administrador, Soporte y Operador `403 SHARED_FORBIDDEN` en las 4 rutas (7 llamadas) sin escribir filas; sin token `401`.
- `pnpm test:isolation`: 13 suites / 185 pruebas en verde.

Hallazgos:
- **[SEC-1] media** · `apps/api/src/migrations/20261003100000-crear-acceso-rapido.ts:46-48` · la política
  `acceso_rapido_cliente` solo comprueba `usuario_id = nimbo_actor_id()`; no que el nodo sea visible. Probado como
  `nimbo_app` con el actor de B: `INSERT` de una fila propia con `archivo_id` de A **pasa**, y con un id inexistente
  falla por FK (oráculo de existencia a nivel SQL). Hoy no es explotable por la API (toda escritura es `INSERT … SELECT`
  desde `accessibleNodes`, y el listado une `archivo`/`carpeta` bajo su RLS, así que no filtra nombres), pero la segunda
  barrera de Art. IX queda incompleta. Corrección: migración que agregue al `WITH CHECK`
  `AND (archivo_id IS NULL OR EXISTS (SELECT 1 FROM archivo f WHERE f.id = archivo_id AND f.eliminado_en IS NULL))
  AND (carpeta_id IS NULL OR EXISTS (SELECT 1 FROM carpeta c WHERE c.id = carpeta_id AND c.eliminado_en IS NULL))`
  (las subconsultas corren con la RLS de quien escribe, así que seguirá valiendo con las comparticiones de 012), y una
  prueba ISO que espere el rechazo. Antes del cierre de la fase o en 012, a más tardar.
  **Corregido en a6214ee** (en la misma migración, no publicada): el `WITH CHECK` exige el nodo vivo y visible; ISO
  cubre ajeno, inexistente (mismo rechazo de RLS, sin llegar a la FK), en la papelera y redirigir una fila por `UPDATE`.
- **[SEC-2] baja** · `typeorm-quick-access.repository.ts:171-181` (`pruneRecents`) · decisión auditada: filtra por
  `usuario_id = :actorId` y además la RLS limita `DELETE` a filas del actor, así que no puede tocar filas de otra cuenta
  (probado). No lee ni devuelve datos de nodos ni recibe un nodo, por lo que no contradice «toda consulta filtra con
  `accessibleNodes(actor)`», que protege nodos; unirlo impediría podar filas de nodos en la papelera o, con 012, de
  comparticiones revocadas. Corrección: dejar la excepción escrita en `architecture.md` §6 (filas de metadatos propias
  de la cuenta, clave `usuario_id`) para que no se copie a tablas de contenido.
- **[SEC-3] baja** · `quick-access.controller.ts` · sin límite de tasa en `PUT /pins` y `POST /recents` (cada llamada
  escribe y `pin` toma `lockUsage`, que serializa también las cargas del dueño). El daño queda acotado a la propia cuenta
  y la poda limita el crecimiento; sumar al limitador general cuando exista (PD de RNF de abuso).

Checklist:
- [x] `actor` en cada método; lecturas, `findAccessibleNode`, `upsert` (`INSERT … SELECT` del nodo visible),
  `removePin` y `countPinned` unen `accessibleNodes(actor)` en la consulta y por `tipo_nodo`; `pruneRecents` ver SEC-2.
- [x] RLS `ENABLE` + `FORCE` en `acceso_rapido`, política solo `CLIENT` dueño de la fila; `SET LOCAL` por `withActor`.
  `WITH CHECK` incompleto: SEC-1.
- [x] Roles internos: `@Roles(Role.CLIENT)` en el controlador y política sin rama interna; sin `objectKey`, URL ni texto
  en las respuestas (solo `type`, `id`, `name`, `kind` del propio cliente).
- [x] Ajeno, inexistente, en la papelera, `:nodeType` o `:nodeId` inválidos: el mismo 404; `lockUsage` va antes de
  buscar el nodo en `pin`, así que el camino es igual para ajeno e inexistente.
- [x] SQL parametrizado; tabla, FK y restricción salen de un mapa constante (`COLUMNS`), no de la entrada.
- [x] Bitácoras: servicio, repositorio y controlador no registran nada; sin auditoría por diseño (plan §9.2).
- [x] Migración con `down`; sin dependencias nuevas en T-13/T-14 (sin cambios de `package.json` ni del lockfile).
- [ ] Límite de tasa: SEC-3.

## UI
- Coincide con los mockups de `explorador/` y `papelera/` y sus estados; solo tokens (las únicas medidas arbitrarias, `border-l-[3px]` y `border-[1.5px]`, están permitidas por `ui-guidelines.md:221`); axe sin serios; textos en español; `sonner` con `role="status"`: ✅.

## Bloqueantes
- Ninguno.

## Importantes y sugerencias
- **[I-1] ✅ Resuelto (2026-10-01):** causa de entorno, ajena a 006. Con `docker compose up -d` (`postgres`, `redis` y `minio` sanos) `dotenv-bootstrap.int-spec.ts` pasa sola (3/3): la `api` compilada lee el `.env` de la raíz y necesita Postgres y Redis de compose para no salir antes de `health/live`; el `.env` local no tenía `FOLDER_MAX_DEPTH` ni `TRASH_PURGE_*` y aun así arranca porque tienen valor por defecto. `pnpm test:int` completo: 84 suites / 748 pruebas en verde (355 s), sin «Cannot log after tests are done» ni «Jest did not exit». Origen del aviso y del corte: un `Worker` de BullMQ sin cerrar con Redis caído en `worker/worker-health.int-spec.ts`; al quitar a modo de prueba el `worker.close(true)` de `TrashPurgeProcessor` en su `afterAll`, la suite pasa pero Jest no termina («did not exit»). El cierre ya está en la rama, así que no hubo cambio de código. Hallazgo original: `apps/api/test/int/shared/dotenv-bootstrap.int-spec.ts:89` — al repetirla aquí falla («api» sale antes de responder `health/live`; sin Postgres/Redis locales).
- **[I-2] ✅ Resuelto en documentación (2026-10-01):** PD-60 en `pendientes.md` y desviación 4 en DF-61. `trash-purger.ts:56-74` (desviación 1) — aceptable y mejor que el plan (evita la carrera restaurar/purgar), pero retiene la fila del dueño y una conexión mientras MinIO responde, y bloquea sus cargas. Con una carpeta grande el bloqueo crece con N archivos × versiones. Aceptar con registro: añadir fila en `pendientes.md` para medir con k6 (spec 021/022) y, si hace falta, purgar por archivo en transacciones separadas. Además, si un error de BD (no de MinIO) aborta la transacción tras borrar objetos de archivos anteriores, esos registros se revierten con objeto ya borrado: poco probable, pero conviene la misma fila.
- **[I-3] ✅ Resuelto en documentación (2026-10-01):** DF-61 registra `schedulePurgeOfAll`, `TRASH_LIFECYCLE_PROVIDERS` y la cola `trash-purge`; notas fechadas al final de plan §1 y §2; PD-61 en `pendientes.md`. Desviaciones 2, 3 y 4 ya constan en «Notas del developer», pero `plan.md` §2 y `design-findings.md` (DF-61) no mencionan `ITrashRepository.schedulePurgeOfAll` ni `TRASH_LIFECYCLE_PROVIDERS`/`worker.module.ts`; DF-61 sí cita `suspendida`. Agregar `schedulePurgeOfAll` al plan §2 / DF-61. La desviación 3 (CA-19 con `usuario.estado = 'suspendida'`) es válida mientras no exista suscripción (004): dejar una fila en `pendientes.md` para sumar el caso de suscripción vencida cuando exista.
- **[S-1]** `trash.service.ts:87-100` — 11 dependencias en el constructor; `TrashService` junta eliminar, restaurar, purgar y vaciar. Si en 011 (restauración por Soporte) crece más, separar `TrashRestorer`.
- **[S-2]** `trash.service.ts:240,344` — `Number(bigint)` en atributos de auditoría; sigue la convención de 005 y el contrato, pero la regla «bytes siempre `bigint`» sugiere serializar como `string` cuando llegue a la bitácora de 004.

## DF y pendientes
- DF-61 y PD-59 agregados. I-2 e I-3 resueltos en documentación: PD-60 (medir bloqueo de purga), PD-61 (caso de suscripción vencida) y desviaciones en DF-61 y notas de plan §1/§2. I-1 resuelto con `test:int` completo en verde con Docker (84 suites / 748 pruebas).

## Lo que está bien hecho
- Una sola vía de borrado (`TrashPurger`) compartida por manual y programada; idempotente y sin nombres ni claves en errores.
- `ownedTrashedNodes` y `accessibleNodes` con las mismas columnas y `tipo_nodo`; restauración sin `Folder.rehydrate` tras R-5, probada.
- Índices extra de raíz justificados con `EXPLAIN` en la prueba de migración; migraciones reversibles.
- Pruebas de aislamiento amplias (rutas, RLS, `papelera_vencida`) y pruebas web con axe en ambos anchos.

## Adición CA-26 a CA-28 (2026-10-03)
| Campo | Valor |
|---|---|
| Rango | `5d40b55..HEAD` (a453c03…36f0521): T-12 a T-16, SEC-1, SEC-2 |
| CI local | lint y typecheck en verde · `test`: api 1384, web 783, contracts 265 · `test:int` 86 suites / 797 · `test:isolation` 13 / 192 |
| Veredicto | 🔁 Un bloqueante documental (B-1, sin código). Al corregirlo: ✅ con I-4 a I-8 antes del cierre de fase. T-11 y T-17 (humanas) pendientes |

### Verificación
| CA | Prueba | Estado |
|---|---|---|
| CA-26 | `folder-disclosure.spec.tsx` (expandir/contraer, 2 niveles, cargando/vacía/error por fila, teclado, respuesta tardía, token, «Ver más»), `my-files.spec.tsx` (acciones en subnivel), `a11y.spec.tsx` (5 estados, 360/1440) | ✅ (sangría: B-1) |
| CA-27 | `quick-access.service.spec.ts`, `quick-access.int-spec.ts` (orden, 3 + `hasMoreRecent`, poda, papelera/restaurar, `CASCADE`), `quick-access-section.spec.tsx` (5 + 3, solo uno, «Ver más», oculta, ⋮, foco, cajón), `file-row-menu`/`folder-row-menu.spec.tsx`, `carpeta/[folderId]/page.spec.tsx` (reciente al montar), `my-files.spec.tsx` (descarga cuenta, desglosar no) | ✅ (barra desactualizada en sesión: I-4) |
| CA-28 | `quick-access.service.spec.ts` y `.int-spec.ts` (422 con `maxPinned`, `PUT` repetido 200, concurrencia R-7, roles 403, sin nombres en bitácoras), `quick-access-migrations.int-spec.ts` (RLS, up/down ×3, `EXPLAIN`), `storage-quick-access.iso-spec.ts`, `my-files.spec.tsx` (`Alert` `warning`) | ✅ |

### Seguridad (resumen del auditor)
Sin bloqueantes. SEC-1 corregido en a6214ee (`WITH CHECK` exige el nodo vivo y visible; ISO de ajeno, inexistente, papelera y `UPDATE`). SEC-2 aceptado con la excepción en `architecture.md` §6. SEC-3 (límite de tasa) abierto: I-6.

### UI
Coincide con los mockups aprobados de `explorador/` (desglose, menú de fila, tope) y `shared/layout/` (fijados, recientes, ⋮, cajón). Solo tokens (`tree-*`, `warning`), textos en español, axe sin hallazgos serios a 360 y 1440 px. La sección «Carpetas» se reemplaza por «Accesos rápidos» según el mockup.

### Bloqueantes
- **[B-1] (documental)** La spec contradice el código y los mockups aprobados: (a) CA-26 dice «16 px por nivel… se repite pasados 10 niveles», pero el token (`ui-guidelines.md`, `globals.css`) deja de crecer en el nivel 3 a 360 px y en el 6 desde `sm` (28 px), como aprobó Adrián en `mockups/storage/explorador/README.md`; (b) CA-27 dice «cada elemento es un enlace», pero el archivo es un `<button>` que descarga (`quick-access-section.tsx`); (c) §6 dice que la barra «recupera "Carpetas"». Corregir CA-26, CA-27 y §6 con fila en el registro de cambios.

### Importantes
- **[I-4]** `my-files.tsx` y `trash-view.tsx`: mover a la papelera, renombrar o restaurar no recargan los accesos rápidos; un fijado en la papelera sigue en la barra hasta navegar (CA-27). Llamar a `sidebar.quickAccess.reload()` en `onMoved`, `remember` y tras restaurar, con prueba en `my-files.spec.tsx`.
- **[I-5]** `use-quick-access.ts`: un fallo de `pin` que no es el tope se ignora; `quick-access-sidebar.tsx` descarta el `false` de `unpin` desde la fila (Art. VII). Mostrar un aviso arriba de la lista con `storageMessage`.
- **[I-6]** SEC-3 sin fila en `pendientes.md`: agregarla (limitador general / RNF de abuso).
- **[I-7] (Adrián)** `CLAUDE.md` formula «filtra con `accessibleNodes(actor)`» sin la excepción de `architecture.md` §6 (SEC-2); remitir a ella.
- **[I-8]** Faltan «Notas del developer» de T-12 a T-16 en `tasks.md`: se quitaron `FolderSection`, `useRootFolders` y `withOrganizedRootFolders`; se agregaron `AppLayout.sidebarSection` y `useSidebarSlot()`; archivos de la barra como `<button>` con `aria-label`; pruebas de la migración en `quick-access-migrations.int-spec.ts`; `alert.tsx` sin cambios (la variante `warning` ya existía); el anuncio «No pudimos quitar {nombre} de la barra lateral…», que no está en spec ni en mockup.

### Sugerencias
- **[S-3]** `quick-access-section.tsx`: `[@media(hover:none)]` → `@custom-variant` en `globals.css`.
- **[S-4]** El texto del tope está en el dominio, en `quickAccessLimitMessage` (solo lo usan las pruebas) y en `error-catalog.ts`; mismo patrón que la profundidad y vigilado por pruebas. Considerar armar el catálogo desde contracts.
- **[S-5]** `MyFiles` mide 139 líneas (133 antes de la adición): extraer un hook de niveles.
- **[S-6]** `acceso_rapido.usuario_id` sin `CASCADE`: anotar en PD que la baja de cuentas debe borrar antes estas filas.

### DF y pendientes
DF-63 y PD-46 actualizados; PD-34 resuelto para RF-38. Falta la fila de SEC-3 (I-6).

### Lo que está bien hecho
- Toda lectura y escritura une `accessibleNodes(actor)` dentro del SQL (`INSERT … SELECT` desde el nodo visible). RLS con `WITH CHECK` sin oráculo de existencia y 404 idéntico probado en ISO.
- El tope se serializa con el `lockUsage` existente y tiene prueba de concurrencia real. `PUT` es idempotente y conserva el orden. El `CASCADE` evita tocar la papelera (SRP).
- Desglose bien separado: `useFolderDisclosure` (turnos por carpeta), `toFolderDisclosure` (cambios locales) y `NodeTable` sin conocer peticiones. Token de sangría único, sin clases por nivel.
- Accesibilidad cuidada: `aria-controls` con las filas reales, foco al quitar un fijado, Escape solo cierra el menú dentro del cajón. Pruebas nombradas por CA y estado de mockup.

### Seguimiento de la revisión de la adición (2026-10-04)
- **B-1** corregido en 650281d (CA-26 con el token de sangría, CA-27 enlace/botón, §6 «Accesos rápidos» reemplaza a «Carpetas») y en el commit de este seguimiento (§6, avisos de fallo como se implementaron).
- **I-4** corregido en 81066d3: mover a la papelera, renombrar, mover y restaurar recargan los accesos rápidos.
- **I-5** corregido en 81066d3: fallos de fijar y quitar (fila y barra) muestran un aviso arriba de la lista con «Reintentar» o «Actualizar lista»; `isStorageNotFound` extraído (DRY).
- **I-6** corregido en 650281d: PD-64 (SEC-3) y PD-65 (S-6).
- **I-7** pendiente de Adrián (`CLAUDE.md` y la excepción de `architecture.md` §6).
- **I-8** corregido en 650281d (notas del developer de T-12 a T-16 y SEC-1).
- **S-3** hecho en 81066d3 (`@custom-variant hover-none`). S-4 y S-5 quedan como sugerencias; S-6 pasa a PD-65.
- **Veredicto:** ✅ aprobable, salvo I-7 (decisión de Adrián) y los recorridos humanos T-11 y T-17.
