# Plan 021 — Optimizador de imágenes

> Spec: `./spec.md` · Estado del plan: Aprobado (Adrián, 2026-10-26); enmienda de alcance del 2026-10-26 pendiente de su aprobación (§9)
> Obligatorio y ≤ 250 líneas. Dice **qué** archivos se tocan y **qué** se espera de cada uno; no es el código en
> prosa (sin cuerpos de funciones ni pseudocódigo). Lo aprueba Adrián antes de escribir código.

## 1. Resumen técnico

Módulo nuevo `optimizer` (M7) en el `api` y en el `worker`, más una fachada en `storage`. Sigue los patrones de 019
(estado de negocio en una tabla propia, BullMQ solo ejecuta, procesador con concurrencia 1) y de 016 (registrador de
versión con resultados explícitos y compensación del objeto).

- **Estimar (CA-1 a CA-5):** `POST …/estimate` valida propietario, tipo real y tamaño, crea una fila `optimizacion` en
  `estimando` y encola. El `worker` lee las dimensiones, rechaza el PNG animado y lo que supere los límites
  (`no_disponible`), recomprime en memoria **sin guardar nada** y deja `estimada` o `no_conviene` con los bytes estimados.
- **Optimizar (CA-6 a CA-14):** `POST …/run` (no en solo lectura) pasa la fila a `optimizando` y fija el id de la versión
  resultante. El `worker` vuelve a recomprimir (determinista con los mismos parámetros), valida la integridad, vuelve a
  aplicar el umbral con el resultado **real** y, si conviene, lo registra por la fachada de `storage`, que lo sube y,
  bajo `lockUsage`, comprueba que la versión de origen sigue siendo la actual antes de `register` (014b hace el resto:
  original conservado y espacio neto negativo).
- **Estado (CA-6, RN-9, RN-10):** `GET …/optimization` devuelve la última fila con `pollAfterMs` mientras no es final; la
  ficha consulta con ese intervalo, se detiene al llegar a un estado final y relee al abrir o al volver a estar visible.
- **Imágenes:** solo JPEG y PNG (recorte del 2026-10-26); `sharp` (ADR-0035, `Aceptado` el 2026-10-26 con este plan).

**Lo que no hace 021 (va a 021b):** DF-80 (`ICommandRunner` a `shared`: `sharp` corre en proceso, no lanza programas) y
el oyente de versiones en el `worker` de 019 §7.7 (las imágenes no se indexan: `ExtractorRegistry` no soporta `imagen`,
así que el evento que emite el registro no programa nada). Los dos tienen consumidor real recién con el PDF.

## 2. Módulos, archivos y diseño

**A = con lógica · B = contratos internos, cableado, barriles y configuración.** Dueño: Abel salvo lo marcado.

