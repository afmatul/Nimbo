# ADR-0038 — El optimizador corre en un proceso `worker-optimizer` propio, sobre una imagen glibc

| Campo | Valor |
|---|---|
| Estado | Aceptado (Adrián, 2026-10-27) |
| Enmiendas posteriores | Runtime concreto y entorno físico mínimo aceptados por Matul/Adrián el 2026-10-28, después de `7f9285ff` |
| Fecha | 2026-10-27 |
| Decisores | Abel (021), `architect` (dos revisiones), Adrián (aprobación) |
| Specs relacionadas | 021 (T-08, T-10), 019 (indexación), 021b (Ghostscript en la imagen); **enmienda ADR-0001 y ADR-0037**; no reemplaza ADR-0017; cierra PD-128 |

## Contexto
ADR-0037 puso `sharp` en el único proceso `worker` (ADR-0001), con concurrencia 1 por cola y 768 MB por contenedor, y
dejó para la T-08 de 021 medir la memoria real. La T-08 se midió con el `worker` real compilado para Linux, en un
contenedor de cgroup v2 con `--memory=768m --memory-swap=768m` (sin swap del contenedor), bajo glibc y `MALLOC_ARENA_MAX=2`:

| Escenario | Pico | Margen al tope |
|---|---|---|
| `worker` en reposo | ~87 MiB | — |
| A2: solo el optimizador (JPEG 12 MP, PNG crítico 36 MP) | 533,0 MiB | 30,6 % |
| Indexación pesada sola (019) | 471–483 MiB | ~37 % |
| B1: indexación representativa + optimizador a la vez | 560,9 MiB | 27 % |
| **B2: indexación pesada + imágenes de 36/30/24 MP a la vez** | **OOM** | — |
| B2 con imágenes chicas | 753,7 MiB | 1,9 % |
| Serializado: optimizador → indexación | 694 MiB | 9,6 % |

Con glibc y el `malloc` por defecto (8 × núcleos arenas) el optimizador **solo** ya llegaba al OOM; `MALLOC_ARENA_MAX=2`
lo bajó a 533 MiB. B2 es legítimo: la indexación de 019 acepta archivos de hasta 50 MiB y OOXML declarado hasta 64 MiB,
lee el documento completo y construye todos los segmentos antes de que el *chunker* corte en el fragmento 5001. Ese
trabajo y un PNG de 36 MP no caben juntos en 768 MiB, y serializarlos deja menos de 10 % de margen. Bajar el límite de
píxeles dejaría fuera fotos comunes y no protege la indexación. El `worker` todavía no tenía imagen Docker (PD-128).

## Opciones consideradas
1. **A — Serializar colas en el mismo proceso** (un trabajo pesado a la vez): sin infraestructura nueva, pero el peor
   orden medido deja 9,6 % de margen, por debajo del 15 % exigido, y acopla la latencia de la indexación a la del optimizador.
2. **B — Subir el límite del `worker` a ~1,2 GB**: un cambio de configuración, pero un fallo nativo de `sharp` sigue
   tumbando la indexación, el correo y los cobros, y el presupuesto del servidor de 8 GB con ONLYOFFICE no lo admite.
3. **C — Un proceso y contenedor propios para el optimizador (`worker-optimizer`)**, con la misma imagen y otro comando.
   Cada proceso tiene su tope y sus fallos; las colas son disjuntas por construcción. Cuesta un contenedor más (768 MiB) y
   una raíz de composición.
4. **D — Recorte temprano de la indexación de 019** (cortar antes de construir todos los segmentos): reduce el pico de
   indexación, pero cambia 019, que no es de esta spec; queda como pendiente (PD) y no resuelve el aislamiento de fallos.
5. **E/F — Otra librería o herramientas por formato** (opción 2 de ADR-0037): rehacer el optimizador sin evidencia de
   que libvips sea el problema; los picos son de la combinación, no de una fuga.

Sobre la base de la imagen: **musl (Alpine, plan 000 §6.5)** frente a **glibc (`bookworm-slim`)**. `sharp` publica
binarios para las dos, pero el comportamiento de memoria medido y `MALLOC_ARENA_MAX` son de glibc (musl lo ignora y su
asignador no se midió); además `ldd`, Ghostscript por `apt` y los binarios precompilados de `argon2` son de glibc.

## Decisión
**Opción C con glibc (G1).**

- **Dos procesos, una imagen.** `nimbo-worker` (`apps/worker/Dockerfile`) contiene los dos puntos de entrada:
  `dist/worker.main.js` (el `worker` general, comando por omisión) y `dist/worker-optimizer.main.js`. Solo cambia el comando.
  No hay `WORKER_ROLE` ni banderas: la separación es por construcción, con dos raíces de composición.
