# Plan 014b — Original optimizado y cuota

> Spec: `./spec.md` · Estado del plan: Aprobado (Adrián, 2026-10-25)
> Obligatorio y ≤ 250 líneas. Dice **qué** archivos se tocan y **qué** se espera de cada uno; no es el código en
> prosa (sin cuerpos de funciones ni pseudocódigo). Lo aprueba Adrián antes de escribir código.

## 1. Resumen técnico

Todo vive en `storage` (M2) y reutiliza lo que ya existe: la única escritura de versiones (`FileVersionService.register`),
la poda (`VersionPruner`), la conciliación diaria de 007 (`UsageReconcileProcessor`, que ya recorre cada cuenta como su
dueño) y el fragmento de bytes que comparten papelera, medidor y conciliación (`FILE_BYTES_SQL`). **Sin clases, puertos,
colas ni funciones `SECURITY DEFINER` nuevas.**

- **Marca:** columna nueva `version_archivo.conservada_hasta` (nula = cuenta en el espacio). Una versión con fecha es un
  «original conservado»: no cuenta y vence en esa fecha.
- **Registro (CA-1 a CA-3):** `RegisterVersionCommand` suma `keepPreviousForDays`, obligatorio si y solo si la versión que
  se construye es `optimizacion` (lo valida el dominio). Dentro de la misma transacción y bajo el mismo `lockUsage`,
  `register` lee la versión actual, la convierte en original conservado (fecha = `createdAt` de la optimizada + días),
  guarda la fecha y aplica **un solo** `addUsedBytes(optimizada − original)`, que es negativo (RN-2). `register` no valida
  cuota (nunca lo hizo: lo hace cada llamador), así que con la cuenta llena el registro pasa (CA-2). Los días los lee el
  llamador de `PlanLimits.trashRetentionDays` fuera de la transacción (en 014b, la prueba que hace de doble; en 021, su
  registrador).
- **Conteo coherente (CA-9, CA-10, RN-7):** un predicado SQL único, «versión que cuenta» (`conservada_hasta IS NULL`),
  entra en los tres lugares que suman versiones: `FILE_BYTES_SQL` (medidor, papelera, conciliación), `FOLDER_BYTES_SQL` y la
  suma de `purgeTargets` (lo que resta la purga). La purga sigue borrando **todos** los objetos del archivo.
- **Poda (CA-8):** `VersionPruner.deleteVersion` resta bytes solo si la versión cuenta. El original ocupa un lugar de las
  retenidas, así que `VersionRetention` no cambia (RN-5).
- **Vencimiento (CA-6, CA-7, CA-9):** `VersionPruner.purgeExpiredOriginals(actor, now)` lista los originales vencidos de
  archivos **vivos** del actor y los borra uno por transacción con el mismo `pruneOne` (reintento implícito, auditoría
  `file.version_pruned`). Lo llama `UsageReconcileProcessor` por cada cuenta **antes** de conciliar. Un archivo en la
  papelera no es accesible, así que su original no se purga por plazo hasta que vuelva (o cae con la purga del archivo).
- **Historial (CA-4):** `FileVersionSummary.keptUntil: string | null`. Sin cambios en la web (spec §6).

## 2. Módulos, archivos y diseño

Doce archivos de producción (el tope de `workflow.md` §4.1).

