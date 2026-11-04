# Respaldos y restauración

> Spec 022c (RNF-21), ADR-0041. Página del **Operador**: todo se hace con acceso al servidor; Nimbo no ofrece
> pantallas, rutas de la API ni puertos para esto (CA-9). Los **respaldos de PostgreSQL** (copias cifradas de la
> base) y las **versiones de MinIO** (historial de cada objeto dentro del mismo bucket) son mecanismos distintos y se
> comprueban por separado.

## 1. Respaldo de la base de datos

El servicio `backup` del compose (perfil `backups`, apagado por defecto) vuelca la base una vez al día con `pg_dump`
en formato *custom*, cifra el flujo con `gpg` y la **clave pública** del Operador (ADR-0041) y guarda la copia en el
volumen `backup_data`, distinto del de Postgres. Conserva las **7 copias más recientes**. Los comandos se ejecutan
desde la raíz del repositorio en el servidor, con el `.env` de ese ambiente.

### 1.1 Generar el par de claves (una vez)

Se genera dentro de la imagen del servicio, sin instalar `gpg` en el host (igual en Windows y Linux). El directorio
de destino queda **fuera** del repositorio:

```bash
mkdir -p "$HOME/nimbo-claves"
docker run --rm --user "$(id -u):$(id -g)" -v "$HOME/nimbo-claves:/claves" --entrypoint bash \
  pgvector/pgvector:pg17 -c 'umask 077; export GNUPGHOME=$(mktemp -d)
    gpg --batch --quiet --passphrase "" --quick-gen-key "Respaldos Nimbo <operador@nimbo.me>" future-default default never
    gpg --batch --armor --export > /claves/respaldos.pub.asc
    gpg --batch --armor --export-secret-keys > /claves/respaldos.priv.asc'
```

- `respaldos.pub.asc` (pública) se copia al servidor, fuera del repositorio (p. ej. `/srv/nimbo-claves/`), y su ruta
  va en `BACKUP_PUBLIC_KEY_FILE` del `.env`. Es lo único que el servidor necesita para cifrar.
- `respaldos.priv.asc` (privada) **no se queda en el servidor**: va al gestor de contraseñas del equipo o a un medio
  sin conexión y se borra del disco donde se generó. No tiene frase de paso porque la restauración corre sin
  terminal; su protección es la custodia (§1.5). Nunca va al repositorio, a `.env`, a `.env.example` ni a una bitácora.

### 1.2 Encender el servicio

```bash
docker compose --profile backups up -d backup
docker compose logs backup        # backup.scheduled con nextRunAt (UTC) de la próxima corrida
```

La corrida diaria ocurre a `BACKUP_TIME` (por defecto `03:00`) en la zona `BACKUP_TZ` (por defecto
`America/Guatemala`). Si el servicio está apagado a esa hora, ese día no tiene copia y no se recupera al arrancar
(spec S-2): se nota porque falta el `backup.completed` del día. El servicio no publica puertos y solo recibe las
credenciales del dueño de la base (`POSTGRES_*`), que necesita para volcar las tablas con RLS forzada (plan D-2).

### 1.3 Respaldo bajo demanda

```bash
docker compose --profile backups run --rm backup run
```

Sale con `0` y una línea `backup.completed`, o con `1` y una línea `backup.failed` con su `code`.

### 1.4 Dónde están las copias y cómo leer la bitácora

- Volumen `backup_data` (en el host, `nimbo_backup_data`), montado en `/backups` solo dentro del servicio `backup`.
  Para listarlas: `docker compose --profile backups run --rm --entrypoint ls backup -l /backups`.
- Nombre: `nimbo-<AAAAMMDD>T<HHMMSS>Z.dump.gpg` (fecha y hora UTC del volcado). Mientras se escribe, la copia es un
  temporal oculto que solo se renombra si `pg_dump` y `gpg` terminan bien.
- Cada corrida escribe una línea JSON con su `correlationId` (`docker compose logs backup`), sin host, usuario,
  contraseñas, ruta ni contenido de la clave, ni el texto de error de las herramientas:

