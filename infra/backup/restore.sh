# infra/backup/restore.sh — restaura una copia de `backup.sh` sobre una base vacía (spec 022c, plan §2, ADR-0041).
# No se ejecuta solo: lo carga `backup.sh restore <archivo>` (entrypoint del servicio `backup`) y usa sus constantes y
# funciones de bitácora (`log`, `fail`, `start_run`, `cleanup`).
#   1. La copia debe ser un archivo final de /backups          → si no, RESTORE_FILE_NOT_FOUND
#   2. La base destino no puede tener tablas en `public`        → si las tiene, RESTORE_TARGET_NOT_EMPTY (no escribe)
#   3. Primera pasada: descifra la copia entera hacia /dev/null → clave ausente u otra, o archivo alterado o cortado:
#      RESTORE_KEY_INVALID sin tocar la base
#   4. Segunda pasada: descifra en flujo hacia `pg_restore --single-transaction --exit-on-error`, sin `--no-owner` ni
#      `--no-privileges` (dueño, GRANT y políticas vuelven intactos); cualquier error revierte todo: RESTORE_FAILED
# La clave privada la monta el Operador con `-v` solo en esta corrida; se importa en un GNUPGHOME temporal.

readonly PRIVATE_KEY_FILE=/run/secrets/backup_private_key
readonly BACKUP_NAME_PATTERN='^nimbo-[0-9]{8}T[0-9]{6}Z\.dump\.gpg$'

# Imprime cuántas tablas tiene `public` en la base destino; falla si no se puede consultar.
count_public_tables() {
  PGPASSWORD="$POSTGRES_PASSWORD" PGCONNECT_TIMEOUT="$CONNECT_TIMEOUT_SECONDS" \
    psql --no-psqlrc --host="$DB_HOST" --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" --no-password \
      --tuples-only --no-align --quiet \
      --command="SELECT count(*) FROM pg_tables WHERE schemaname = 'public'" 2>/dev/null
}

require_empty_target() {
  local tables
  tables=$(count_public_tables) || fail RESTORE_FAILED $?
  [[ "$tables" == 0 ]] || fail RESTORE_TARGET_NOT_EMPTY null
}

import_private_key() {
  [[ -s "$PRIVATE_KEY_FILE" && -r "$PRIVATE_KEY_FILE" ]] || fail RESTORE_KEY_INVALID null
  GNUPGHOME="$gnupg_home" gpg --batch --quiet --no-tty --import "$PRIVATE_KEY_FILE" >/dev/null 2>&1 \
    || fail RESTORE_KEY_INVALID $?
}

decrypt() {
  GNUPGHOME="$gnupg_home" gpg --batch --quiet --no-tty --decrypt "$1" 2>/dev/null
}

# Segunda pasada: un corte del flujo o un error de `pg_restore` revierte la transacción completa.
restore_into_target() {
  decrypt "$1" \
    | PGPASSWORD="$POSTGRES_PASSWORD" PGCONNECT_TIMEOUT="$CONNECT_TIMEOUT_SECONDS" \
      pg_restore --host="$DB_HOST" --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" --no-password \
        --single-transaction --exit-on-error >/dev/null 2>&1
  local statuses=("${PIPESTATUS[@]}")
  ((statuses[0] == 0 && statuses[1] == 0)) || fail RESTORE_FAILED "${statuses[1]}"
}

# restore_backup <nombre de la copia en /backups>
restore_backup() {
  run_event=restore
  start_run
  local name=$1
  [[ "$name" =~ $BACKUP_NAME_PATTERN && -f "$BACKUP_DIR/$name" && -r "$BACKUP_DIR/$name" ]] \
    || fail RESTORE_FILE_NOT_FOUND null
  require_empty_target
  gnupg_home=$(mktemp -d) || fail RESTORE_FAILED null
  trap cleanup EXIT
  import_private_key
  decrypt "$BACKUP_DIR/$name" >/dev/null || fail RESTORE_KEY_INVALID $?
  restore_into_target "$BACKUP_DIR/$name"
  log "$LEVEL_INFO" restore.completed \
    "\"backupFile\":\"$name\",\"durationMs\":$(($(now_ms) - started_ms))"
}