| Módulo / capa | Archivo (nuevo o cambiado) | | Responsabilidad |
|---|---|---|---|
| storage/application | `optimizable-file.gateway.ts` (nuevo) | A | **PD-130:** `findOwnedImage(actor, fileId)` → `{ id, ownerId, kind, mime, extension, sizeBytes, currentVersionId }` o `null` (propio, vivo; tipo y MIME **reales** con `IFileTypeDetector`, CA-4; solo `image/jpeg` e `image/png`, el resto lo rechaza el servicio con `UnsupportedTypeError`); `openCurrent(actor, ref)`, que **lee la versión vigente por su cuenta, como `EditableFileGateway` e `IndexableFileGateway`** (PD-124 queda fuera: el lector común lo extrae quien integre 017); `registerOptimizedVersion(actor, input)` |
| storage/application | `optimized-version.registrar.ts` (nuevo) | A | **PD-130**, como `EditedVersionRegistrar`: lee `trashRetentionDays` fuera de la transacción; sube el objeto con la clave del id preasignado; comprueba que la firma real coincide con el tipo del archivo; bajo `lockUsage` revalida y responde `registered`, `duplicate`, `file_changed` (la vigente ya no es la de origen), `not_smaller`, `file_missing` (ajeno, papelera o purgado) o `corrupt`. **Nunca llama a `register` con un resultado no menor**, así que el `TypeError` de 014b no se alcanza. Compensa (borra el objeto) en todo lo que no sea `registered` ni `duplicate` y si la transacción falla. `afterCommit` anuncia y poda (014) |
| storage | `upload-lifecycle.providers.ts`, `storage.module.ts`, `storage-worker.module.ts`, `index.ts` (cambian) | B | Proveedores y exportación de la fachada en el `api` y el `worker`; **PD-121:** exportar `WritableAccountPolicy` y `AccountReadOnlyError` |
| optimizer/domain | `optimization-job.ts` (nuevo) | A | `OptimizationJob` (nombre del diagrama): estados, motivos y transiciones de §3; `isStale(now)` |
| optimizer/domain | `savings-estimate.ts` (nuevo) | A | `SavingsEstimate.isWorthIt({ minBytes, minPercent })`: **las dos** condiciones (RN-2); el no menor nunca conviene |
| optimizer/domain | `errors/index.ts` (nuevo) | A | `UnsupportedTypeError` (`422` `OPTIMIZER_UNSUPPORTED_TYPE`, también para GIF y WebP), `EstimateStaleError` (`409` `OPTIMIZER_ESTIMATE_STALE`); el `404` reutiliza `NodeNotFoundError` de `storage` |
| optimizer/application | `optimization.service.ts` (nuevo) | A | `OptimizationService` del `api`: estimar, ejecutar y estado, con límite de tasa, solo lectura (`WritableAccountPolicy`) y caducidad perezosa; `OPTIMIZER_CONFIG` |
| optimizer/application | `optimization-runner.ts` (nuevo) | A | Flujo del `worker` para `estimate` y `run`: reclamar, leer, inspeccionar, recomprimir, validar, umbral, registrar y mapear el resultado; auditoría y bitácoras |
| optimizer/application/ports | `i-job.repository.port.ts`, `i-job-queue.port.ts`, `i-optimizer.port.ts`, `i-integrity-validator.port.ts` (nuevos) | B | `IJobRepository`, `IJobQueue`, `IOptimizer` (`inspect`, `optimize`) e `IIntegrityValidator` del diagrama. `IOptimizer` aísla una tecnología externa (regla (a) de Art. V.2); sin `BaseOptimizer` hasta que 021b traiga el segundo (DF-81) |
| optimizer/infrastructure | `image/image.optimizer.ts` (nuevo) | A | `ImageOptimizer` con `sharp`: `inspect` (formato, ancho y alto, orientación, perfil, alfa, PNG animado) y píxeles decodificados = ancho × alto (RN-8); `optimize` en el mismo formato (§6). `sharp` **descarta los metadatos por defecto**: se llama a `keepIccProfile()` siempre y a `keepExif()` solo si la entrada trae EXIF (verificado en el spike, ADR-0035; `withMetadata()` no sirve porque cambia un perfil no sRGB por sRGB), **sin rotar** los píxeles; el resto de EXIF no se promete. Un PNG con el fragmento `acTL` (animado) se reporta como tal y termina en `no_disponible(animada)`; que `sharp` solo lea su primer cuadro se confirma en T-03. Tiempo límite y `limitInputPixels` |
| optimizer/infrastructure | `image/image-integrity.validator.ts` (nuevo) | A | `ImageIntegrityValidator` (CA-8): decodifica el resultado; mismo formato (firma), dimensiones, orientación, perfil (si existía) y alfa; en PNG, mismo hash SHA-256 de los píxeles crudos (por flujo, sin dos imágenes en memoria) |
| optimizer/infrastructure | `persistence/optimizacion.orm-entity.ts`, `persistence/typeorm-job.repository.ts` (nuevos) | A | Tabla de §3; transiciones con compare-and-set; última fila por archivo; caducidad |
| optimizer/infrastructure | `bullmq-job.queue.ts`, `optimization.processor.ts` (nuevos) | A | Cola `optimization` (`estimate`, `run`); `jobId` `estimate-<id>` / `run-<id>`; `attempts` de `OPTIMIZER_MAX_ATTEMPTS`, espera exponencial, `removeOnComplete/Fail`; procesador con concurrencia 1 y `correlationId` (como `IndexingProcessor`); `failed` agotado → `fallida(servicio_no_disponible)` |
| optimizer/presentation | `optimizer.controller.ts` (nuevo) | A | `OptimizerController` con `@Roles(Role.CLIENT)`: rutas de §4; valida con zod de `contracts` |
| optimizer | `optimizer.module.ts`, `optimizer-worker.module.ts` (nuevos), `index.ts` (cambia) | B | Módulos del `api` y del `worker` (reciben **la misma** instancia de `StorageModule`, como 019) y API pública. `ImageOptimizer`, `ImageIntegrityValidator` y el procesador solo se registran en `OptimizerWorkerModule`: el `api` nunca carga `sharp` (ADR-0035) |
| audit/application | `audit-action.ts`, `audit-catalog.ts` (cambian; Adrián) | B | `file.optimized`, `file.optimization_discarded`, `file.optimization_failed` y su lista blanca (§5) |
| packages/config | `eslint/boundaries.js` (cambia; Adrián) | B | `optimizer: ['storage', 'access', 'audit']` (autorizado; `architecture.md` §3 en el mismo PR) |
| migración | `apps/api/src/migrations/2026…-crear-optimizacion.ts` (nuevo) | A | §3, con `down` |
| raíz | `app.module.ts`, `worker.module.ts`, `shared/infrastructure/config/env.schema.ts` (cambian; Adrián) | B | `OptimizerModule` en el `api`; `OptimizerWorkerModule` y `'optimization'` en `WORKER_QUEUES`; variables de §6 (`.env.example` y `ambientes.md` en el mismo cambio, `pnpm env:check`) |
| contracts | `src/optimizer/schemas.ts` (nuevo) | A | Estados, motivos, `optimizationStatusSchema` (con `refine` motivo ↔ estado), `runOptimizationBodySchema` |
| contracts | `src/optimizer/error-codes.ts`, `src/optimizer/index.ts` (nuevos), `src/index.ts` (cambia) | B | `OPTIMIZER_ERROR_CODES` y barriles |
| dependencias | `apps/api/package.json` (cambia) | B | `sharp` **solo tras ADR-0035 `Aceptado`**; si pnpm 10 lo pide, `onlyBuiltDependencies` en el `package.json` raíz |
| web/features/optimizer | `optimizer-api.ts`, `hooks/use-file-optimization.ts`, `components/optimization-card.tsx`, `components/confirm-optimization-dialog.tsx`, `optimizer-messages.ts` (nuevos) | A | Cliente; consulta periódica (§5); tarjeta con los 8 estados de spec §6 (el estado final reúne completada y error, y «no disponible» tiene un solo mensaje); diálogo con el aviso de poda (reutiliza el cálculo de `features/storage/version-history.ts`) y la fecha de conservación; mensajes de la spec |
| web | `features/storage/components/file-detail-view.tsx` (cambia) | A | Muestra la tarjeta solo si el archivo es `imagen` y del actor; recarga el historial al completar |
| web | `features/storage/components/session-file-detail-view.tsx` (cambia) | B | Crea el cliente de `optimizer` con la sesión |
| web | `components/nimbo/version-timeline.tsx` (cambia) | A | «Original conservado hasta {fecha} · no ocupa tu espacio» cuando `keptUntil` no es nulo (014b CA-4, PD-130) |