| Evento | Qué significa |
|---|---|
| `backup.scheduled` | `nextRunAt`: próxima corrida programada |
| `backup.completed` | `backupFile`, `sizeBytes`, `durationMs` y `kept` (copias que quedan tras rotar, máximo 7) |
| `backup.failed` | `code`, `durationMs`, `exitCode` de la herramienta; no queda archivo parcial y **no se rota** |

| `code` | Causa probable | Qué hacer |
|---|---|---|
| `BACKUP_KEY_MISSING` | `BACKUP_PUBLIC_KEY_FILE` sin definir o el archivo vacío o ilegible. Si la ruta no existe, Docker ni crea el contenedor (`bind source path does not exist`) | Corrige la ruta en `.env` y vuelve a levantar el servicio (§1.1) |
| `BACKUP_DUMP_FAILED` | Postgres caído o credenciales del dueño rechazadas | Revisa `docker compose ps postgres` y `POSTGRES_*` del `.env` |
| `BACKUP_ENCRYPT_FAILED` | El archivo de la clave pública no es una clave `gpg` válida | Vuelve a copiar `respaldos.pub.asc` |
| `BACKUP_WRITE_FAILED` | Sin espacio o sin permiso en `backup_data` | Libera espacio en el host (`docker system df`) |

### 1.5 Custodia y rotación de la clave

- Solo el Operador custodia la clave privada, fuera del servidor. Si se pierde, **ninguna copia se puede leer**: se
  guarda en dos lugares (gestor de contraseñas del equipo y un medio sin conexión).
- Rotación (cambio de Operador, sospecha de filtración o una vez por fase): genera un par nuevo (§1.1), reemplaza el
  archivo de `BACKUP_PUBLIC_KEY_FILE` y ejecuta `docker compose --profile backups up -d --force-recreate backup`.
  Conserva la privada **anterior** hasta que rote la última copia cifrada con ella (7 copias, una semana); para
  restaurar en esa semana sirve un archivo con las dos privadas concatenadas (`gpg` importa ambas).
- Si la privada se filtró: rota la clave, ejecuta un respaldo bajo demanda (§1.3) y borra las copias anteriores del
  volumen, que ya no están protegidas.

### 1.6 Antes de producción y en staging

- **Copia externa (RN-6):** las copias viven en el mismo servidor que la base. Antes de producción se llevan además a
  un destino externo; destino y frecuencia están pendientes (PD-170). Lo mismo vale para los objetos de MinIO, que no
  tienen copia fuera de su volumen (PD-171).
- **Staging (R-2):** `pg_dump` necesita un rol que salte la RLS forzada (superusuario o `BYPASSRLS`). En local lo es
  el dueño; en staging el rol dueño todavía es provisional (PD-43); el rol del volcado y el ensayo en staging se definen y
  repiten cuando exista (PD-173).

## 2. Restaurar la base de datos

Se restaura **sobre una base vacía**: un volumen de Postgres nuevo, que el compose inicializa con el rol `nimbo_app`
(spec S-5). Así el dueño, los `GRANT` y las políticas de RLS vuelven intactos (plan D-4). Solo con datos sintéticos o
del propio ambiente de pruebas: restaurar sobre cuentas reales queda fuera de alcance (spec §7).

### 2.1 Qué hace `restore` y sus errores

`docker compose --profile backups run --rm -v <privada>:/run/secrets/backup_private_key:ro backup restore <copia>`:

1. `<copia>` es el nombre de una copia final del volumen (`nimbo-<AAAAMMDD>T<HHMMSS>Z.dump.gpg`, §1.4).
2. Se niega si la base destino tiene alguna tabla en `public`, antes de escribir nada.
3. **Primera pasada:** descifra la copia completa sin guardarla. Si la clave no es la que la cifró, falta o la copia
   está alterada o cortada, se detiene sin tocar la base.
4. **Segunda pasada:** descifra en flujo hacia `pg_restore` en **una sola transacción**: cualquier error la revierte
   entera y la base queda vacía otra vez.

