# Plan 007 — Cuota y explorador

> Spec: `./spec.md` · Estado del plan: **Aprobado** (Adrián, 2026-10-01, con la corrección del orden por defecto, ver §7 D-6)
> Dice qué archivos se tocan y qué se espera de cada uno. Reutiliza lo integrado por 005, 006 y 006a; las desviaciones de
> los diagramas quedan en **DF-62** (por registrar).

## 1. Resumen técnico
- **Medidor**: `GET /storage/summary` es una lectura sin bloqueo. Lo usado es el contador `usuario.espacio_usado` (lo que
  `QuotaService` aplica); el desglose sale de dos consultas: archivos **vivos propios** agrupados por `archivo.tipo` y el total de la
  papelera con `ITrashRepository.trashSummary` (raíces: una carpeta pesa lo que arrastró y un archivo suelto pesa lo suyo, así
  nada se cuenta dos veces). El tipo se convierte en categoría (Documentos / Imágenes / Otros) con una función pura.
- **Conciliación**: la misma medición (`SpaceMeasurer`) corre en el `worker` por cuenta, en una transacción propia con
  `lockUsage` primero, y deja `espacio_usado` igual a lo medido (`addUsedBytes(diferencia)`). Cola `usage-reconcile` con el patrón
  scheduler + processor de `trash-purge`. Las cuentas se listan por páginas de `id` con un `SELECT` (decisión D-12).
- **Explorador**: `GET /folders/contents` agrega `sort` (`name|size|updated|created`) y `dir` (`asc|desc`). Sin ellos el orden es el de
  006: `created` descendente (`creado_en DESC, id DESC`), carpetas primero, así que las pruebas de listado de 006 no cambian. El orden
  y el cursor se modelan con un VO puro `NodeOrder`; el cursor lleva el orden con el que se emitió y se rechaza (`400`) si no coincide.
  Sin índices nuevos (D-9). `FileSummary` y `FolderSummary` agregan `updatedAt` para mostrar la columna «Modificado».
- **Web**: `SpaceProvider` (una lectura compartida del resumen) alimenta la tarjeta de cuota de la barra lateral, el
  `{máximo}` del explorador y la pantalla `/espacio`; se refresca tras subir, eliminar, restaurar y purgar. `QuotaBar` es el
  componente compartido de `ui-guidelines.md` §4. El explorador gana encabezados ordenables y «Cargar más».
- **Sin migraciones**: no hay columnas, funciones SQL ni índices nuevos. Lo ya integrado cubre la consulta (D-9, D-12).

