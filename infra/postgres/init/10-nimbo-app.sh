# infra/postgres/init/10-nimbo-app.sh — lo ejecuta el entrypoint de Postgres (volumen nuevo) o `pnpm db:app-role`.
# Sin `set -e`: el entrypoint puede cargarlo con `source`. Falla si falta la contraseña.
psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
     -v app_password="${NIMBO_APP_DB_PASSWORD:?falta NIMBO_APP_DB_PASSWORD}" <<'SQL'
SELECT 'CREATE ROLE nimbo_app' WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nimbo_app') \gexec
ALTER ROLE nimbo_app WITH LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION INHERIT
  PASSWORD :'app_password';
SQL