| `code` (`restore.failed`) | Causa | Qué hacer |
|---|---|---|
| `RESTORE_FILE_NOT_FOUND` | El nombre no es el de una copia final o no está en `backup_data` | Lista las copias (§1.4) y copia el nombre exacto |
| `RESTORE_TARGET_NOT_EMPTY` | La base destino ya tiene tablas | No es un volumen nuevo: repite §2.4 |
| `RESTORE_KEY_INVALID` | Clave privada sin montar, de otro par, o copia alterada o cortada | Monta la privada que corresponde a la pública de esa fecha (§1.5) o prueba con otra copia |
| `RESTORE_FAILED` | Base inalcanzable o `pg_restore` falló (se revirtió todo) | Revisa `docker compose ps postgres`; repite desde §2.4 |

Si termina bien escribe `restore.completed` con `backupFile` y `durationMs`. La bitácora nunca incluye la clave ni su
ruta, credenciales ni el texto de error de `pg_restore`.

### 2.2 Datos sintéticos del ensayo

El ensayo (RNF-21, una vez por fase) usa solo datos inventados (RNF-16): en local, dos cuentas de prueba creadas desde
Nimbo con carpetas y archivos de relleno. La misma restauración corre de punta a punta, con el corpus sintético de
`apps/api/test/support/backup-corpus.ts` y en contenedores propios, en
`pnpm --filter api exec jest -c jest.int.config.cjs test/int/operations/backup-restore` (CA-4, CA-5, CA-6). Ese
corpus no tiene comando para la base local: crea y borra sus datos dentro de la prueba.

### 2.3 Anotar los conteos y respaldar (antes)

Desde la raíz del repositorio, con el `.env` cargado (`set -a; . ./.env; set +a`) y los archivos de trabajo fuera
del repositorio:

```bash
conteos() {
  docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -F ' ' <<'SQL'
SELECT 'plan', count(*) FROM plan UNION ALL SELECT 'usuario', count(*) FROM usuario
UNION ALL SELECT 'suscripcion', count(*) FROM suscripcion UNION ALL SELECT 'carpeta', count(*) FROM carpeta
UNION ALL SELECT 'archivo', count(*) FROM archivo UNION ALL SELECT 'version_archivo', count(*) FROM version_archivo
UNION ALL SELECT 'evento_auditoria', count(*) FROM evento_auditoria UNION ALL SELECT 'fragmento', count(*) FROM fragmento
UNION ALL SELECT 'migracion', count(*) FROM migracion
UNION ALL SELECT 'tablas_rls_forzada', count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relforcerowsecurity
UNION ALL SELECT 'politicas', count(*) FROM pg_policies WHERE schemaname = 'public';
SQL
}
conteos > "$HOME/nimbo-ensayo/conteos-antes.txt"
docker compose --profile backups run --rm backup run      # anota backupFile y durationMs de la línea
```

Las tablas son las de los conteos de control del plan 022c §3 (`CONTROL_TABLES` de `backup-corpus.ts`), más la RLS.

### 2.4 Apagar las apps y preparar un volumen nuevo, conservando el anterior

```bash
docker compose --profile apps --profile backups stop api worker worker-optimizer web backup  # o detén `pnpm dev`
docker compose stop postgres && docker compose rm -f postgres
docker volume create nimbo_postgres_data_previo
docker run --rm -v nimbo_postgres_data:/desde:ro -v nimbo_postgres_data_previo:/hacia \
  --entrypoint cp pgvector/pgvector:pg17 -a /desde/. /hacia/
docker volume rm nimbo_postgres_data
docker compose up -d --wait postgres       # volumen nuevo: crea la base vacía y `nimbo_app`
```

`nimbo_postgres_data_previo` es la vuelta atrás: no se borra hasta terminar §2.6.

### 2.5 Restaurar

Trae la clave privada al servidor solo para esta corrida (p. ej. `$HOME/nimbo-claves/respaldos.priv.asc`, legible
solo por ti) y móntala con `-v`; nunca la pongas en `.env` ni en `BACKUP_PUBLIC_KEY_FILE`:

