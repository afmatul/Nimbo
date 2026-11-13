#!/bin/bash
# Arranque de ONLYOFFICE Docs en Deploya (infra/deploya/onlyoffice/Dockerfile), todo como el usuario `ds`:
#   1. escribe `local.json` con la base de Deploya (`PG*`), la clave JWT compartida con el api y un secreto de
#      enlaces de caché nuevo en cada arranque (la caché es efímera);
#   2. crea las tablas de ONLYOFFICE en su propio esquema (idempotente);
#   3. levanta RabbitMQ, docservice, converter y nginx (en `PORT`). Si uno muere, el contenedor sale y Deploya lo
#      reinicia.
# Nunca imprime contraseñas ni la clave JWT.
set -eu

CONF_DIR=/etc/onlyoffice/documentserver
DS=/var/www/onlyoffice/documentserver
RUN_DIR=/tmp/onlyoffice

log() { printf '{"event":"%s"%s}\n' "$1" "${2:-}"; }
falla() { log onlyoffice.config_invalid ",\"falta\":\"$1\""; exit 1; }

: "${ONLYOFFICE_JWT_SECRET:=${JWT_SECRET:-}}"
[ -n "$ONLYOFFICE_JWT_SECRET" ] || falla ONLYOFFICE_JWT_SECRET
[ "${#ONLYOFFICE_JWT_SECRET}" -ge 32 ] || falla "ONLYOFFICE_JWT_SECRET (32 caracteres o más)"
for variable in PGHOST PGUSER PGPASSWORD PGDATABASE; do
  eval "valor=\${$variable:-}"
  [ -n "$valor" ] || falla "$variable (comparte el PostgreSQL de nimbo-api o agrega uno en Datos)"
done
export PGPORT="${PGPORT:-5432}"
ESQUEMA="${ONLYOFFICE_DB_SCHEMA:-onlyoffice}"
case "$ESQUEMA" in *[!a-z0-9_]* | [0-9]* | '') falla "ONLYOFFICE_DB_SCHEMA (solo a-z, 0-9 y _)" ;; esac
PERMITIR_IP_PRIVADA="${ONLYOFFICE_ALLOW_PRIVATE_IP:-false}"
case "$PERMITIR_IP_PRIVADA" in true | false) ;; *) falla "ONLYOFFICE_ALLOW_PRIVATE_IP (true o false)" ;; esac

# Cadena JSON con `\` y `"` escapados; los valores de Deploya y la clave no llevan saltos de línea.
json() { printf '"%s"' "$(printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g')"; }

mkdir -p "$RUN_DIR/nginx" "$RUN_DIR/rabbitmq/mnesia" "$RUN_DIR/rabbitmq/log" /tmp/.cache
ENLACE_CACHE="$(openssl rand -hex 16)"
JWT="$(json "$ONLYOFFICE_JWT_SECRET")"

cat > "$CONF_DIR/local.json" <<EOF
{
  "services": {
    "CoAuthoring": {
      "sql": {
        "type": "postgres",
        "dbHost": $(json "$PGHOST"),
        "dbPort": $(json "$PGPORT"),
        "dbName": $(json "$PGDATABASE"),
        "dbUser": $(json "$PGUSER"),
        "dbPass": $(json "$PGPASSWORD"),
        "pgPoolExtraOptions": { "options": "-c search_path=$ESQUEMA" }
      },
      "token": { "enable": { "browser": true, "request": { "inbox": true, "outbox": true } } },
      "secret": {
        "browser": { "string": $JWT },
        "inbox": { "string": $JWT },
        "outbox": { "string": $JWT },
        "session": { "string": $JWT }
      },
      "request-filtering-agent": {
        "allowPrivateIPAddress": $PERMITIR_IP_PRIVADA,
        "allowMetaIPAddress": $PERMITIR_IP_PRIVADA
      }
    }
  },
  "rabbitmq": { "url": "amqp://guest:guest@127.0.0.1:5672" },
  "storage": { "fs": { "secretString": "$ENLACE_CACHE" } },
  "wopi": { "enable": false }
}
EOF

PGOPTIONS="-c search_path=$ESQUEMA" export PGOPTIONS
psql -q -v ON_ERROR_STOP=1 -c "CREATE SCHEMA IF NOT EXISTS \"$ESQUEMA\"" >/dev/null
psql -q -v ON_ERROR_STOP=1 -f "$DS/server/schema/postgresql/createdb.sql" >/dev/null
unset PGOPTIONS
log onlyoffice.db_ready ",\"esquema\":\"$ESQUEMA\""

sed -e "s/__PORT__/${PORT:-8080}/" -e "s/__SECURE_LINK__/$ENLACE_CACHE/" /etc/onlyoffice/deploya/nginx.conf \
  > "$RUN_DIR/nginx/nginx.conf"

# RabbitMQ sin el envoltorio de /usr/sbin (exige root): mismo binario, directorios propios en /tmp.
export RABBITMQ_MNESIA_BASE="$RUN_DIR/rabbitmq/mnesia" RABBITMQ_LOG_BASE="$RUN_DIR/rabbitmq/log" \
  RABBITMQ_PID_FILE="$RUN_DIR/rabbitmq/pid" RABBITMQ_NODENAME=rabbit@localhost RABBITMQ_NODE_IP_ADDRESS=127.0.0.1 \
  RABBITMQ_LOGS=- RABBITMQ_SERVER_ADDITIONAL_ERL_ARGS="+S 1:1 +A 4"
/usr/lib/rabbitmq/bin/rabbitmq-server >/dev/null 2>&1 &
for _ in $(seq 1 60); do
  (exec 3<>/dev/tcp/127.0.0.1/5672) 2>/dev/null && break
  sleep 1
done
log onlyoffice.rabbitmq_ready

(cd "$DS/server/DocService" && PKG_NATIVE_CACHE_PATH=/tmp/.cache exec ./docservice) &
(cd "$DS/server/FileConverter" && LD_LIBRARY_PATH="$DS/server/FileConverter/bin" exec ./converter) &
nginx -c "$RUN_DIR/nginx/nginx.conf" &
log onlyoffice.started ",\"port\":${PORT:-8080}"

# El primero que termine (o falle) tumba el contenedor: Deploya lo reinicia entero.
sleep 10
while :; do
  for proceso in docservice converter nginx beam.smp; do
    pgrep -x "$proceso" >/dev/null || { log onlyoffice.process_exited ",\"proceso\":\"$proceso\""; exit 1; }
  done
  sleep 5
done
