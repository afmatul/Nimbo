#!/usr/bin/env bash
# scripts/ci/migrations-roundtrip.sh — CA-11 y CA-12 de la spec 000 (paso de migraciones del job `integration`).
# Recorre toda la cadena: run → revert hasta vaciar → run, y afirma el estado tras cada tramo. Un `down` que lanza
# falla al revertir; uno vacío deja tablas tras revertir todo, o un esquema distinto en el segundo `run`.
# Requiere el Postgres de `compose.yml` levantado y un `.env` con `DATABASE_MIGRATION_URL` (en CI: copia de
# `.env.example`). Exige una base vacía: contra la de desarrollo se detiene en «antes» sin tocar nada. Para probarlo
# en local, usa otro proyecto: `COMPOSE_PROJECT_NAME=nimbo-ci-prueba docker compose up -d --wait postgres`.
set -euo pipefail

MIGRATIONS_DIR="apps/api/src/migrations"

# Una fila de `migracion` por archivo de migración; `data-source.cli.ts` no es una migración.
expected=$(find "$MIGRATIONS_DIR" -maxdepth 1 -name '*.ts' ! -name 'data-source*' | wc -l | tr -d ' ')

sql() {
  docker compose exec -T postgres sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "$1"' _ "$1"
}

rows() {
  # Postgres resuelve las tablas al analizar la consulta: sin la tabla, un `CASE` que la nombre igual falla.
  if [[ "$(sql "SELECT count(*) FROM pg_tables WHERE schemaname = 'public' AND tablename = 'migracion'")" == 0 ]]; then
    echo 0
  else
    sql "SELECT count(*) FROM migracion"
  fi
}

has_vector() {
  sql "SELECT count(*) FROM pg_extension WHERE extname = 'vector'"
}

# Tablas que quedan aparte de la de control de TypeORM (que nunca se borra).
leftover_tables() {
  sql "SELECT count(*) FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'migracion'"
}

# Esquema sin la tabla de control, sin comentarios y sin las líneas `\restrict` (clave aleatoria) de pg_dump 17.
schema() {
  docker compose exec -T postgres sh -c 'pg_dump --schema-only --exclude-table=migracion -U "$POSTGRES_USER" "$POSTGRES_DB"' |
    grep -vE '^(--|.(un)?restrict )'
}

assert_state() {
  local label=$1 want_rows=$2 want_vector=$3
  local got_rows got_vector
  got_rows=$(rows)
  got_vector=$(has_vector)
  if [[ "$got_rows" != "$want_rows" || "$got_vector" != "$want_vector" ]]; then
    echo "::error::${label}: migracion=${got_rows} (esperado ${want_rows}), vector=${got_vector} (esperado ${want_vector})"
    exit 1
  fi
  echo "${label}: migracion=${got_rows}, vector=${got_vector}"
}

run_all() {
  pnpm --filter api migration:run
}

revert_all() {
  local remaining after
  remaining=$(rows)
  while [[ "$remaining" -gt 0 ]]; do
    pnpm --filter api migration:revert
    after=$(rows)
    if [[ "$after" -ge "$remaining" ]]; then
      echo "::error::migration:revert no quitó ninguna fila (quedan ${after})"
      exit 1
    fi
    remaining=$after
  done
}

assert_state "antes" 0 0
run_all
assert_state "tras run" "$expected" 1
first_schema=$(schema)
revert_all
assert_state "tras revertir todo" 0 0
if [[ "$(leftover_tables)" != 0 ]]; then
  echo "::error::tras revertir todo quedan tablas: hay un down que no deshace su up (CA-12)"
  exit 1
fi
run_all
assert_state "tras el segundo run" "$expected" 1
if [[ "$(schema)" != "$first_schema" ]]; then
  echo "::error::el esquema del segundo run difiere del primero: algún down no es el inverso de su up (CA-11)"
  exit 1
fi
echo "migraciones: ida, vuelta e ida idénticas (${expected})"
