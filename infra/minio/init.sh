#!/bin/sh
# Inicialización de MinIO (servicio `minio-init` del compose): crea el bucket con versionado (D-7 del plan 000).
# Idempotente: se puede ejecutar en cada arranque.
set -eu

mc alias set local http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD"
mc mb --ignore-existing "local/$MINIO_BUCKET"
mc version enable "local/$MINIO_BUCKET"
echo "minio-init: bucket '$MINIO_BUCKET' listo con versionado"