## 2. Módulos, archivos y diseño
| Módulo / capa | Archivo (nuevo o cambiado) | Responsabilidad |
|---|---|---|
| storage/domain | `file-category.ts` (nuevo) | `FileCategory = 'documents' \| 'images' \| 'other'` y `categoryOf(kind: FileKind)` (docx, pdf, texto, xlsx, pptx → Documentos; imagen → Imágenes; otro → Otros). Puro |
| storage/domain | `space-breakdown.ts` (nuevo) | VO inmutable: bytes por categoría + `trashBytes`; `fromBytesByKind(map, trashBytes)` y `totalBytes`. Sin SQL |
| storage/domain | `quota-policy.ts` (cambia) | `QuotaPolicy.available(limits, usage)` = `max(0, cuota − usado − reservado)`, la misma base que `check` (005 CA-4) |
| storage/domain | `node-order.ts` (nuevo) | `NodeSort` (`name`, `size`, `updated`, `created`), `SortDirection` y `NodeOrder` (por defecto `created` descendente, el de 006). `keyFor(group)` devuelve el criterio del grupo: las carpetas no tienen tamaño, así que con `size` se ordenan por nombre ascendente; con los otros tres usan su propia columna (D-7) |
| storage/application | `space-measurer.ts` (nuevo) | `measure(actor)`: debe correr dentro de `withActor`; une `ISpaceRepository.liveBytesByKind` y `ITrashRepository.trashSummary` en un `SpaceBreakdown`. Lo usan el resumen y la conciliación (DRY) |
| storage/application | `space-summary.service.ts` (nuevo) | `summary(actor)`: `IPlanLimitsProvider.limitsFor` fuera de la transacción, y en `withActor` `IQuotaRepository.readUsage` + `measure`. Devuelve nombre del plan, usado, reservado (cargas en curso), cuota, disponible, máximo por archivo, días de papelera y desglose |
| storage/application | `usage-reconciler.ts` (nuevo) | `reconcile(owner: Actor)`: `withActor` → `lockUsage` → `measure` → ajusta la diferencia → evento técnico `quota.reconciled` (UUID y diferencia, sin nombres). Idempotente |
| storage/application/ports | `i-space.repository.port.ts` (nuevo) | `liveBytesByKind(actor): Promise<ReadonlyMap<FileKind, bigint>>` (versiones de archivos vivos propios) |
| storage/application/ports | `i-client-account.scanner.port.ts` (nuevo) | `listClientIds(afterId: string \| null, limit): Promise<readonly string[]>`; único acceso sin actor de la conciliación, solo lo inyecta el procesador |
| storage/application/ports | `i-quota.repository.port.ts` (cambia) | `readUsage(actor, now): Promise<QuotaUsage>`: lectura sin `FOR UPDATE` de lo usado y de lo reservado |
| storage/application | `folder.service.ts`, `ports/i-node.repository.port.ts` (cambian) | `contents` y `NodeListQuery` reciben `order: NodeOrder`; sin otro cambio de comportamiento |
| storage/application | `file-summary.ts`, `node-summary.ts` (cambian) | Agregan `updatedAt` (ISO) a archivo y carpeta |
| storage/infrastructure/persistence | `node-list-cursor.ts` (cambia) | Cursor `[sort, dir, grupo, valor, id]` (valor: nombre, bytes en texto o ISO). `decode(cursor, order)` lanza `InvalidQueryError` (`INVALID_CURSOR`) si el orden, el grupo o el tipo del valor no encajan. `listTrash` sigue usando su propio par `[tipo, eliminado_en, id]` |
| storage/infrastructure/persistence | `node-order-sql.ts` (nuevo) | De `NodeOrder` + grupo a `ORDER BY` y condición de teclado (`(clave, id) > o < (:valor, :id)`); nombre con `lower(nombre)`, igual que los índices únicos; `created` reproduce el `creado_en DESC, id DESC` de `newestFirst` |
| storage/infrastructure/persistence | `typeorm-node.repository.ts` (cambia) | `listContents` usa `node-order-sql` en lugar de `newestFirst` (que se elimina) y emite el cursor con el orden |
| storage/infrastructure/persistence | `typeorm-space.repository.ts` (nuevo) | `liveBytesByKind`: `nodesIn(accessibleNodes(actor), 'a.id', 'archivo')` **y** `a.propietario_id = :actorId`, sumando `version_archivo.tamano_bytes` (como `FILE_BYTES_SQL`) por `a.tipo` |
| storage/infrastructure/persistence | `typeorm-quota.repository.ts` (cambia) | `readUsage` (la reserva y el contador, sin bloqueo); `lockAndReadUsage` lo reutiliza |
| storage/infrastructure/persistence | `sql-client-account.scanner.ts` (nuevo) | `SELECT id FROM usuario WHERE rol = $1 AND ($2::uuid IS NULL OR id > $2) ORDER BY id LIMIT $3` en `ITransactionRunner.run` |
| storage/infrastructure | `usage-reconcile.scheduler.ts`, `usage-reconcile.processor.ts` (nuevos) | Cola `usage-reconcile`, `upsertJobScheduler` (3 intentos, `concurrency: 1`). El procesador recorre las cuentas por páginas, concilia cada una como su dueño (`createActor(id, CLIENT)`), registra el fallo de una sin frenar el resto y, si hubo fallos, falla al final para el reintento |
| storage/domain + billing | `PlanLimits` (cambia), `plan-limits.adapter.ts` (cambia) | `PlanLimits` agrega `planName` (nombre visible del plan); el adaptador de billing lo llena con `plan.nombre`. Mismo puerto y misma lectura, sin método nuevo (ISP intacto) |
| storage/presentation | `space.controller.ts` (nuevo) | `GET /storage/summary`, `@Roles(Role.CLIENT)`; mapea a `SpaceSummaryResponse` |
| storage/presentation | `folders.controller.ts` (cambia) | Pasa `sort` y `dir` a `FolderService.contents` |
| storage | `storage.module.ts`, `storage-worker.module.ts`, `upload-lifecycle.providers.ts`, `index.ts` | Proveedores y puertos nuevos; la cola `usage-reconcile` solo se registra en el `worker`. No se exporta nada nuevo de `index.ts` |
| shared/config | esquemas de entorno, `.env.example` | `USAGE_RECONCILE_INTERVAL_MINUTES` y `USAGE_RECONCILE_BATCH_SIZE` (worker), con valores por defecto; entran a `pnpm env:check` |
| packages/contracts/storage | `space-schemas.ts` (nuevo); `folder-schemas.ts`, `schemas.ts`, `error-codes.ts`, `schema-fields.ts` (cambian) | Esquema del resumen; `sort`/`dir` en la consulta; `updatedAt`; razones `INVALID_SORT` e `INVALID_DIRECTION` con su mensaje |

