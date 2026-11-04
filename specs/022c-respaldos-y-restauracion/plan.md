# Plan 022c — Respaldos y restauración

> Spec: `./spec.md` · Estado del plan: Aprobado
> Obligatorio y ≤ 250 líneas. Dice **qué** archivos se tocan y **qué** se espera de cada uno; no es el código en
> prosa (sin cuerpos de funciones ni pseudocódigo). Lo aprueba Adrián antes de escribir código.

## 1. Resumen técnico
Todo es infraestructura y procedimiento: no hay módulo de Nest, ni migración, ni contrato HTTP, ni pantalla.
1. **Base de datos (HU-1).** Un servicio `backup` del compose, bajo el perfil `backups` (S-4), corre un script de
   shell que espera la hora programada (`BACKUP_TIME`), ejecuta `pg_dump` en formato *custom* contra `postgres`, cifra
   el flujo con la herramienta de ADR-0041 hacia un archivo temporal del volumen `backup_data` y lo renombra al
   terminar sin error. Después rota a las 7 copias más recientes. Cada corrida escribe líneas JSON con `correlationId`.
   Un fallo borra solo su temporal y nunca rota.
2. **Restauración (HU-1).** Un segundo script, en el mismo servicio, descifra con la clave que aporta el Operador y
   restaura con `pg_restore` sobre una base vacía. Si la base ya tiene tablas, se niega antes de escribir.
3. **Objetos (HU-2).** `infra/minio/init.sh` ya activa el versionado (000 D-7); además aplica de forma idempotente
   **una sola** regla de ciclo de vida, NoncurrentVersionExpiration a 7 días, reemplazando la configuración completa.
   La recuperación de una versión se hace con comandos `mc` documentados. Lo que Nimbo purga ya pasa por
   `IObjectStorage.purgeObject`, que borra todas las versiones y marcas de borrado, así que la regla no lo afecta.
4. **Verificación.** Pruebas de integración con Testcontainers ejecutan los **mismos scripts** sobre datos sintéticos
   que crea la propia prueba. El ensayo humano sigue `docs/operations/respaldos.md` en local y deja su fila en el
   registro de esa página (CA-5).