- **Recuento (ADR-0034):** **45** archivos de producción (**23 A** y **22 B**; +1 si pnpm exige `onlyBuiltDependencies`).
  Por dueño: Abel 32 (`optimizer`, `contracts`, `web`, migración), `storage` 6 (PD-130 y PD-121), `audit` y
  `boundaries.js` 3, raíz y `shared` 3, `package.json` 1. Pruebas: unos 13 archivos (§7). Documentos: `architecture.md`
  §3, §7.6 y §8, `design-model.md` (M7), `ambientes.md`, los README de `storage` y `optimizer`. Mockup existente: 8 de sus 14 estados.
- **Nota de decisión:** la partición por formato (021 imágenes, 021b PDF) la indicó Adrián (2026-10-25). No se parte por
  capas: estimar y optimizar son un solo entregable vertical (sin la ejecución no hay valor, y sin la estimación RF-35 no
  se cumple). El recuento supera 12 y se deja explícito en §8.
- **Puertos y dependencias entre módulos:** `optimizer → storage` (fachada, solo por `storage/index.ts`),
  `optimizer → audit` (nueva, autorizada) y `optimizer → shared`. `access` no se usa (la fachada filtra por propietario).
  Sin puerto nuevo entre módulos: la fachada es una clase exportada, como `IndexableFileGateway`.