- **Puertos nuevos**: `ISpaceRepository` e `IClientAccountScanner`, ambos **dentro de `storage`**. Regla b del Art. V (frontera de
  persistencia), y el segundo es el único acceso sin actor, como `IExpiredTrashScanner`. `INodeRepository` no los absorbe (ISP:
  consumidores distintos). Se amplía `IQuotaRepository` con `readUsage`: es el mismo concepto y la misma tabla. **Sin puertos entre módulos.**
- **Dependencias entre módulos**: ninguna nueva. `storage → access` (`accessibleNodes`) y `billing → storage` (`PlanLimits`) ya existen.
- **Frontend** (`apps/web`): ruta `app/(app)/(cliente)/espacio/page.tsx`. En `features/storage/`: `space-api.ts` (`GET /storage/summary`),
  `components/space-provider.tsx` (+ `useSpace()`), `space-summary-view.tsx` (pantalla), `space-breakdown.tsx` (segmentos
  de Documentos, Imágenes, Otros y Papelera con texto), `sidebar-quota.tsx` (tarjeta). `components/nimbo/quota-bar.tsx` (nuevo, §4 de
  `ui-guidelines.md`) y `app-layout.tsx` (slot `quotaCard`; el ítem «Planes y Cuota» pasa de `#planes` a «Espacio», `/espacio`).
  Cambian `routes.ts` (`SPACE_PATH`), `upload-panel.tsx` («Liberar espacio» a `SPACE_PATH`), `folders-api.ts` y
  `hooks/use-folder-contents.ts` (orden y `loadMore`), `node-table.tsx` (encabezados con `aria-sort`, columna «Modificado»
  con `updatedAt`), `my-files.tsx` (estado de orden, «Cargar más» y `maxFileLabel` desde `useSpace()`), `use-move-to-trash` y
  `use-trash-actions` (refrescan el resumen) y `(cliente)/layout.tsx` (monta `SpaceProvider`). Textos y estados según el mockup corregido.

## 3. Datos
Sin migraciones. Consultas nuevas, todas parametrizadas:
```sql
-- liveBytesByKind (bajo withActor; accessibleNodes va dentro de la consulta)
SELECT a.tipo, COALESCE(SUM(v.tamano_bytes),0)::text AS bytes
  FROM archivo a JOIN version_archivo v ON v.archivo_id = a.id
 WHERE a.id IN (SELECT nodo_id FROM (<accessibleNodes>) n WHERE n.tipo_nodo='archivo')
   AND a.propietario_id = :actorId GROUP BY a.tipo;
-- listClientIds
SELECT id FROM usuario WHERE rol = 'CLIENT' AND ($1::uuid IS NULL OR id > $1) ORDER BY id LIMIT $2;
```
- **Índices**: no se crean (D-9). El orden por defecto (`created` descendente) sigue sirviéndose con `idx_archivo_carpeta_creado`,
  `idx_archivo_raiz_creado` y sus pares de carpeta, como en 006; `created` ascendente usa los mismos índices al revés. El nombre en
  una subcarpeta sale ordenado por `uq_*_hermanos_nombre` (`lower(nombre)`). `size` y `updated` (y el nombre en la raíz) se
  ordenan en memoria con `LIMIT` (top-N). Se comprueba con la prueba de 20 000 archivos (§6).