| Módulo / capa | Archivo (nuevo o cambiado) | Responsabilidad |
|---|---|---|
| migración | `apps/api/src/migrations/20261025100000-conservar-original-optimizado.ts` (nuevo) | Columna `conservada_hasta`, `CHECK` e índice parcial (§3); `down` reversible |
| storage/domain | `file-version.ts` (cambia) | `keptUntil: Date \| null` en el snapshot; `countsInQuota`; `conserveAsOriginal(optimized, retentionDays)` devuelve el original con su fecha y rechaza (`TypeError`, como los demás invariantes) si `optimized` no es `optimizacion`, no es estrictamente menor (RN-2), no es del mismo archivo o el original ya estaba conservado; `retentionDays` entero ≥ 1 |
| storage/application | `file-version.service.ts` (cambia) | `RegisterVersionCommand.keepPreviousForDays?`; con él, lee la actual con `IVersionRepository.find`, llama `conserveAsOriginal`, `markKept` y un `addUsedBytes` neto; sin él y con origen `optimizacion`, rechaza. Bitácora `version.registered` suma `keptVersionId` |
| storage/application | `version-pruner.ts` (cambia) | `deleteVersion` resta solo si `countsInQuota` (CA-8, RN-7); `purgeExpiredOriginals(actor, now)`: `listExpiredKept` dentro de `withActor` y `pruneOne` por cada uno; nunca lanza (como `prune`). Bitácora `version.pruned` suma `reason: 'retention' \| 'kept_expired'` |
| storage/application/ports | `i-version.repository.port.ts` (cambia) | `markKept(actor, version)` (guarda `keptUntil` de la versión ya conservada) y `listExpiredKept(actor, now)` (originales vencidos de archivos vivos del actor, nunca la actual) |
| storage/infrastructure | `persistence/version-archivo.orm-entity.ts` (cambia) | Columna `conservadaHasta: Date \| null` |
| storage/infrastructure | `persistence/typeorm-version.repository.ts` (cambia) | Mapeo de la columna en `toVersionRow`/`toFileVersion`; `markKept` = `UPDATE … SET conservada_hasta` del par (versión, archivo) **solo si estaba nula**; `listExpiredKept` con `nodesIn(accessibleNodes(actor), 'v.archivo_id', 'archivo')`, `a.propietario_id = actor.id` y `v.id <> a.version_actual_id` |
| storage/infrastructure | `persistence/node-sql.ts` (cambia) | Constante `COUNTED_VERSION_SQL` (predicado «cuenta en el espacio») y `FILE_BYTES_SQL` filtrado con ella |
| storage/infrastructure | `persistence/typeorm-trash.repository.ts` (cambia) | `FOLDER_BYTES_SQL` y la suma de `purgeTargets` usan `COUNTED_VERSION_SQL`; `claves` sigue con todas las versiones |
| storage/infrastructure | `usage-reconcile.processor.ts` (cambia) | Por cuenta: `VersionPruner.purgeExpiredOriginals(owner, clock.now())` y después `UsageReconciler.reconcile(owner)`; inyecta `I_CLOCK`. Bitácora `quota.reconcile_run` suma `keptPurged` |
| storage/application | `file-version-summary.ts` (cambia) | `keptUntil` en ISO o `null` |
| contracts | `packages/contracts/src/storage/version-schemas.ts` (cambia) | `keptUntil: timestamp.nullable()` en `fileVersionSummarySchema`, con su comentario: no nulo ⇒ original conservado que no cuenta en el espacio |

- **Puertos nuevos:** ninguno. `IVersionRepository` gana dos métodos del mismo consumidor (`storage`) y la misma tabla
  (ISP intacto). No hay interfaz nueva: la conservación es una regla del dominio de `FileVersion` (Art. V.2).
- **Por qué en `register` y no en un registrador aparte:** el ciclo de vida de versiones tiene un solo dueño (DF-17,
  Art. VI.3) y la resta del original debe ir en la misma transacción y bajo el mismo `lockUsage` que la suma de la
  optimizada. El campo nuevo del comando tiene consumidor real (las pruebas de 014b y el registrador de 021); no es un
  parámetro «por si acaso». `register` sigue sin conocer a 021: solo sabe que una versión `optimizacion` conserva la
  anterior.
- **Por qué en la conciliación y no en `trash-purge`:** el procesador de 007 ya actúa como cada dueño bajo RLS (sin la
  función `SECURITY DEFINER` y el escáner que haría falta en `trash-purge`) y su intervalo diario encaja con plazos en días.
  Ahorra una migración de función, un puerto y un adaptador. Se acepta el retraso de hasta un intervalo (spec S-2).
- **Dependencias nuevas entre módulos:** ninguna. `storage/index.ts` no exporta nada nuevo: la fachada para 021 la decide
  su plan (spec §7). `audit` no cambia: se reutiliza `file.version_pruned` con sus atributos (spec S-4).
- **Frontend:** sin cambios (spec §6). Los *fixtures* de pruebas web que construyen `FileVersionSummary` suman
  `keptUntil: null` (archivos de prueba, no de producción).

## 3. Datos

```sql
-- Migración 20261025100000-conservar-original-optimizado (reversible)
ALTER TABLE version_archivo ADD COLUMN conservada_hasta timestamptz;            -- nula = cuenta en espacio_usado
ALTER TABLE version_archivo ADD CONSTRAINT ck_version_conservada_hasta
  CHECK (conservada_hasta IS NULL OR conservada_hasta > creada_en);
CREATE INDEX idx_version_archivo_conservada ON version_archivo (conservada_hasta)
  WHERE conservada_hasta IS NOT NULL;                                           -- solo originales: índice diminuto
```

- **Sin respaldo de datos:** hoy no existe ninguna versión `optimizacion`, así que toda fila queda nula (cuenta), que es
  lo correcto.