## 2. Módulos, archivos y diseño
| Módulo / capa | Archivo (nuevo o cambiado) | Responsabilidad |
|---|---|---|
| infra | `infra/backup/backup.sh` (nuevo) | Subcomandos `schedule` (espera `BACKUP_TIME` en `TZ` y corre una vez al día) y `run` (una corrida inmediata). Volcado *custom* cifrado en flujo, sin dump en claro en disco; temporal → renombrado atómico; rotación a 7; códigos de §4; líneas JSON sin secretos |
| infra | `infra/backup/restore.sh` (nuevo) | `restore <archivo>`: comprueba que la base destino no tenga tablas en `public`; **primera pasada** descifra completo hacia `/dev/null` (clave equivocada o archivo alterado → `RESTORE_KEY_INVALID` sin tocar la base); **segunda pasada** descifra en flujo hacia `pg_restore --single-transaction --exit-on-error`, sin `--no-owner` ni `--no-privileges` (un corte a mitad revierte todo, CA-4/CA-6); códigos de §4 |
| infra | `infra/backup/Dockerfile` (nuevo, **solo si** ADR-0041 elige una herramienta que `pgvector/pgvector:pg17` no trae) | La imagen de Postgres más la herramienta de cifrado, nada más. Si la herramienta ya viene en la imagen, esta fila no existe y el servicio usa la imagen fijada de `postgres` (misma versión de `pg_dump` y `pg_restore` que el servidor) |
| compose | `compose.yml` | Servicio `backup` (perfil `backups`, `restart: unless-stopped`, sin `ports:`, `mem_limit`, `entrypoint` propio hacia `backup.sh`: el de la imagen de Postgres inicializaría un clúster), volumen nuevo `backup_data` montado solo aquí, **solo la clave pública** como `secret` de compose desde `BACKUP_PUBLIC_KEY_FILE` (ruta del host fuera del repositorio); la privada nunca figura en compose (ADR-0041). Recibe solo `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `BACKUP_TIME` y `TZ: ${BACKUP_TZ}`; ninguna credencial de la app |
| infra | `infra/minio/init.sh` | Además del versionado, importa (`mc ilm import` con el JSON en un *heredoc*: la imagen `pgsty/mc` no trae `sed` ni `grep`, ADR-0025) una configuración de ciclo de vida con una única regla `NoncurrentVersionExpiration` de 7 días (reemplaza, no suma) y registra que el bucket quedó listo |
| config | `.env.example` | `BACKUP_TIME=03:00`, `BACKUP_TZ=America/Guatemala` y `BACKUP_PUBLIC_KEY_FILE` con una ruta de ejemplo **fuera** del repositorio. Nunca una clave |
| docs | `docs/operations/respaldos.md` (nuevo) | Procedimiento del Operador: encender el servicio, respaldo bajo demanda, dónde están las copias, restaurar sobre un volumen nuevo (la clave privada se monta con `-v` solo en esa corrida), comprobar (`migration:run`, `health/ready`, conteos), qué pasa con los objetos que Nimbo purgó después del respaldo (R-7), recuperar la versión anterior de un objeto con `mc`, qué no se recupera, custodia de la clave, copia externa antes de producción (RN-6) y **tabla del registro de pruebas** (fecha, respaldo, duración, resultado, quién) |
| docs | `docs/operations/ambientes.md` | Filas de las tres variables nuevas (columna «compose»), el volumen `backup_data` en §3 y el perfil `backups` |
| pruebas | `apps/api/test/support/backup-corpus.ts` (nuevo) | Corpus sintético mínimo y la función de **conteos de control**. Parte de `createIsolationWorld` (`test/isolation/setup/isolation-world.ts`: dos cuentas ficticias, carpetas, filas de archivo y versión, y eventos de auditoría; las pruebas de integración ya importan de esa carpeta). Solo agrega lo que el mundo no trae: objetos en MinIO de esas versiones, suscripción y fragmentos con vector. Datos inventados, sin correos reales; no usa `pnpm seed` (PD-135). El procedimiento lo invoca también para el ensayo humano |
| pruebas | `apps/api/test/int/operations/backup-service.int-spec.ts` (nuevo) | CA-1, CA-2, CA-3, CA-9 (servicio, rotación, fallos, forma del compose) |
| pruebas | `apps/api/test/int/operations/backup-restore.int-spec.ts` (nuevo) | CA-4, CA-5, CA-6 (restauración de punta a punta) |
| pruebas | `apps/api/test/int/operations/object-versions.int-spec.ts` (nuevo) | CA-7, CA-8 (regla de ciclo de vida y recuperación de versión) |

- Clases, puertos y tablas: ninguno nuevo. Los diagramas no modelan respaldos (es infraestructura, `architecture.md`
  ya prevé «respaldos» en `infra/`). Se reutiliza `IObjectStorage.purgeObject` sin cambios.
- Puertos nuevos: ninguno (Art. V.2: no hay abstracción que justificar). Dependencias nuevas entre módulos: ninguna.
- Frontend: ninguno. `apps/api/src` no cambia: no hay ruta de respaldos (CA-9).
- **Tamaño (ADR-0034):** 12 archivos (13 si hace falta el `Dockerfile` condicional) y ≈ 4 días-persona (la suma de
  `tasks.md`, ya con el corpus sobre el mundo de aislamiento). Cumple el límite de archivos y pasa de los ~3 días. Se
  pide excepción en días. La alternativa, separar MinIO (CA-7 y CA-8, ≈ 1 día con su ensayo), cambia el agrupamiento
  de P-5. Lo decide Adrián al aprobar.
- Tecnología nueva: la herramienta de cifrado (ADR-0041, `Aceptado` el 2026-11-04; recomienda `gpg` asimétrico si viene en la
  imagen, `age` con la fila condicional si no). `pg_dump`, `pg_restore` y `mc` ya vienen en las imágenes
  fijadas de `postgres` y `minio-init` (ADR-0025).

### Decisiones de diseño
- **D-1 Ejecutor.** Un bucle de espera en el propio script, no `cron` ni systemd, para que funcione igual en Windows y
  Linux (P-5) y no exija otro proceso en la imagen. La hora se lee de `BACKUP_TIME` (`HH:MM`) en la zona de `TZ`.
- **D-2 Rol del volcado.** `pg_dump` se conecta como el dueño (`POSTGRES_USER`), no como `nimbo_app`: casi todas las tablas con
  datos de cliente (`archivo`, `version_archivo`, `carga`, `carpeta`, `evento_auditoria`, `suscripcion`…) tienen RLS forzada y `nimbo_app` no tiene `BYPASSRLS`, así que con él el volcado
  saldría incompleto o fallaría. En local el dueño es superusuario. Staging: ver R-2.
- **D-3 Atomicidad.** El archivo final se llama `nimbo-<AAAAMMDD>T<HHMMSS>Z.dump.<ext>` (UTC, sin datos de usuarios) y
  solo aparece por renombrado después de que `pg_dump` y el cifrado terminan con `0`. La rotación cuenta solo
  archivos finales.
- **D-4 Restauración.** Destino = volumen nuevo de `postgres`: el script de inicio crea `nimbo_app` antes de
  restaurar, así que los `GRANT` y las políticas `TO CURRENT_USER` (ADR-0021) vuelven intactos con el mismo dueño.
- **D-5 ILM.** Se importa la configuración entera (una regla) en lugar de «agregar regla», para que repetir
  `minio-init` no duplique (CA-7). La regla no toca versiones vigentes: cada versión de un archivo de Nimbo es una
  clave propia `u/{propietario}/{archivo}/{versión}` y es la vigente de su clave (RN-5).
- **D-6 Recuperación de versión.** El procedimiento usa `mc` desde la imagen de `minio-init` con
  `docker compose run --rm --entrypoint mc minio-init …`: listar versiones de la clave y volver a hacer vigente la
  anterior (copiarla sobre sí misma o quitar la marca de borrado). La base no cambia: la clave sigue siendo la misma.

## 3. Datos
```sql
-- Sin migraciones: 022c no cambia el esquema.
-- Conteos de control (backup-corpus.ts), mismas consultas antes de respaldar y después de restaurar:
--   SELECT count(*) FROM plan | usuario | suscripcion | carpeta | archivo | version_archivo
--                       | evento_auditoria | fragmento | migracion;
-- + por cada version_archivo del corpus, HeadObject de clave_objeto en MinIO (existe y mismo tamaño).
-- Comprobación de aislamiento tras restaurar: el conjunto (tabla, relrowsecurity, relforcerowsecurity) de todas
--   las tablas de public y el de pg_policies (tabla, nombre) son iguales en A y en B (no solo tres tablas: hay
--   RLS forzada en más de diez); la app arranca como nimbo_app (DatabaseRoleCheck).
```
- `down`: no aplica. Revertir 022c es apagar el perfil `backups`, quitar el servicio y el volumen, y volver a importar
  una configuración de ciclo de vida vacía en el bucket (documentado en `respaldos.md`).

## 4. Contratos
Sin rutas HTTP (CA-9). La interfaz es de línea de comandos, solo para el Operador:

| Comando | Quién | Efecto | Errores (`code`) |
|---|---|---|---|
| `docker compose --profile backups up -d backup` | Operador | Programa la corrida diaria (`schedule`) | `BACKUP_KEY_MISSING` (al arrancar y en cada corrida) |
| `docker compose --profile backups run --rm backup run` | Operador, pruebas | Una corrida inmediata | `BACKUP_KEY_MISSING`, `BACKUP_DUMP_FAILED`, `BACKUP_ENCRYPT_FAILED`, `BACKUP_WRITE_FAILED` |
| `docker compose --profile backups run --rm backup restore <archivo>` (con la clave del Operador montada solo en esa corrida) | Operador | Restaura sobre la base vacía | `RESTORE_FILE_NOT_FOUND`, `RESTORE_KEY_INVALID`, `RESTORE_TARGET_NOT_EMPTY`, `RESTORE_FAILED` |

Bitácora (JSON por línea, `level`, `time`, `event`, `correlationId` por corrida; mismo criterio de redacción que
`ambientes.md` §5):

| Evento | Campos además de los comunes |
|---|---|
| `backup.scheduled` | `nextRunAt` |
| `backup.completed` | `backupFile`, `sizeBytes`, `durationMs`, `kept` (copias tras rotar) |
| `backup.failed` | `code`, `durationMs`, `exitCode` (de la herramienta) |
| `restore.completed` / `restore.failed` | `backupFile`, `durationMs` / `code`, `durationMs` |

Nunca: texto de `stderr` de `pg_dump`/`pg_restore`, host, usuario, contraseña, `PG*`, ruta ni contenido de la clave.
Los scripts salen con `0` si todo va bien y con `1` en un fallo, después de escribir la línea `*.failed`.

## 5. Seguridad y operación
- `actor` / `accessibleNodes` / RLS: no aplica a los scripts, que no son un servicio de Nimbo. La base restaurada debe
  conservar la RLS forzada y la app debe volver a arrancar como `nimbo_app` (comprobado en CA-5).
- Superficie: el servicio `backup` no publica puertos, no tiene `env_file` (no recibe secretos de la app: JWT, Gemini,
  SMTP, MinIO) y es el único que monta `backup_data`. Solo la clave **pública** entra como `secret` de compose, de solo lectura.
- Clave: cifrado **asimétrico** (ADR-0041): el servidor guarda solo la clave pública y la privada queda con el
  Operador, fuera del servidor, y entra con `-v` solo en la corrida de `restore`. Custodia y rotación (clave nueva; la
  anterior se conserva hasta que rote la última copia que cifró, 7 días) se documentan en `respaldos.md`.
- Bitácoras sin datos sensibles (§4). Métricas: ninguna en 022c (las define la 022).
- Paridad: el servicio usa la imagen fijada de `postgres` (o la mínima de la fila condicional), sin `build` en
  staging salvo esa fila (R-1).

## 6. Estrategia de pruebas (por riesgo)
Todas contra servicios reales con Testcontainers (Art. III.2), con contenedores **propios** de la suite (como
`test/int/shared/app-role-script.int-spec.ts`): las cuentas del corpus no comparten base con otras suites, así que los
conteos son estables. Las claves de cifrado de prueba se generan en la propia prueba en un directorio temporal. Nadie
espera 24 h: `BACKUP_TIME` se fija un minuto por delante en la zona del contenedor.

| CA | Nivel | Archivo | Qué comprueba |
|---|---|---|---|
| CA-1 | int | `backup-service.int-spec.ts` | `schedule` con la hora un minuto por delante → aparece un archivo del día y una línea `backup.completed` con `sizeBytes` > 0 y `durationMs` |
| CA-2 | int | `backup-service.int-spec.ts` | Con copias previas: contraseña errónea, clave ausente y volumen sin espacio (o sin permiso de escritura) → `backup.failed` con su `code`, sin temporal, copias previas con el mismo hash; la salida no contiene la contraseña, el host ni el texto de `pg_dump` |
| CA-3 | int | `backup-service.int-spec.ts` | 8 corridas `run` seguidas → quedan las 7 más recientes; el volumen de respaldos no es el de datos de `postgres` |
| CA-9 | int | `backup-service.int-spec.ts` | `docker compose --profile backups config` (proyecto temporal, como `scripts/optimizer-compose.spec.ts`): `backup` sin `ports:` ni `env_file`, `backup_data` solo en `backup`, y `docker compose config` **sin** el perfil no exige `BACKUP_PUBLIC_KEY_FILE` |
| CA-4 | int | `backup-restore.int-spec.ts` | `pg_restore --list` sobre el archivo cifrado falla; `restore` con otra clave y con un archivo truncado → `RESTORE_KEY_INVALID` y la base destino sigue sin tablas |
| CA-5 | int | `backup-restore.int-spec.ts` | Base A migrada + corpus → conteos → `run` → base B vacía (contenedor nuevo con `10-nimbo-app.sh`) → `restore` → `migrate.ts run` registra `migration.run` con `applied: []`, conteos iguales, mismo conjunto de RLS y políticas que A, la app (`createFullApiTestApp`) apuntando a B como `nimbo_app` responde `200` en `/api/v1/health/ready` |
| CA-6 | int | `backup-restore.int-spec.ts` | `restore` sobre la base A (con tablas) → `RESTORE_TARGET_NOT_EMPTY` y los conteos de A no cambian |
| CA-7 | int | `object-versions.int-spec.ts` | `init.sh` dos veces contra un MinIO nuevo → versionado `Enabled` y `GetBucketLifecycleConfiguration` con exactamente una regla `NoncurrentDays = 7` |
| CA-8 | int | `object-versions.int-spec.ts` | Objeto del corpus sobrescrito y otro borrado con el SDK (fuera de Nimbo) → los comandos `mc` del procedimiento lo devuelven y el objeto vigente tiene los bytes originales; tras `purgeObject` no queda ninguna versión que recuperar |
| CA-5 (registro), CA-8 | manual | `docs/operations/respaldos.md` | Ensayo humano en local siguiendo la página, con fila en el registro (T-08) |

Sin unitarias: no hay reglas de dominio. Sin aislamiento nuevo: no hay consultas por actor (spec §5); la suite de
aislamiento existente debe seguir en verde. `pnpm env:check` sigue en verde (las variables son solo de compose).

## 7. Riesgos y coherencia con el diseño
- **R-1 Herramienta ausente en la imagen.** Si ADR-0041 elige una herramienta que la imagen de `postgres` no trae, hace
  falta la imagen mínima de la fila condicional y, en staging, publicarla o construirla en el Droplet (RNF-15).
  Mitigación: el ADR pesa ese costo; la fila condicional mantiene la tabla en 12.
- **R-2 Rol del volcado en staging.** Con la RLS forzada, `pg_dump` necesita un rol superusuario o con `BYPASSRLS`.
  En local lo es el dueño; en staging el rol dueño es provisional (PD-43). Mitigación: pendiente nuevo (abajo); no
  bloquea el cierre local (P-2).
- **R-3 Clave obligatoria rompe el compose de desarrollo.** Un `secret` con archivo inexistente puede hacer fallar
  `docker compose up` aunque el perfil esté apagado. Mitigación: CA-9 lo prueba; si compose lo exige, el valor por
  defecto de `BACKUP_PUBLIC_KEY_FILE` apunta a una ruta inofensiva y el script responde `BACKUP_KEY_MISSING`.
- **R-4 Soporte de ILM en el fork de MinIO** (`pgsty/silo`, ADR-0025). Mitigación: CA-7 lo prueba con la misma imagen;
  si no lo soporta, se detiene y se avisa a Adrián (RN-5 no se puede cumplir de otra forma sin ADR).
- **R-5 Zona horaria.** La imagen de `postgres` debe traer los datos de zona para `TZ`. CA-1 lo detecta.
- **R-6 Archivos de otro dueño.** `compose.yml`, `infra/minio/init.sh` y `ambientes.md` son de infraestructura
  (Adrián). Este plan pide su autorización explícita para cambiarlos (§8), como en la 011.
- **R-7 Base restaurada frente a objetos purgados.** La base vuelve al estado de hasta 24 h antes, pero lo que Nimbo
  purgó después (papelera, poda) ya no tiene ninguna versión en MinIO: esas filas restauradas apuntan a objetos que no
  existen. Mitigación: `respaldos.md` lo declara y el paso de comprobación lista las `version_archivo` cuyo objeto falta
  (mismo `HeadObject` de los conteos); no se recuperan (RN-5).
- Desviaciones de los diagramas: ninguna (no hay clases ni tablas nuevas). Sin DF nuevo. DF-28 y DF-29 siguen en 022.
- Pendientes que deja fuera (filas para `pendientes.md`, las agrega el dueño en el PR):
  copia de los respaldos a un destino externo antes de producción (RN-6); rol del volcado en staging (R-2); los
  objetos de MinIO no tienen copia fuera de su volumen (spec §7); repetir el ensayo en staging cuando exista (P-2);
  la D-11 de la spec 000 todavía remite a la 022 (`architecture.md` ya dice `(022c) backup/`).
- ADR requeridos: **ADR-0041** — cifrado, ejecutor programado y regla ILM de los respaldos (`Aceptado` el 2026-11-04, redactado
  por `architect` el 2026-11-02; 0040 queda reservado para la 022). Recomienda `gpg` asimétrico con la imagen fijada
  de `postgres` si la comprobación del ADR confirma que trae `gpg`; si no, `age` con la fila condicional. Se acepta
  antes de T-03.

## 8. Aprobación
- `architect` (tecnología nueva: herramienta de cifrado, ADR-0041): **Aprobado con cambios** — 2026-11-02. Los cambios
  ya están aplicados en este plan (un ciclo): (1) `restore.sh` en dos pasadas, verificación completa y luego
  `pg_restore --single-transaction`, sin `--no-owner`/`--no-privileges`; (2) solo la clave pública en compose
  (`BACKUP_PUBLIC_KEY_FILE`), la privada por `-v` en `restore`; (3) `entrypoint` propio del servicio `backup`;
  (4) CA-5 compara RLS y políticas de **todas** las tablas, no tres; (5) ILM por `mc ilm import` desde *heredoc*;
  (6) R-7 objetos purgados tras el respaldo. Condición: ADR-0041 `Aceptado`, con la comprobación de `gpg` en
  `pgvector/pgvector:pg17` hecha, antes de T-03. Fronteras, DAG y capas sin cambios; sin puertos ni tablas.
- Adrián: **Aprobado — Adrián, 2026-11-04**, con la autorización para cambiar `compose.yml`, `infra/minio/init.sh` y
  `docs/operations/ambientes.md` (R-6). ADR-0041 `Aceptado` el mismo día; `gpg` 2.2.40 comprobado en
  `pgvector/pgvector:pg17`, así que la fila condicional del `Dockerfile` no existe (12 archivos).