- `down`: no aplica. La conciliación no deja datos propios; revertir el código basta.
- Bytes en `bigint` en la BD y en el dominio; en JSON como entero seguro (D-4).

## 4. Contratos
Prefijo `/api/v1`. `@Roles(Role.CLIENT)`: rol interno `403 SHARED_FORBIDDEN`, sin token `401 SHARED_UNAUTHENTICATED` (CA-17).

| Método | Ruta | Request → Respuesta | Errores (`code`) |
|---|---|---|---|
| GET | `/storage/summary` | → `200 { planName, usedBytes, reservedBytes, quotaBytes, availableBytes, maxFileBytes, trashRetentionDays, breakdown: { documentsBytes, imagesBytes, otherBytes, trashBytes } }` (enteros seguros) | `401` · `403` |
| GET | `/folders/contents?folderId&cursor&limit&sort&dir` | `sort` ∈ `name\|size\|updated\|created` (por defecto `created`), `dir` ∈ `asc\|desc` (por defecto `desc` con `created` y `asc` con los demás) → igual que 006, con `updatedAt` en cada elemento; sin `sort` ni `dir` el resultado es idéntico al de 006 | `404 STORAGE_NODE_NOT_FOUND` · `400 STORAGE_INVALID_QUERY` (`fields`: `sort` `INVALID_SORT`, `dir` `INVALID_DIRECTION`, `cursor` `INVALID_CURSOR`) |

- `limit` fuera de rango se sigue ajustando con `clampLimit` (P-9); el tamaño de página es la constante de contratos
  `FILES_PAGE_DEFAULT`/`FILES_PAGE_MAX` (50 y 100), configuración técnica y no regla de negocio (RN-6).
- No hay eventos ni Socket.IO (P-2). Cola BullMQ `usage-reconcile`: repetible cada `USAGE_RECONCILE_INTERVAL_MINUTES`
  (por defecto un día), payload `{ correlationId }`, 3 intentos con espera exponencial. Es idempotente.

## 5. Seguridad y operación
- `actor` en todos los servicios con datos de usuario. El resumen y el listado leen con `accessibleNodes(actor)` y con RLS como segunda
  barrera; el desglose agrega `propietario_id = actor.id` para que, cuando 012 amplíe `accessibleNodes` a lo compartido, un archivo
  ajeno no cuente como espacio propio. La papelera usa `ownedTrashedNodes` (solo propia).
- Conciliación sin actor: el procesador solo obtiene **ids de cuentas** (`IClientAccountScanner`, dentro de `ITransactionRunner.run`) y
  después actúa como cada dueño con `withActor(createActor(id, CLIENT))`; mide bajo RLS normal. No hay `BYPASSRLS` ni función nueva
  (`usuario` no tiene RLS, así que una función `SECURITY DEFINER` no protegería nada; D-12).
- Serialización: `lockUsage` primero, como carpetas, cargas y purga: una purga o un registro de carga en curso esperan y no se
  mide a medias. Las cargas no entran en la suma (la reserva es otra cosa, 005 RN-13).
- Bitácoras: `quota.reconciled` `{ userId, diffBytes }` y `quota.reconcile_failed` `{ userId, errorName }` (solo UUID y número; RNF-17).
  Leer el resumen o el listado no se audita (spec §5). Ningún nombre de archivo en logs.
- Operación: el `worker` registra el programa al arrancar; si está caído, lo único que se atrasa es la corrección de una deriva
  (el resumen sigue mostrando el contador que 005 aplica).