- **RLS y permisos:** sin cambios. La columna hereda `version_archivo_cliente` (`FOR ALL`, solo `CLIENT` sobre archivos
  propios); el `UPDATE` de `nimbo_app` viene de los `ALTER DEFAULT PRIVILEGES` de 003. Los roles internos siguen sin filas.
- **Índice:** sirve a `listExpiredKept` (`conservada_hasta <= now`); el filtro por archivo usa `idx_version_archivo_archivo`.
- `down`: `DROP INDEX idx_version_archivo_conservada`, `DROP CONSTRAINT ck_version_conservada_hasta`,
  `DROP COLUMN conservada_hasta`. Si quedaban originales conservados, vuelven a contar y la conciliación siguiente corrige
  `espacio_usado` (007 CA-13); la prueba de reversión de migraciones lo cubre (RNF-10).
- Bytes: `version_archivo.tamano_bytes` y `usuario.espacio_usado` siguen en `bigint`; la resta neta es `bigint`.

## 4. Contratos

| Método | Ruta | Rol | Request → Respuesta | Errores (`code`) |
|---|---|---|---|---|
| GET | `/files/:fileId/versions` (existente, 014) | CLIENT | Cada `FileVersionSummary` suma `keptUntil: string \| null` (ISO). No nulo = original conservado, no cuenta en el espacio y se purga en esa fecha | los de 014 (`404` `STORAGE_NODE_NOT_FOUND`) |
| POST | `/files/:fileId/versions/:versionId/restore` (existente) | CLIENT | Sin cambios; con un original conservado aplica 014 CA-9 y CA-12 | los de 014 (`422` `STORAGE_QUOTA_EXCEEDED`, …) |
| GET | `/storage/summary` (existente, 007) | CLIENT | Sin cambio de forma; `usedBytes` y `breakdown` ya no incluyen originales conservados | los de 007 |
| GET | `/trash` y `/trash/summary` (existentes, 006) | CLIENT | Sin cambio de forma; el tamaño de cada elemento y el total son lo que liberaría su purga (sin originales conservados) | los de 006 |

- Sin rutas, códigos de error ni eventos nuevos. Roles internos `403` `SHARED_FORBIDDEN`; sin token, `401` (014 CA-18).
- El rechazo de CA-3 es un invariante de dominio (`TypeError` → 500 y transacción revertida): ninguna ruta de 014b lo
  dispara; 021 debe descartar antes la optimización que no ahorra (RF-35) y compensar el objeto subido.
- `storage.file-version-created` (019) se emite igual tras el commit de la optimizada (`afterCommit`), sin cambios.

## 5. Seguridad y operación

- **`actor` y aislamiento:** `register` corre en el `withActor` del llamador; `listExpiredKept` filtra con
  `accessibleNodes(actor)` **y** `propietario_id = actor.id` dentro de la consulta (RLS como segunda barrera); `markKept`
  exige el par (versión, archivo) bajo `requireActorScope`. La pasada de mantenimiento obtiene solo UUID de cuentas
  (`IClientAccountScanner`, 007) y actúa como cada dueño: no hay lectura global ni `BYPASSRLS` (CA-11).
- **Concurrencia:** todo cambio de `espacio_usado` sigue bajo `lockUsage`; la conservación va en la misma transacción que
  el registro; cada purga de original, en su propia transacción (como la poda). `markKept` solo escribe si la fecha
  estaba nula: un reintento no alarga el plazo.
- **Auditoría (`IAuditLogger`, mejor esfuerzo como 014):** purga del original = `file.version_pruned`
  `{ versionId, versionNumber, sizeBytes }`, `resourceId` = UUID del archivo (CA-13). Nunca nombres, claves, URLs.
- **Bitácoras técnicas (Pino):** `version.registered` (+ `keptVersionId`), `version.pruned` (+ `reason`),
  `version.prune_failed` (solo `fileId`, `versionId`, `errorName`), `quota.reconcile_run` (+ `keptPurged`). Métricas: 022.
- **Degradación:** si el `worker` está caído, el original vive más de su plazo sin ocupar espacio; nada se bloquea.

## 6. Estrategia de pruebas (por riesgo)