- **Frontend:** sin rutas nuevas ni entrada en la barra lateral; todo en la ficha (`app/(app)/(cliente)/archivos/archivo/[fileId]`).

## 3. Datos

```sql
-- Migración 2026…-crear-optimizacion (reversible)
CREATE TABLE optimizacion (
  id                   uuid        PRIMARY KEY,
  archivo_id           uuid        NOT NULL REFERENCES archivo(id) ON DELETE CASCADE,
  version_origen_id    uuid        NOT NULL,           -- sin FK: 014b purga el original y el historial debe quedar
  version_resultado_id uuid,                           -- sin FK; se fija al pasar a «optimizando» (idempotencia)
  estado               varchar(14) NOT NULL,
  motivo               varchar(24),
  bytes_origen         bigint      NOT NULL CHECK (bytes_origen > 0),
  bytes_estimados      bigint      CHECK (bytes_estimados > 0),
  bytes_resultado      bigint      CHECK (bytes_resultado > 0),
  creado_en            timestamptz NOT NULL,
  actualizado_en       timestamptz NOT NULL,
  CONSTRAINT ck_optimizacion_estado CHECK (estado IN ('estimando','estimada','no_conviene','no_disponible',
                                                      'optimizando','completada','descartada','fallida')),
  CONSTRAINT ck_optimizacion_motivo_valor CHECK (motivo IN ('tamano','pixeles','animada','ilegible',
                                                 'ahorro_minimo','version_cambiada','archivo_eliminado',
                                                 'integridad','servicio_no_disponible')),
  CONSTRAINT ck_optimizacion_motivo CHECK ((estado IN ('no_disponible','descartada','fallida')) = (motivo IS NOT NULL))
);
CREATE UNIQUE INDEX uq_optimizacion_en_curso ON optimizacion (archivo_id) WHERE estado IN ('estimando','optimizando');
CREATE INDEX idx_optimizacion_archivo ON optimizacion (archivo_id, creado_en DESC);
-- RLS: ENABLE + FORCE; política optimizacion_cliente TO nimbo_app: CLIENT y EXISTS (archivo propio), como indexacion_cliente.
```

**Estados** (finales en negrita): `estimando` → `estimada` | **`no_conviene`** | **`no_disponible`** (`pixeles`,
`animada`, `ilegible`) | **`fallida`**; `estimada` → `optimizando` → **`completada`** | **`descartada`** (`ahorro_minimo`,
`version_cambiada`, `archivo_eliminado`) | **`fallida`** (`integridad`, `servicio_no_disponible`). `no_disponible(tamano)`
se crea ya final al pedir estimar. Una `estimada` cuya versión de origen dejó de ser la vigente se responde como obsoleta.
Resultados del registrador (§2): `registered` y `duplicate` → `completada`; `not_smaller` → `descartada(ahorro_minimo)`;
`file_changed` → `descartada(version_cambiada)`; `file_missing` → `descartada(archivo_eliminado)`; `corrupt` → `fallida(integridad)`.

- **Sin `propietario_id`:** la RLS va por `EXISTS archivo`, como `indexacion`. **Sin `trabajo`** (DF-22 sigue abierto
  para 022b). Ahorro y porcentaje se derivan; no se guardan. **Nunca** se guardan nombres, claves de objeto, rutas
  temporales ni mensajes de `sharp`.
- `down`: `DROP POLICY`, `DROP TABLE optimizacion`. Prueba de reversión (RNF-10). Bytes en `bigint` y UUID no predecibles.

## 4. Contratos