## 6. Estrategia de pruebas (por riesgo)
| CA | Nivel | Archivo |
|---|---|---|
| CA-2, CA-3 (categorías, suma, sin doble conteo) | unit | `domain/file-category.spec.ts`, `space-breakdown.spec.ts` |
| CA-1 (disponible con reservas, sin negativos) | unit | `domain/quota-policy.spec.ts` (se amplía) |
| CA-10, CA-11 (orden por grupo, carpetas con `size`) | unit | `domain/node-order.spec.ts` |
| CA-9, CA-11 (cursor de otro orden, de otro grupo o de otro tipo ⇒ `INVALID_CURSOR`; redondeo de ida y vuelta) | unit | `infrastructure/persistence/node-list-cursor.spec.ts` (se amplía) |
| CA-1, CA-6 (límites del proveedor, `maxFileBytes`) | unit | `application/space-summary.service.spec.ts` |
| CA-13, CA-14, CA-15 (diferencia, sin cambio, falla de una cuenta) | unit | `application/usage-reconciler.spec.ts`, `infrastructure/usage-reconcile.processor.spec.ts`, `usage-reconcile.scheduler.spec.ts` |
| CA-1 a CA-4, CA-6 (resumen real; carpeta anidada en la papelera se cuenta una vez; baja al purgar) | int | `test/int/storage/space-summary.int-spec.ts` |
| CA-9 a CA-11 (tres órdenes × dos direcciones paginados sin duplicados ni omisiones en el límite carpeta/archivo; `400`; `limit` ajustado; 20 000 archivos en una carpeta ≤ 2 s por orden, RNF-14) | int | `test/int/storage/folders-order.int-spec.ts` |
| CA-13 a CA-15 (deriva en los dos sentidos, carga activa intacta, cuenta fallida) contra Postgres y MinIO reales | int | `test/int/storage/usage-reconcile.int-spec.ts` |
| Contrato de rutas y códigos | unit | `presentation/storage-routes.contract.spec.ts`, `storage-error-codes.contract.spec.ts` (se amplían) |
| CA-16, CA-17 (A contra B en resumen y listado ordenado; carpeta ajena `404` idéntico; roles internos `403`; la conciliación solo ve ids) | iso | `test/isolation/storage-space.iso-spec.ts` |
| CA-4, CA-8 (refresco tras subir, eliminar, restaurar y purgar; carga y error) | web | `space-provider.spec.tsx`, `space-summary-view.spec.tsx` |
| CA-5 (tramos, textos, `role="progressbar"`, color no único) | web | `components/nimbo/quota-bar.spec.tsx`, `sidebar-quota.spec.tsx` |
| CA-7 («Liberar espacio» llega a `/espacio`) | web | `upload-panel.spec.tsx` (se amplía) |
| CA-9, CA-10, CA-12 (encabezados con `aria-sort`, «Cargar más» conserva lo visible) | web | `node-table.spec.tsx`, `file-explorer.spec.tsx`, `use-folder-contents.spec.ts` |
| RNF-13 (360 y 1440 px, axe) | web | `a11y.spec.tsx` (se amplía) |

CA-4 se prueba en el servidor (la cifra cambia tras cada operación) y en la web (el refresco se dispara); no se repite en e2e.