```bash
docker compose --profile backups run --rm \
  -v "$HOME/nimbo-claves/respaldos.priv.asc:/run/secrets/backup_private_key:ro" \
  backup restore nimbo-<AAAAMMDD>T<HHMMSS>Z.dump.gpg
```

En cuanto termine, borra la privada del servidor (`shred -u` en Linux o borrado seguro) y vuelve a guardarla solo en
su custodia (§1.5).

### 2.6 Comprobar

1. `pnpm --filter api migration:run` → `{"event":"migration.run","applied":[]}` (ninguna pendiente).
2. Arranca la API (`pnpm dev` o `docker compose --profile apps up -d api`) y
   `curl -s -o /dev/null -w '%{http_code}\n' http://localhost/api/v1/health/ready` → `200`. La API solo arranca como
   `nimbo_app` (`DatabaseRoleCheck`), así que esto también comprueba el rol.
3. `conteos > "$HOME/nimbo-ensayo/conteos-despues.txt"` y
   `diff "$HOME/nimbo-ensayo/conteos-antes.txt" "$HOME/nimbo-ensayo/conteos-despues.txt"` → sin diferencias.
4. Objetos que faltan (abajo, §2.7).
5. Si todo está bien: `docker volume rm nimbo_postgres_data_previo`, vuelve a encender `backup` (§1.2) y anota la
   fila en el registro (§5). Si algo falló: `docker compose stop postgres && docker compose rm -f postgres`, borra
   `nimbo_postgres_data`, cópiale de vuelta `nimbo_postgres_data_previo` con el mismo `docker run … cp -a` y levanta
   `postgres`.

### 2.7 Objetos que Nimbo purgó después del respaldo (R-7)

La base vuelve al momento del respaldo (hasta 24 h antes), pero lo que Nimbo **purgó después** (vaciar o expirar la
papelera, poda de versiones) ya no tiene ninguna versión en MinIO (§3.6): esas filas de `version_archivo` restauradas
apuntan a objetos que no existen. Nimbo las muestra, pero no puede entregar su contenido. Para listarlas (con
`MC_HOST_local` de §3.2):

```bash
docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At \
  -c 'SELECT clave_objeto FROM version_archivo' | LC_ALL=C sort > "$HOME/nimbo-ensayo/claves-base.txt"
docker compose run --rm -T -e MC_HOST_local --entrypoint mc minio-init find "local/$MINIO_BUCKET" </dev/null \
  | sed "s#^local/$MINIO_BUCKET/##" | LC_ALL=C sort > "$HOME/nimbo-ensayo/claves-minio.txt"
comm -23 "$HOME/nimbo-ensayo/claves-base.txt" "$HOME/nimbo-ensayo/claves-minio.txt"   # filas sin objeto
```

No se recuperan (RN-5). Anota cuántas son en el registro (§5) y avísale a Adrián; en el ensayo con datos sintéticos lo
esperado es cero.

## 3. Recuperar la versión anterior de un objeto

Sirve para un objeto de MinIO **sobrescrito o borrado fuera de Nimbo** (por ejemplo, con `mc` o el SDK de S3 contra el
bucket) en los últimos 7 días (CA-8). La base no cambia: la clave del objeto es la misma, así que en cuanto la
versión anterior vuelve a ser la vigente, Nimbo entrega otra vez sus bytes.

### 3.1 Cómo se conservan las versiones

- El bucket tiene versionado activo y **una sola regla de ciclo de vida**: las versiones **no vigentes** expiran a
  los **7 días** (`NoncurrentVersionExpiration`). La versión vigente nunca expira. `minio-init` (`infra/minio/init.sh`)
  la aplica en cada arranque y reemplaza la configuración completa, así que no se duplica (CA-7).
- Cada versión de un archivo de Nimbo es su propio objeto, con clave `u/{propietario}/{archivo}/{versión}` (columna
  `version_archivo.clave_objeto`): el historial de versiones de Nimbo no depende de esta regla.
- Para ver la regla vigente: `mcn ilm rule list "local/$MINIO_BUCKET"` (con el alias del paso 3.2).

### 3.2 Preparar `mc`