- **Colas disjuntas.** El `worker` general (`WorkerModule`) consume `WORKER_QUEUES` (ping, mail, upload-cleanup,
  trash-purge, usage-reconcile, subscription-reconcile, invoice-retry, subscription-renewal, indexing, index-reconcile) y
  **no carga `sharp`**. `worker-optimizer` (`WorkerOptimizerModule`) consume exactamente `['optimization']`. Las pruebas de
  composición recorren los módulos y fallan si un procesador aparece en la raíz equivocada o duplicado.
- **`storage` por composición.** El general usa `StorageWorkerModule`, con el ciclo de carga y el mantenimiento.
  El optimizador usa `StorageFacadesWorkerModule`: `AuditModule`, `WORKER_OBJECT_STORAGE_PROVIDER` (MinIO),
  `FILE_VERSION_PROVIDERS` y `OPTIMIZABLE_FILE_PROVIDERS`, que exportan `OptimizableFileGateway` sin colas,
  programadores ni procesadores. Los dos módulos reutilizan el provider de objetos; no hay un booleano que active procesadores.
- **Salud.** Los dos exponen `/health/live` y `/health/ready` (Redis) en un puerto interno nunca publicado:
  `WORKER_PORT` (3001) y `WORKER_OPTIMIZER_PORT` (3003). `node dist/healthcheck.js [VARIABLE]` consulta el del proceso;
  el `HEALTHCHECK` de la imagen es el del general y compose lo sobrescribe en `worker-optimizer`.
- **Runtime glibc.** Todas las etapas de la imagen de los `worker` usan `node:22.23.3-trixie-slim` (Debian 13 / Trixie,
  glibc 2.41; ver la enmienda del 2026-10-28); `node_modules` y los binarios nativos se instalan y se copian dentro de la
  misma libc. El `api` sigue en `node:22-alpine` (no carga `sharp`). Ghostscript (la versión de Trixie al construir la
  imagen, sin fijar; `10.05.1~dfsg-1+deb13u3` al 2026-10-28) se instala por
  `apt` (`GHOSTSCRIPT_BIN=gs`) para 019 y futuro 021b. La imagen es compartida: 021 JPEG/PNG no usa Ghostscript.
- **Memoria.** `ENV MALLOC_ARENA_MAX=2` en la etapa final de la imagen (no se repite en compose). Los dos `worker` con
  `mem_limit` = `memswap_limit` = 768m (sin swap del contenedor: al tope se reinicia, no se degrada). La swap del host
  de R-6 no cambia. La reducción a 512m de R-6 ya **no** aplica a ningún `worker`.

## Consecuencias
- Positivas: un OOM o un fallo nativo de `sharp` reinicia solo `worker-optimizer`; la indexación, el correo y los cobros
  siguen. Cada proceso tiene su margen medible. La imagen del `worker` existe (PD-128) con `sharp`/libvips y Ghostscript
  comprobados. El `api` y el `worker` general no cargan `sharp`.
- Negativas / deuda aceptada: un contenedor y un proceso más que operar (+768 MiB al presupuesto: 7936 MiB de límites con
  ONLYOFFICE); dos bases de imagen (Alpine en `api`, Debian en los `worker`); la imagen glibc pesa más; el diagrama de
  despliegue debe redibujarse. El riesgo de B2 dentro del `worker` general (indexación pesada sola, ~480 MiB) no cambia.
- Cómo sabremos si fue un error: OOM en `worker-optimizer` con imágenes dentro de los límites; margen < 15 % en
  cualquiera de los dos `worker` en staging; `MemAvailable` del host < 10 % con los dos `worker` cargados; un segundo
  consumidor de `optimization`; o que el optimizador necesite más colas o estado compartido con el general (señal de que
  la frontera de proceso está mal trazada). Entonces se revisa B (límite) o D (019) antes de agregar procesos.

## Relación con otros ADR
- **ADR-0001**: se mantiene el monolito modular y la separación por proceso e imagen; pasa de **un** proceso `worker` a
  **dos procesos con la misma imagen**.
- **ADR-0037**: `sharp` sigue siendo la librería y se carga solo en `worker-optimizer`, no en «el `worker`». Su nota
  sobre la imagen (PD-128) queda resuelta: base glibc.
- **ADR-0017** no cambia: solo menciona Alpine como restricción de `argon2` en la imagen del `api`.

## Validación
T-08 final de 021 sobre esta imagen (registro de la spec 021, §10, 2026-10-28): con indexación pesada sostenida en el
general y PNG/JPEG de 36 MP en el optimizador, picos de 543,9 MiB (29,2 % libre) y 486,0 MiB (36,7 %); con ONLYOFFICE
activo, 527,6 y 490,8 MiB; OOM 0, `MemAvailable` mínimo del host 68,9 %, un solo consumidor de `optimization`, `sharp`
solo en `worker-optimizer`, y un SIGKILL al optimizador a mitad de un trabajo no afecta al general (compose lo reinicia
y el trabajo se retoma una sola vez).

## Enmienda de runtime (propuesta 2026-10-28) — **aceptada por Matul/Adrián el 2026-10-28**