| Método | Ruta | Rol | Request → Respuesta | Errores (`code`) |
|---|---|---|---|---|
| POST | `/files/:fileId/optimization/estimate` | CLIENT | — → `202` `OptimizationStatus` (`estimando`, la fila en curso si ya había una, o `no_disponible(tamano)`) | `404` `STORAGE_NODE_NOT_FOUND`, `422` `OPTIMIZER_UNSUPPORTED_TYPE`, `429` `SHARED_TOO_MANY_REQUESTS` |
| POST | `/files/:fileId/optimization/run` | CLIENT | `{ optimizationId }` → `202` `OptimizationStatus` (`optimizando`; repetir con el mismo id responde igual) | `403` `STORAGE_ACCOUNT_READ_ONLY`, `404`, `422` `OPTIMIZER_UNSUPPORTED_TYPE` (CA-3), `409` `OPTIMIZER_ESTIMATE_STALE` (no está `estimada`, no es la última o la versión cambió), `429` |
| GET | `/files/:fileId/optimization` | CLIENT | — → `200` `{ optimization: OptimizationStatus \| null }` | `404` |

- `OptimizationStatus`: `{ id, state, reason, originalBytes, estimatedBytes, resultBytes, savedBytes, savedPercent,
  keepOriginalDays, pollAfterMs, updatedAt }`. Los mensajes de CA-5 no muestran cifras, así que no viaja el límite;
  `keepOriginalDays` solo con `estimada` (`PlanLimits.trashRetentionDays`, para la fecha del diálogo);
  `pollAfterMs` solo en `estimando` y `optimizando`. La fecha real de conservación la muestra el historial (`keptUntil`
  de 014b).
- Roles internos `403` `SHARED_FORBIDDEN`; sin token `401` (guard global). **Sin cancelación** (ningún RF la pide).

## 5. Seguridad y operación

- **Actor y aislamiento:** cada servicio recibe `actor`; la fachada resuelve con `findOwnedFile` vivo bajo `withActor`
  (RN-5: un Editor ve el archivo pero no es propietario); el `worker` actúa como la cuenta dueña
  (`createActor(ownerId, CLIENT)`, como 019) y no confía en el `ownerId` del trabajo: lo revalida con la fachada.
- **Solo lectura (CA-17):** `estimate` no la consulta; `run` llama a `WritableAccountPolicy.assertWritable` antes de su
  transacción. El registro en el `worker` no vuelve a comprobarla: la decisión se tomó al confirmar (como 016).
- **Idempotencia y concurrencia:** doble pedido de estimar → índice único parcial, devuelve la fila en curso; «Ejecutar»
  repetido → compare-and-set `estimada → optimizando` con el mismo `optimizationId`; reintento o `worker` reiniciado →
  se reclama desde el estado activo, y reclamar renueva `actualizado_en` (así la caducidad perezosa no alcanza a un
  trabajo que el `worker` está procesando); la clave del objeto sale de `version_resultado_id`, así que una subida repetida
  reescribe el mismo objeto; el registrador responde `duplicate` si la versión ya existe (se toma como éxito); versión
  cambiada → `file_changed` → `descartada(version_cambiada)` y objeto borrado.
- **Trabajos perdidos:** caducidad perezosa (precedente: vencimiento perezoso de cargas, 005 D-5). Al leer o pedir de
  nuevo, una fila activa con `actualizado_en` más vieja que `OPTIMIZER_MAX_ATTEMPTS × 3 × OPTIMIZER_TIMEOUT_MS` más 5
  min pasa a `fallida(servicio_no_disponible)`. Sin programador nuevo: los trabajos los pide el cliente.
- **Consulta periódica en vez de canal en vivo (RN-10):** en 019 el aviso en vivo existe porque la indexación arranca
  sola tras cada versión, puede tardar y el cliente no la pidió (Adrián, 019 P-3), y el relay ya era necesario. En 021
  la operación la pide el cliente desde la ficha, dura segundos y él espera el resultado allí. Consultar cada
  `pollAfterMs` (cumple RNF-14) evita la arista `optimizer → realtime` y otro relay en el `api` (excepción a ADR-0001).
  El hook se detiene en un estado final, se pausa con la pestaña oculta (`visibilitychange`) y relee al abrir, al volver
  a estar visible y al recuperar la red.
