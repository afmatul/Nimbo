#!/bin/sh
# Inicialización de MinIO (servicio `minio-init` del compose): crea el bucket con versionado (D-7 del plan 000) y le
# aplica una sola regla de ciclo de vida que expira las versiones no vigentes a los 7 días (022c CA-7, ADR-0041).
# Idempotente: se puede ejecutar en cada arranque. `mc ilm import` reemplaza la configuración completa, así que
# repetirlo no duplica la regla; la versión vigente de un objeto nunca expira.
set -eu

mc alias set local http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD"
mc mb --ignore-existing "local/$MINIO_BUCKET"
mc version enable "local/$MINIO_BUCKET"
mc ilm import "local/$MINIO_BUCKET" <<'JSON'
{
  "Rules": [
    {
      "ID": "versiones-no-vigentes-7-dias",
      "Status": "Enabled",
      "Filter": { "Prefix": "" },
      "NoncurrentVersionExpiration": { "NoncurrentDays": 7 }
    }
  ]
}
JSON
echo "minio-init: bucket '$MINIO_BUCKET' listo con versionado y versiones no vigentes por 7 días"