La decisión original (opción C con glibc) es la aceptada el 2026-10-27 y no cambia. La aprobación humana posterior
a `7f9285ff` acepta la enmienda concreta: `node:22.23.3-trixie-slim`, sharp 0.35.5/libvips 8.18.7,
Ghostscript provisto por Trixie y `MALLOC_ARENA_MAX=2`. Antes de esa respuesta la propuesta seguía sin aprobar.

- **Base Debian 13 (`node:22.23.3-trixie-slim`) en vez de Debian 12.** El tracker de seguridad de Debian marca en
  bookworm (`ghostscript` 10.0.0~dfsg-11+deb12u8) CVE-2026-103226, CVE-2026-101258 y CVE-2026-39919 sin corregir, más
  un *use-after-free* en el cargador de fuentes Type 1 (`.forceput`); trixie (`10.05.1~dfsg-1+deb13u3` al 2026-10-28) los corrige. Los
  `worker` procesan PDF no confiables con Ghostscript (019, 021b), así que la imagen pasa a trixie (glibc 2.41). El resto
  de la decisión no cambia: glibc en todas las etapas, una imagen y dos comandos, `MALLOC_ARENA_MAX=2`, 768 MiB sin swap.
  El `api` sigue en Alpine.
- **`sharp` 0.35.5 (libvips 8.18.7)** en vez de 0.34.5 / 8.17.3 (ADR-0037, enmienda de la misma fecha).
- Por los dos cambios, la T-08 se volvió a medir sobre la imagen nueva (registro de la spec 021, §10): general 543,0 MiB
  (29,3 % libre) y optimizador 478,0 MiB (37,8 %) en el escenario C; con ONLYOFFICE, 527,4 y 466,5 MiB y `MemAvailable`
  mínimo del host 71,0 %; OOM 0. Los picos no cambian de forma significativa.

## Ajustes de la revisión independiente (2026-10-28)

- **Cierre ordenado:** cada `worker` llama a `app.enableShutdownHooks()` y compone `WorkerDrainModule`, que en
  `beforeApplicationShutdown` cierra cada `Worker` de BullMQ esperando su trabajo activo, antes de que TypeORM y Redis
  cierren sus conexiones (si no, el trabajo falla al terminar con «Driver not Connected»). Compose usa `init: true` con
  `stop_grace_period` de 90 s en el general y 330 s en `worker-optimizer` (3 operaciones de `sharp` por intento ×
  `OPTIMIZER_TIMEOUT_MS` + E/S).
- **Trabajo atascado:** si el proceso muere con un trabajo activo más de `maxStalledCount` veces, BullMQ lo falla con
  `UnrecoverableError` aunque queden intentos; `OptimizationProcessor` lo trata como terminal y lo deja `fallida`.
- **Entorno propio (PD-158, partes 1 a 3):** `worker-optimizer` valida `workerOptimizerEnvSchema` (base común, MinIO,
  tiempo límite, píxeles, umbrales, calidad JPEG y su puerto): 17 variables consumidas. El general no valida variables del
  optimizador. `OPTIMIZER_MAX_ATTEMPTS` pertenece solo al `api`, que lo guarda al encolar; el consumidor usa `job.opts.attempts`.
  Las partes 1 a 3 precedieron a la aprobación de la inyección física mínima; su implementación posterior cierra
  la parte 4 de PD-158 como se registra abajo.
- **`storage`:** `StorageFacadesWorkerModule` registra solo MinIO, la escritura de versiones (`FILE_VERSION_PROVIDERS`) y
  la fachada; el ciclo de carga queda en `StorageWorkerModule`.
- **Imagen:** el build comprueba en la etapa final `sharp`/libvips, Ghostscript, glibc y `MALLOC_ARENA_MAX`.

## Entorno físico mínimo (aprobado por Matul/Adrián el 2026-10-28, después de `7f9285ff`)

- `worker-optimizer` deja de usar `env_file` y declara `environment` con las 17 claves de `workerOptimizerEnvSchema`.
  La prueba `scripts/optimizer-compose.spec.ts` resuelve Compose base y sus overrides disponibles y compara sus claves
  efectivas contra el schema real, sin una segunda lista manual. Las variables `ENV` de imagen/runtime quedan aparte.
- `DATABASE_URL` se construye para `nimbo_app` en `postgres:5432` con la contraseña de aplicación interpolada por Compose;
  la variable auxiliar no se entrega al proceso. Redis y MinIO usan `redis:6379` y `minio:9000`, con credenciales S3 de aplicación.
  No se inyectan credenciales de migración, root, SMTP, Gemini, JWT ni ONLYOFFICE.
- **No hay enmienda ni excepción a CA-19 de 000:** `.env.example` es el catálogo completo del sistema; cada proceso
  recibe su mínimo necesario. PD-158 queda cerrado. El enlace amplio de billing es una deuda independiente (PD-162).
- T-09 sigue siendo el recorrido humano pendiente de Abel; `/review 021` se realiza después de ese recorrido y estos ajustes.