- **Auditoría** (mejor esfuerzo, después del commit, como 014 y 019; CA-21): `file.optimized`
  `{ optimizationId, sourceVersionId, versionId, originalBytes, resultBytes }`; `file.optimization_discarded` y
  `file.optimization_failed` `{ optimizationId, sourceVersionId, originalBytes, resultBytes?, reason }`. `resourceId` =
  archivo y afectado = dueño. Estimar no se audita (no cambia nada).
- **Bitácoras (Pino):** `optimization.requested`, `.estimated`, `.not_worth_it`, `.unavailable`, `.completed`,
  `.discarded`, `.failed`, `.stale_expired`, con UUID, bytes, motivo y `errorClass`. **Nunca** nombres, claves de objeto,
  rutas temporales, URLs ni mensajes de `sharp`.
- **Límite de tasa:** `RATE_LIMIT_OPTIMIZER_PER_MINUTE` por cuenta para `estimate` y `run`, con `IRateLimiter` de `shared`.
- **Degradación (RNF-09, CA-14):** nada de 005, 006, 014 ni 016 depende de `optimizer`; con el `worker` caído las filas
  caducan a `fallida` y la ficha lo dice. Métricas: 022.

## 6. Configuración y valores

Todas en `env.schema.ts` (`api` y/o `worker`), `.env.example` y `ambientes.md`; cambiarlas no requiere código. Adrián
pidió valores **medidos y justificados**: los de A son de política; los de B salen del spike de ADR-0035 (2026-10-25).

**A. Política (propuesta inicial justificada; no dependen de una medición, se confirman al aprobar el plan)**

| Variable | Valor | Por qué |
|---|---|---|
| `OPTIMIZER_MIN_SAVED_PERCENT` | 20 | La única referencia aprobada es el mockup de la propuesta (p. 12), que llama «Ahorro bajo» a −16 %; 20 es el primer valor redondo por encima. Cada optimización ocupa un lugar de las versiones retenidas (014b RN-5) y puede podar una histórica (CA-13) |
| `OPTIMIZER_MIN_SAVED_BYTES` | 1 000 000 (1 MB) | Por debajo, el ahorro es < 0,007 % de la cuota más chica (Personal, 15 GB) y el medidor, con un decimal en GB, ni se mueve; aun así costaría una versión retenida |
| `OPTIMIZER_POLL_INTERVAL_MS` | 3 000 | Va en `pollAfterMs` (la web no tiene `NEXT_PUBLIC_*`). Progreso visible desde el `202` (RNF-14); unas 20 consultas por minuto, solo con la ficha abierta y mientras no es final |
| `RATE_LIMIT_OPTIMIZER_PER_MINUTE` | 10 | Como el reintento de indexación (019): cada pedido cuesta segundos de `worker`; 10 por minuto supera el uso humano archivo por archivo |
| `OPTIMIZER_MAX_ATTEMPTS` | 3 | 1 + 2 reintentos (`architecture.md` §8) |

**B. Técnicos, medidos en el spike de ADR-0035** (`sharp` 0.34.5, libvips 8.17.3, Node 24, Windows x64; un proceso por
caso con el trabajo completo: leer, inspeccionar, recomprimir y validar; *fixtures* sintéticos, así que el ahorro es
indicativo). Memoria = pico de RSS menos la base del proceso (49 MB).