## 7. Riesgos y coherencia con el diseño
- **D-1 Resumen sin bloqueo**: lee contador y reservas sin `FOR UPDATE`; no frena cargas. Puede mostrar una cifra de hace milisegundos (aceptable, P-2).
- **D-2 Papelera**: segmento = `trashSummary.totalBytes` (reutiliza `TrashTotals`); no se recorre el subárbol dos veces.
- **D-3 Desglose por versiones**: suma `version_archivo.tamano_bytes` (igual que la purga y que «Liberarás {tamaño}»); con 014 las versiones viejas seguirán contando.
- **D-4 Bytes en JSON**: entero seguro (`Number(bigint)`), como `FileSummary` (005 D-13). 2 TB ≪ 2^53; si algún plan pasara de 8 PB habría que cambiar el contrato.
- **D-5 Disponible** = cuota − usado − reservado (`QuotaPolicy.available`), para que no se ofrezca espacio que 005 rechazaría. La reserva se expone como `reservedBytes` (decisión c): la fila «Cargas en curso» del resumen aparece solo si es > 0, y con ella Documentos + Imágenes + Otros + Papelera + Cargas en curso + Disponible = cuota. El porcentaje y los tramos siguen calculándose sobre lo usado.
- **D-6 Orden por defecto** (corrección de Adrián, 2026-10-01): el de 006, `created` descendente (`creado_en DESC, id DESC`) con las carpetas primero. Se revierte P-5/RN-6. `sort` ausente = `created`; `dir` ausente = `desc` con `created` y `asc` con los demás. Las pruebas de listado de 006 no cambian. `created` es un valor más de `sort` para poder volver a elegirlo desde el control.
- **D-7 Carpetas según `sort`**: con `name`, `created` y `updated` usan su propia columna (`lower(nombre)`, `creado_en`, `actualizado_en`); con `size` (no tienen) se ordenan por nombre ascendente sin importar `dir`. Los archivos usan `archivo.tamano_bytes` con `size`; todos desempatan por `id`.
- **D-8 Cursor** `[sort, dir, grupo, valor, id]`, validado contra el orden pedido (incluido `created`); un cursor de 006 (3 elementos) responde `400`. La web de 006 solo usa la primera página, así que no rompe nada.
- **D-9 Sin índices nuevos**: el orden por defecto ya tiene los de 006. Para `name` (raíz), `size` y `updated`, diez índices parciales (× raíz y carpeta × archivo y carpeta) costarían escrituras a cambio de un ordenamiento que, con `LIMIT`, es top-N sobre una sola carpeta. Se reevalúa si la prueba de 20 000 supera el presupuesto o si aparecen carpetas de decenas de miles (fila nueva en `pendientes.md`).
- **D-10 `limit`**: sigue ajustándose (P-9).
- **D-11 Fórmula de conciliación**: `SpaceMeasurer.measure` = versiones de archivos vivos propios + raíces de la papelera propias = versiones de todos los archivos no purgados, sin cargas, bajo `lockUsage`, una transacción por cuenta. Equivale al `SUM` pedido por Adrián sin salirse de `accessibleNodes`/`ownedTrashedNodes`.
- **D-12 Listar cuentas**: `SELECT` simple por páginas de `id`. Se descarta la función `SECURITY DEFINER` de ADR-0021 porque `usuario` no tiene RLS y no hay nada que proteger; extiende la excepción DF-59 (hoy solo `espacio_usado`) a `usuario.id` y `rol` en un único adaptador de solo lectura, no exportado.
- **D-13 Cola `usage-reconcile`** con `upsertJobScheduler`, como `upload-cleanup` y `trash-purge`: es la tercera copia del patrón; se anota para extraerlo en el 20 % de refactor, no ahora (YAGNI).
- **D-14 Evento técnico** por Pino, no `IAuditLogger`: es una corrección del sistema que no es una acción visible al cliente (CA-13).
- **D-15 Sin caché de límites** (PD-58): una lectura por resumen, que `SpaceProvider` comparte en toda la pantalla. Se reabre si el listado empieza a pedirlos.
- **D-16 Refresco web**: `SpaceProvider` expone `refresh()`; lo disparan completar una carga (efecto sobre `uploadedFiles.length`, sin tocar `UploadManager`), mover a la papelera, restaurar, eliminar definitivamente y vaciar (al releer el resumen de la papelera).
- **D-17 `QuotaBar`**: `role="progressbar"` con `aria-valuenow/min/max`, porcentaje y GB siempre en texto; tramos y textos de `ui-guidelines.md` §4 (RN-4); estado por ícono y etiqueta además del token. Sin colores escritos a mano.
- **D-18 Rutas**: `/espacio`; el ítem de navegación se llama «Espacio» hasta que 008 entregue los planes (decisión e) y, junto con «Liberar espacio», apunta ahí; `#planes` desaparece; «Ver planes» sigue oculto.
- **D-20 Nombre del plan** (cambio de Adrián, 2026-10-01): «Tu plan» necesita el nombre; `SpaceSummaryResponse.planName` sale de `PlanLimits.planName`, que el adaptador de billing ya tiene en la fila leída. No se agrega puerto ni consulta.
- **D-19 Decisiones de UI aceptadas** (mockup `resumen-espacio`): (a) `QuotaBar` suma un borde con el token `input` al fondo de la barra para llegar a ≥ 3:1; (b) al 100 % el título es «Espacio agotado.» (spec RN-4 y fila de `QuotaBar` en `ui-guidelines.md` §4); (c) fila «Cargas en curso» solo si `reservedBytes` > 0 (D-5); (d) bajo el 70 % la tarjeta de la barra lateral muestra «Ver detalle» hacia `/espacio`; (e) ítem «Espacio» (D-18); (f) paginación con «Cargar más» que acumula; (g) cuentas listadas con un `SELECT` simple, registrado en DF-62 (D-12).
- **Punto abierto no bloqueante**: el mockup manda «Liberar espacio» del resumen a Mis archivos ordenado por tamaño (`?orden=tamano&dir=desc`, README, pendiente 1). Adrián no lo incluyó entre las decisiones aceptadas; mientras tanto el control de orden vive en el estado del componente y «Liberar espacio» del resumen lleva a `/archivos`. Si se acepta, la línea web lee `orden` y `dir` de la URL (cambio solo de `web`).
- R-1 `lower(...)` en `orderBy` con `limit` de TypeORM puede fallar al armar la consulta: el repositorio lo escribe con `addSelect` o SQL parametrizado y la prueba de integración lo cubre.
- R-2 Carpetas enormes sin índice de orden: mitigado por top-N, la prueba de 20 000 y el umbral de D-9.
- R-3 La deriva visible: entre un fallo y la conciliación, `usedBytes` (contador) puede diferir de la suma del desglose; la barra usa el contador y el desglose no promete sumar igual hasta el siguiente ciclo.
- R-4 Dependencia del mockup: `resumen-espacio` ya está corregido (decisiones de D-19); queda el menú de orden con el valor por defecto de D-6. El PR `api` no depende de ello.
- R-5 Compartición (012): `accessibleNodes` incluirá archivos ajenos; por eso el filtro `propietario_id` explícito (sección 5) y una prueba que lo cubre cuando 012 llegue.
- **Desviaciones**: **DF-62** por registrar en `design-findings.md`: `SpaceSummaryService`, `SpaceMeasurer` y `UsageReconciler` en M2 (el diagrama solo tiene `QuotaService`); puertos internos `ISpaceRepository` e `IClientAccountScanner`; ruta `GET /storage/summary`; cola `usage-reconcile`; `updatedAt` en los resúmenes; extensión de la excepción de DF-59.
- **Documentación por actualizar**: `design-model.md` (M2), `architecture.md` §8 (cola) y §6.6 (el escaneo de cuentas), `features/storage/README.md` y `modules/storage/README.md`, `006/spec.md` §7 (qué pasó con filtros, cuadrícula y selección múltiple), `ui-guidelines.md` §7 (fila de `resumen-espacio`), PD-34 (Recientes y Favoritos siguen sin RF: 007 no los incluye) y PD-58 (resuelto: sin caché).
- Pendientes que deja fuera: umbral para índices de orden y extracción del helper de schedulers (filas nuevas en `pendientes.md`).
- ADR requeridos: ninguno. No hay tecnología nueva ni cambio de arquitectura.
- Entrega: dos ramas desde `spec/007-cuota-y-explorador` y dos PR (`workflow.md` §6): **PR-A** `feat/007-cuota-y-explorador-api` (`api` + `contracts` + `worker`) y **PR-B** `feat/007-cuota-y-explorador-web` (`web`), implementadas en paralelo por dos sesiones. La línea web toma los contratos de PR-A (T-01) mergeando esa rama. El único mockup pendiente es el menú de orden con el valor por defecto «Fecha de creación, más recientes primero» (`_generadores/explorador/generar-orden.js`).

## 8. Aprobación
- `architect`: no aplica (sin puerto entre módulos, sin tecnología nueva, sin cambio de arquitectura). Se le pide revisar DF-62 al redibujar (PD-46).
- Adrián: aprobado el 2026-10-01 (con la corrección del orden por defecto, D-6, y las decisiones de UI de D-19).