| CA | Nivel | Archivo |
|---|---|---|
| CA-1, CA-3 (fecha = creación + días; rechazo si no es menor, de otro archivo, ya conservado o sin días) | unit | `domain/file-version.spec.ts` (nuevo) |
| CA-1, CA-2, CA-3 (lee la actual, `markKept`, un solo `addUsedBytes` neto; otros orígenes sin cambio; `optimizacion` sin días rechaza) | unit | `application/file-version.service.spec.ts` (se amplía; doble del origen `optimizacion`) |
| CA-6, CA-7, CA-8 (no resta si no cuenta; vencidos uno por transacción; fallo de objeto deja la fila) | unit | `application/version-pruner.spec.ts` (se amplía) |
| CA-6 (purga antes de conciliar, por cuenta; un fallo no frena las demás) | unit | `infrastructure/usage-reconcile.processor.spec.ts` (se amplía) |
| CA-1, CA-2, CA-4, CA-5, CA-8 | int (Postgres + MinIO reales) | `test/int/storage/versions-optimization.int-spec.ts` (nuevo): el doble sube un objeto menor y llama `register` con los días de `PlanLimits`; cuenta llena; historial con `keptUntil`; restaurar el original con y sin cuota; poda con plan Personal = 3 |
| CA-6, CA-7, CA-9, CA-10, CA-13 | int | `test/int/storage/usage-reconcile.int-spec.ts` (se amplía): reloj adelantado, original vencido purgado sin cambiar `espacio_usado`, archivo en papelera intacto hasta restaurarse, conciliación sin deriva, `/storage/summary` y `/trash` sin originales, purga del archivo resta solo lo que cuenta, auditoría y bitácoras sin nombres ni claves |
| Migración y `down` | int | `test/int/storage/migrations.int-spec.ts`, `orm-entities.int-spec.ts` (se amplían) |
| CA-11, CA-12 | iso (bloqueante) | `test/isolation/storage-versions.iso-spec.ts` (se amplía): A y B con originales vencidos; la pasada de A deja intacto el de B; B pide el historial de A ⇒ `404` idéntico; roles internos `403` |
| Contrato | unit | `packages/contracts/src/storage/version-schemas.spec.ts` (se amplía: `keptUntil` nulo y fecha) |
| Recorrido de la demo | humana | con la prueba de integración y la API en local: historial con `keptUntil`, medidor que baja |

Sin repetir un CA en tres capas: reglas en unitarias, el comportamiento real con MinIO y Postgres en dos integraciones, el
aislamiento solo en `test/isolation`.

## 7. Riesgos y coherencia con el diseño

- **Divergencia contador ↔ conciliación:** el riesgo central. Se mitiga con un solo predicado (`COUNTED_VERSION_SQL`) en
  los tres lugares que suman versiones y con la prueba de conciliación sin deriva (CA-10). Cualquier suma nueva de
  versiones debe usarlo (nota en `node-sql.ts`).
- **Doble resta:** una purga o poda de un original restaría bytes que ya no cuentan. Lo impiden `countsInQuota` en la poda y
  el predicado en `purgeTargets` (RN-7); las dos tienen prueba.
- **Optimización sobre una versión que cambió:** si durante el trabajo de 021 llega otra versión, `register` conservaría
  la actual (no la que se optimizó). Lo evita el registrador de 021 comparando, bajo `lockUsage`, la versión de origen con
  la actual (spec §7). Se anota para su plan.
- **Retención del plan más baja que el trabajo:** con Personal (7 días) nada cambia: el plazo corre desde el registro.
- **`register` crece:** suma una rama acotada (conservar o no). Si una tercera regla por origen apareciera, se extrae una
  política por origen (Art. VI.2); hoy no.
- **Desviaciones de los diagramas:** E-R `version_archivo.conservada_hasta` y la regla de cuota → se registran en la
  propuesta de **DF-21** (sigue `Abierto` hasta que Adrián apruebe y ADR-0013 pase a `Aceptado`). DF-38 decía «021 lo
  ajustará»: al integrar se corrige a «014b». `architecture.md` §7.6 («retención definida en DF-21») y §8
  (`usage-reconcile` también purga originales vencidos) se actualizan en el PR.
- **Pendientes (`pendientes.md`, en el PR de 014b):** sumar a PD-46 el E-R `conservada_hasta`; fila nueva para 021:
  fachada de registro de la versión optimizada (con la comprobación de origen) y la marca «Original conservado hasta
  {fecha}» en la ficha con su estado en el mockup `ficha-archivo`.
- **ADR requeridos:** ADR-0013 (Política del original en el optimizador), redactado como `Propuesto` (`docs/adr/0013-politica-del-original-en-el-optimizador.md`); pasa a `Aceptado` con la aprobación de Adrián. Sin
  tecnología nueva.

## 8. Aprobación

- `architect`: no aplica. Sin puerto nuevo entre módulos, sin tecnología nueva ni cambio de arquitectura (amplía un
  puerto interno y reutiliza la cola `usage-reconcile`).
- Adrián: aprobado el 2026-10-25 (pidió comenzar la implementación).