| Variable | Valor | Evidencia | Por qué |
|---|---|---|---|
| `OPTIMIZER_MAX_PIXELS` | 36 000 000 | JPEG 297 MB a 40 MP (369 a 50); el spike midió también WebP, hoy fuera de alcance (348 MB a 40 MP) | Con el presupuesto supuesto de ~350 MB, 50 MP no cabe; 36 MP (≈ 267 MB en JPEG) deja margen y cubre cámaras de 12–33 MP. Se conserva el valor aprobado aunque sin WebP sobraría margen: subirlo exige medir de nuevo (T-08) |
| `OPTIMIZER_MAX_FILE_BYTES` | 40 000 000 (40 MB) | PNG de 40 MB (20 MP): 302 MB; PNG de 50 MB (25 MP): 376 MB | En PNG manda el peso (entrada, salida y comparación de píxeles); 50 MB no cabe |
| `OPTIMIZER_TIMEOUT_MS` | 100 000 | Peor caso dentro de los límites: PNG de 40 MB, 15,3 s; JPEG de 40 MP, 2,4 s (el spike midió también WebP, hasta 34,3 s, hoy fuera de alcance) | Margen de más de 6 × sobre el peor caso que queda, por si el servidor es más lento; T-08 puede bajarlo con la medición real |
| `OPTIMIZER_JPEG_QUALITY` + codificador | 80 con `mozjpeg: true` | 12 MP: 57,2 % en 134 ms por defecto frente a 62,7 % en 865 ms con mozjpeg; 50 MP: 0,53 s frente a 3,76 s; error medio visible 2,48 frente a 2,00 sobre 255; misma memoria | mozjpeg **no** es el valor por defecto (el binario lo trae y la opción activa sus ajustes): ~13 % menos bytes **y** menos error por ~6,5 × CPU, lejos del tiempo límite con concurrencia 1 |
| Concurrencia | cola 1, `sharp.concurrency(1)`, `sharp.cache(false)` | Con 2 hilos: JPEG 30 % más rápido, PNG 6 %, misma memoria; dos trabajos a la vez no se probaron | Dos trabajos de ~300 MB no caben; el segundo hilo gana poco y quita CPU al `api` y a la indexación |

Validación: `stats()` comprueba que el resultado abre (38 MB a 50 MP; decodificar a crudo costaba ~3 B/píxel más). En
PNG, hash de los píxeles; la estimación hace la misma comparación para no mostrar «conviene» si el validador
rechazaría el resultado.

**No medible aquí:** la base del `worker` real (Nest, TypeORM, BullMQ) y una indexación concurrente, que el presupuesto
**supone** en ~250 y ~150 MB, y los tiempos en Linux y en el servidor. T-08 los mide en el `worker` limitado a 768 MB;
si la base es mayor, `OPTIMIZER_MAX_PIXELS` baja en proporción (≈ 7,4 B por píxel en JPEG, el peor formato que queda).

PNG: compresión 9 con filtrado adaptativo, sin paleta (píxeles idénticos). GIF y WebP quedan fuera de 021: la medición del
spike (WebP animado, y GIF estático que `sharp` no recomprime sin pérdida) es antecedente para la spec que los retome.

## 7. Estrategia de pruebas (por riesgo)

| CA | Nivel | Archivo |
|---|---|---|
| Transiciones, motivos, caducidad; umbral (bytes **y** %) | unit | `optimizer/domain/optimization-job.spec.ts`, `savings-estimate.spec.ts` |
| CA-8: formato, alfa y píxeles en PNG; JPEG con orientación EXIF 6 que se ve igual y **sin rotar** (mismo ancho y alto); perfil ICC conservado; CA-5: PNG animado, píxeles, ilegible; CA-3: GIF y WebP rechazados por contenido real | unit con `sharp` real y *fixtures* | `optimizer/infrastructure/image/image.optimizer.spec.ts`, `image-integrity.validator.spec.ts` |
| PD-130: `registered`, `duplicate`, `file_changed`, `not_smaller`, `file_missing`, `corrupt`; compensación; 014b (espacio neto y `keptUntil`) | unit + int (Postgres + MinIO) | `storage/application/optimized-version.registrar.spec.ts`, `test/int/storage/versions-optimizer-facade.int-spec.ts` |
| CA-1 a CA-5, CA-17 (estimar), CA-18 | int | `test/int/optimizer/estimate.int-spec.ts` |
| CA-6, CA-7, CA-9 a CA-12, CA-14 a CA-16, CA-17 (ejecutar) | int | `test/int/optimizer/run.int-spec.ts` (incluye restaurar el original con y sin cuota) |
| CA-21 | int | `test/int/optimizer/logs-and-audit.int-spec.ts` |
| Migración y `down` | int | `test/int/optimizer/migrations.int-spec.ts` |
| CA-19, CA-20 | iso (bloqueante) | `test/isolation/optimizer.iso-spec.ts` y `test/support/route-declarations.ts` |
| Contrato | unit | `packages/contracts/src/optimizer/schemas.spec.ts` |
| CA-6 (consulta, parada, pausa, relectura), CA-13, CA-15, CA-22 | web (RTL + axe) | `features/optimizer/**/*.spec.tsx`, `components/nimbo/version-timeline.spec.tsx` |

