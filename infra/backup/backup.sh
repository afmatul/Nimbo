#!/usr/bin/env bash
# infra/backup/backup.sh — respaldo cifrado de la base (spec 022c, plan §4, ADR-0041). Lo ejecuta el servicio
# `backup` del compose con la imagen fijada de Postgres (misma versión de `pg_dump` que el servidor).
#   run       una corrida inmediata: `pg_dump` custom como POSTGRES_USER, cifrado en flujo con la clave pública,
#             temporal → renombrado atómico y rotación a las 7 copias más recientes.
#   schedule  espera BACKUP_TIME (HH:MM) en la zona de TZ y corre una vez al día (D-1); no recupera días perdidos.
#   restore <archivo>  restaura una copia de /backups sobre una base vacía (`restore.sh`, con estas mismas funciones).
# Salida: una línea JSON por evento, sin stderr de las herramientas, host, usuario, contraseña ni ruta de la clave.
# Sale con 0 si todo va bien y con 1 tras escribir `backup.failed` (o `restore.failed`).
set -uo pipefail

readonly BACKUP_DIR=/backups
readonly PUBLIC_KEY_FILE=/run/secrets/backup_public_key
readonly DB_HOST=postgres
readonly KEEP_COPIES=7
readonly CONNECT_TIMEOUT_SECONDS=10
readonly DEFAULT_BACKUP_TIME=03:00
readonly LEVEL_INFO=30
readonly LEVEL_ERROR=50

correlation_id=""
run_event=backup
started_ms=0
temp_file=""
gnupg_home=""
pipeline_status=()

now_ms() { date +%s%3N; }

# log <nivel> <evento> <campos JSON adicionales, ya serializados>
log() {
  printf '{"level":%s,"time":%s,"event":"%s","correlationId":"%s"%s}\n' \
    "$1" "$(now_ms)" "$2" "$correlation_id" "${3:+,$3}"
}

# fail <code> <exitCode de la herramienta o null>: `<run_event>.failed` y salida con 1.
fail() {
  log "$LEVEL_ERROR" "$run_event.failed" \
    "\"code\":\"$1\",\"durationMs\":$(($(now_ms) - started_ms)),\"exitCode\":$2"
  exit 1
}

cleanup() {
  [[ -n "$temp_file" ]] && rm -f "$temp_file"
  if [[ -n "$gnupg_home" ]]; then
    GNUPGHOME="$gnupg_home" gpgconf --kill gpg-agent >/dev/null 2>&1
    rm -rf "$gnupg_home"
  fi
}

# Escribe el volcado cifrado en $temp_file; deja el código de salida de cada etapa en pipeline_status.
dump_encrypted() {
  PGPASSWORD="$POSTGRES_PASSWORD" PGCONNECT_TIMEOUT="$CONNECT_TIMEOUT_SECONDS" \
    pg_dump --host="$DB_HOST" --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" \
      --format=custom --no-password 2>/dev/null \
    | GNUPGHOME="$gnupg_home" gpg --batch --quiet --no-tty --trust-model always \
      --cipher-algo AES256 --encrypt --recipient-file "$PUBLIC_KEY_FILE" 2>/dev/null \
    | { cat >"$temp_file"; } 2>/dev/null
  pipeline_status=("${PIPESTATUS[@]}")
}

# Clasifica el fallo de la tubería: escribir, luego cifrar (un fallo aguas abajo corta a pg_dump con SIGPIPE).
check_pipeline() {
  local dump_status=$1 encrypt_status=$2 write_status=$3
  ((write_status == 0)) || fail BACKUP_WRITE_FAILED "$write_status"
  ((encrypt_status == 0)) || fail BACKUP_ENCRYPT_FAILED "$encrypt_status"
  ((dump_status == 0)) || fail BACKUP_DUMP_FAILED "$dump_status"
}

# Deja solo las KEEP_COPIES copias finales más recientes (el nombre ordena por fecha); imprime cuántas quedan.
rotate() {
  local copies=("$BACKUP_DIR"/nimbo-*Z.dump.gpg)
  local excess=$((${#copies[@]} - KEEP_COPIES))
  ((excess > 0)) && rm -f -- "${copies[@]:0:excess}"
  echo $((${#copies[@]} - (excess > 0 ? excess : 0)))
}

start_run() {
  correlation_id=$(cat /proc/sys/kernel/random/uuid)
  started_ms=$(now_ms)
}

require_key() {
  [[ -s "$PUBLIC_KEY_FILE" && -r "$PUBLIC_KEY_FILE" ]] || fail BACKUP_KEY_MISSING null
}

run_backup() {
  start_run
  require_key
  local final_name="nimbo-$(date -u +%Y%m%dT%H%M%SZ).dump.gpg"
  temp_file="$BACKUP_DIR/.$final_name.tmp"
  gnupg_home=$(mktemp -d) || fail BACKUP_ENCRYPT_FAILED null
  trap cleanup EXIT
  { : >"$temp_file"; } 2>/dev/null || fail BACKUP_WRITE_FAILED 1
  dump_encrypted
  check_pipeline "${pipeline_status[@]}"
  mv -f -- "$temp_file" "$BACKUP_DIR/$final_name" 2>/dev/null || fail BACKUP_WRITE_FAILED 1
  temp_file=""
  local size_bytes kept
  size_bytes=$(stat -c %s "$BACKUP_DIR/$final_name")
  kept=$(rotate)
  log "$LEVEL_INFO" backup.completed "\"backupFile\":\"$final_name\",\"sizeBytes\":$size_bytes,\
\"durationMs\":$(($(now_ms) - started_ms)),\"kept\":$kept"
}

# Segundos epoch de la próxima BACKUP_TIME en TZ: hoy si todavía no pasó, si no, mañana.
next_run_epoch() {
  local today
  today=$(date -d "today $1" +%s)
  if ((today > $(date +%s))); then echo "$today"; else date -d "tomorrow $1" +%s; fi
}

schedule() {
  local backup_time=${BACKUP_TIME:-$DEFAULT_BACKUP_TIME}
  if [[ ! "$backup_time" =~ ^([01][0-9]|2[0-3]):[0-5][0-9]$ ]]; then
    echo "BACKUP_TIME debe tener el formato HH:MM (24 h), p. ej. 03:00" >&2
    exit 1
  fi
  # Al arrancar avisa ya si falta la clave, sin esperar a la primera corrida (plan §4).
  (start_run && require_key) || true
  # Como PID 1, bash ignora SIGTERM salvo con *trap*; `wait` lo atiende durante la espera (`docker stop`).
  trap 'exit 0' TERM INT
  while true; do
    local next
    next=$(next_run_epoch "$backup_time")
    start_run
    log "$LEVEL_INFO" backup.scheduled "\"nextRunAt\":\"$(date -u -d "@$next" +%Y-%m-%dT%H:%M:%SZ)\""
    sleep $((next - $(date +%s))) &
    wait $!
    (run_backup) || true
  done
}

case "${1:-}" in
  run) run_backup ;;
  schedule) schedule ;;
  restore)
    # shellcheck source=restore.sh
    source "$(dirname "${BASH_SOURCE[0]}")/restore.sh"
    restore_backup "${2:-}"
    ;;
  *)
    echo "Uso: backup.sh <run|schedule|restore <archivo>>" >&2
    exit 2
    ;;
esac
