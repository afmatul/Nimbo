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

Pendiente (022c T-07): restaurar sobre un volumen nuevo, comprobar y qué pasa con los objetos que Nimbo purgó
después del respaldo.

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

Pendiente (022c T-06 y T-07): apagar el perfil `backups` y volver a importar una configuración de ciclo de vida
vacía en el bucket.

## 5. Registro de pruebas

Una fila por ensayo de restauración o de recuperación de versión (RNF-21), con datos sintéticos.

| Fecha | Respaldo | Duración | Resultado | Quién |
|---|---|---|---|---|