*Fixtures* versionados y pequeños en `apps/api/test/fixtures/images/`: PNG con alfa, PNG animado, JPEG con orientación EXIF 6 y JPEG
con perfil ICC no sRGB, y un GIF y un WebP (solo para comprobar que se rechazan).
Generados en la prueba: la imagen corrupta y una cabecera cuyos píxeles totales superan el límite. Las pruebas que
usan `sharp` se escriben después de que ADR-0035 se acepte (el spike de §6 usó equivalentes sintéticos fuera del repo).

## 8. Riesgos y coherencia con el diseño

- **Tamaño (ADR-0034):** 45 archivos de producción (23 con lógica, 22 de cableado) superan los 12. Se documenta una
  excepción de ADR-0034 para 021 por ser un módulo nuevo y mantener el corte vertical por formato decidido por Adrián.
- **`sharp` en proceso:** un fallo nativo reiniciaría el `worker` y la indexación. Se mitiga con límites antes de
  decodificar, concurrencia 1, un hilo de libvips y la caducidad (§5). Si ocurre con imágenes dentro de los límites,
  ADR-0035 prevé pasar a herramientas externas detrás de `IOptimizer`.
- **Valores:** los de §6 B están medidos en el spike; queda supuesta la base del `worker` real, que mide T-08.
- **WebP y GIF (recorte del 2026-10-26):** fuera de 021. ADR-0035 (`Aceptado`) conserva el resultado del spike sobre ambos;
  no se reescribe. Un PNG animado se trata como `no_disponible(animada)`; es un riesgo de pérdida de datos que el recorte
  no debe dejar abierto, y T-03 confirma el comportamiento de `sharp` con un *fixture*.
- **PD-124 y 017 (deuda explícita):** 021 agrega una tercera fachada que lee la versión vigente por su cuenta. El Art. VI.2
  ya pediría extraer el lector; se difiere por decisión del 2026-10-26: lo extrae quien integre 017 (cuya rama trae
  `storage-preview.facade.ts`), que pasará a ser la cuarta lectura. PD-124 sigue abierto en `pendientes.md`.
- **Desviaciones del diagrama:** DF-81 (M7 sin `restoreOriginal` ni `BaseOptimizer`, `OptimizationRunner`, sin
  `trabajo`). `design-model.md` M7 y `architecture.md` §3, §7.6 (solo imágenes) y §8 (cola `optimization`) se
  actualizan en el PR. DF-22 sigue abierto para 022b.
- **Pendientes:** PD-130 y PD-121 se cierran con esta spec; PD-124 sigue abierto (lo cierra quien integre 017); la parte de
  PD-132 de la 021 está hecha (28 capturas, axe sin violaciones). DF-80 y 019 §7.7 pasan a 021b.
- **ADR requeridos:** ADR-0035 (`sharp`), `Aceptado` con este plan (2026-10-26).

## 9. Aprobación

- Arquitectura (tecnología nueva y arista `optimizer → audit`; 2026-10-26): sin objeciones. Sin puerto nuevo entre
  módulos; `sharp` detrás de `IOptimizer` y solo en el `worker`. Se precisaron §2, §3, §4 y §5 antes de aprobar.
- **Adrián: aprobado el 2026-10-26.** ADR-0035 y DF-81 `Aceptado`; valores de §6 A confirmados; excepción de ADR-0034
  (§8); Adrián revisa en el PR `storage` (PD-130, PD-121), `audit`, `boundaries.js` y la raíz.
- **Enmienda de alcance, 2026-10-26 (pendiente de aprobación de Adrián):** solo JPEG y PNG; PD-124 fuera; interfaz de
  8 estados con un solo mensaje de «no disponible». Quita 3 archivos (48 → 45); sin puertos ni tecnología nuevos,
  `architect` no interviene. Valores de §6 iguales salvo `OPTIMIZER_WEBP_QUALITY`, que desaparece.
