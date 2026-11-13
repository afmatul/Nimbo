#!/bin/sh
# Entrypoint de las imágenes `nimbo-api` y `nimbo-worker` (docs/operations/deploya.md). Fuera de Deploya no hace nada:
# sin ninguna variable `DEPLOYA_*` (compose y staging) solo ejecuta el comando. Dentro de Deploya:
#   1. traduce las variables inyectadas de los recursos de datos a las de Nimbo, sin pisar las del usuario
#      (`dist/scripts/print-deploya-env.js`): DATABASE_URL de `nimbo_app`, DATABASE_MIGRATION_URL del dueño, MINIO_*;
#   2. con `--migrate` (solo la imagen del `api`): crea o actualiza el rol `nimbo_app` y corre las migraciones;
#      después, con `SEED_ON_START=true`, siembra los datos de demostración (`dist/scripts/seed.js`, idempotente). Si la
#      semilla falla el contenedor arranca igual: la app no depende de ella y el siguiente arranque la reintenta;
#   3. reemplaza el shell por el comando (`exec`): el CMD de la imagen o el `comandoInicio` del proyecto.
set -eu

migrate=0
if [ "${1:-}" = "--migrate" ]; then
  migrate=1
  shift
fi

if env | grep -q '^DEPLOYA_[A-Z0-9_]*=.'; then
  exports=$(node dist/scripts/print-deploya-env.js)
  eval "$exports"
  if [ "$migrate" = 1 ]; then
    node dist/scripts/ensure-app-role.js
    node dist/scripts/migrate.js run
    if [ "${SEED_ON_START:-false}" = true ]; then
      node dist/scripts/seed.js || echo '{"event":"seed.skipped","reason":"la semilla falló; la app arranca igual"}' >&2
    fi
  fi
fi

exec "$@"