Los comandos corren con la imagen de `minio-init` (D-6), desde la raíz del repositorio en el servidor y con MinIO
encendido. El alias `local` se pasa por la variable `MC_HOST_local`, que `mc` lee del ambiente; así la contraseña no
aparece en la línea de comandos de `docker`:

```bash
set -a; . ./.env; set +a
export MC_HOST_local="http://${MINIO_ROOT_USER}:${MINIO_ROOT_PASSWORD}@minio:9000"
mcn() { docker compose run --rm -e MC_HOST_local --entrypoint mc minio-init "$@"; }
CLAVE='u/<propietario>/<archivo>/<versión>'   # la clave afectada
```

Si la contraseña de MinIO tiene caracteres reservados de URL (`@`, `:`, `/`, `%`…), escríbelos codificados (`%40`…)
en `MC_HOST_local`. Al terminar: `unset MC_HOST_local`.

### 3.3 Listar las versiones de la clave

```bash
mcn ls --versions "local/$MINIO_BUCKET/$CLAVE"
```

Cada línea es una versión, de la más reciente a la más antigua: fecha, tamaño, `versionId`, `vN` (la de mayor `N` es
la vigente) y `PUT` (contenido) o `DEL` (marca de borrado). Si no aparece ninguna línea, no hay nada que recuperar
(§3.6).

### 3.4 Objeto sobrescrito: volver a hacer vigente la versión anterior

La línea de arriba es un `PUT` con el contenido equivocado. Copia la versión buena (la `PUT` anterior) sobre la misma
clave; queda como vigente y la equivocada pasa a no vigente (expira a los 7 días):

```bash
mcn cp --version-id <versionId de la versión buena> "local/$MINIO_BUCKET/$CLAVE" "local/$MINIO_BUCKET/$CLAVE"
```

### 3.5 Objeto borrado: quitar la marca de borrado

La línea de arriba es un `DEL`. Borra solo esa marca; la `PUT` de debajo vuelve a ser la vigente:

```bash
mcn rm --version-id <versionId de la marca DEL> "local/$MINIO_BUCKET/$CLAVE"
```

Comprueba con `mcn ls --versions …` que la línea de arriba es la `PUT` esperada y, en Nimbo, que el archivo vuelve a
descargarse (o abrirse) con su contenido anterior.

### 3.6 Qué no se recupera

- Lo que **Nimbo purga a propósito** (vaciar o expirar la papelera, 006; poda de versiones, 014): pasa por
  `IObjectStorage.purgeObject`, que borra todas las versiones y marcas de borrado de la clave. No queda nada en MinIO.
- Versiones no vigentes de **más de 7 días**: la regla de ciclo de vida ya las borró.
- La pérdida del volumen `minio_data`: las versiones viven en el mismo bucket, no son una copia externa.
- Cambios en la base de datos: para eso está la restauración (§2).

## 4. Revertir la configuración

Para deshacer la 022c en un ambiente:

1. **Respaldos:** `docker compose --profile backups stop backup && docker compose --profile backups rm -f backup`.
   Las copias siguen en `nimbo_backup_data`; bórralo (`docker volume rm nimbo_backup_data`) solo cuando ya no hagan
   falta. Después se quita el servicio `backup`, el volumen y el secreto de `compose.yml` y las tres variables
   `BACKUP_*` del `.env` (revertir los commits de la 022c).
2. **Ciclo de vida de MinIO:** primero se revierte `infra/minio/init.sh` (si no, `minio-init` vuelve a aplicar la
   regla en el próximo arranque) y luego, con `mcn` de §3.2, se borra la configuración:
   `mcn ilm rule rm --all --force "local/$MINIO_BUCKET"`. `mcn ilm rule list "local/$MINIO_BUCKET"` debe responder
   que no hay configuración. El versionado del bucket se queda (es de la 000).
3. Ni la base ni los objetos cambian al revertir: no hay migraciones.

## 5. Registro de pruebas

Una fila por ensayo de restauración o de recuperación de versión (RNF-21), con datos sintéticos.

| Fecha | Respaldo | Duración | Resultado | Quién |
|---|---|---|---|---|
