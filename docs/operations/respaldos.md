# Respaldos y restauración

> Spec 022c (RNF-21), ADR-0041. Página del **Operador**: todo se hace con acceso al servidor; Nimbo no ofrece
> pantallas, rutas de la API ni puertos para esto (CA-9). Los **respaldos de PostgreSQL** (copias cifradas de la
> base) y las **versiones de MinIO** (historial de cada objeto dentro del mismo bucket) son mecanismos distintos y se
> comprueban por separado.

## 1. Respaldo de la base de datos

Pendiente (022c T-03 a T-06): encender el servicio, respaldo bajo demanda, dónde están las copias y custodia de la clave.

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
