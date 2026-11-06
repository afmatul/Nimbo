# Tareas 022c — Respaldos y restauración

> Spec: `./spec.md` · Plan: `./plan.md`
> 5 a 12 tareas verticales, de medio día a un día, un commit cada una (`feat(infra): … [022c T-xx]`).
> Cada tarea es una línea: criterio, prueba y de qué depende. Los archivos viven en `plan.md`. Sin tareas de «cierre».
> Ninguna empieza sin el plan `Aprobado`; T-03 en adelante, además, con ADR-0041 `Aceptado`.
> Esfuerzo ≈ 4 días-persona, la suma de las tareas (plan §2, «Tamaño»).

- [x] **T-01** Regla única de ciclo de vida (versiones no vigentes, 7 días) en `minio-init`, idempotente (0,5 d) — CA: CA-7 — Prueba: integración primero (`object-versions.int-spec.ts`, `init.sh` dos veces) — Depende: —
- [x] **T-02** Recuperar la versión anterior de un objeto sobrescrito o borrado fuera de Nimbo con `mc`, y su sección en `respaldos.md` (0,25 d) — CA: CA-8 — Prueba: integración primero (corpus mínimo de objetos, bytes originales; nada tras `purgeObject`) — Depende: T-01
- [x] **T-03** Corpus sintético sobre el mundo de aislamiento y conteos de control + `backup.sh run`: volcado *custom* cifrado en flujo al volumen propio, con `backup.completed` (0,75 d) — CA: CA-1 (resultado), CA-4 (archivo ilegible) — Prueba: integración primero (`backup-service.int-spec.ts`) — Depende: ADR-0041 `Aceptado` (con `gpg` comprobado en la imagen)
- [x] **T-04** Fallos del respaldo: códigos, sin temporal, copias previas intactas y bitácora sin secretos (0,5 d) — CA: CA-2 — Prueba: integración primero (contraseña errónea, clave ausente, escritura imposible) — Depende: T-03
- [x] **T-05** Rotación a las 7 copias más recientes (0,25 d) — CA: CA-3 — Prueba: integración primero (8 corridas) — Depende: T-03
- [x] **T-06** Servicio `backup` en compose (perfil `backups`, volumen `backup_data`, secreto de la clave, `schedule` con `BACKUP_TIME`/`TZ`), `.env.example` y `ambientes.md` (0,5 d) — CA: CA-1, CA-9 — Prueba: integración primero (hora a un minuto; forma del compose con y sin perfil) — Depende: T-03
- [x] **T-07** `restore.sh` sobre base vacía con negativa a base con tablas y a otra clave, y el procedimiento de restauración en `respaldos.md` (0,75 d) — CA: CA-4, CA-5, CA-6 — Prueba: integración primero (`backup-restore.int-spec.ts`: conteos, `applied: []`, RLS, `health/ready` 200) — Depende: T-03, T-06
- [x] **T-08** **(humana, Abel como Operador)** Ensayo en local siguiendo `respaldos.md` (respaldo, restauración sobre volumen nuevo, recuperación de una versión) y fila en su registro; nota en el PR (0,5 d) — CA: CA-5, CA-8 — Depende: T-02, T-07

## Notas del developer
- **T-06, usuario del servicio `backup`: `root`** (el de la imagen; plan sin indicación). El volumen nombrado
  `backup_data` nace de `root` (la imagen no trae `/backups`) y la clave privada que el Operador monta con `-v` en
  `restore` suele tener permisos `600` de su dueño en el host: con `postgres` (uid 999) ninguna de las dos funcionaría
  sin un `chown` en el arranque. El servicio no publica puertos, no tiene `env_file` y solo recibe `POSTGRES_*`,
  `BACKUP_TIME` y `TZ`; las pruebas del script siguen corriéndolo como `postgres`, así que no depende de `root`.
- **T-06, R-3:** `docker compose config` sin el perfil no exige `BACKUP_PUBLIC_KEY_FILE` (comprobado), pero sin
  valor avisaba «variable is not set»: el secreto usa `${BACKUP_PUBLIC_KEY_FILE:-/dev/null}` y el script responde
  `BACKUP_KEY_MISSING` (probado con el servicio real). Con una ruta inexistente, Docker no crea el contenedor
  (`bind source path does not exist`); queda documentado en `respaldos.md` §1.4.
- **T-06, prueba de CA-1/CA-9:** `backup-service.int-spec.ts` usa `docker compose` real: `config` con un directorio de
  proyecto temporal (como `scripts/optimizer-compose.spec.ts`, porque `config` exige el `.env` de las apps) y, para
  `schedule`, un proyecto temporal desde la raíz (`-p nimbo-022c-…`, solo `postgres` y `backup`) que se borra con
  `down -v`.
- **T-07, enrutado:** `restore.sh` no se ejecuta solo; `backup.sh restore <archivo>` lo carga con `source` y reutiliza
  sus constantes y su bitácora (DRY). `fail` pasó a escribir `<run_event>.failed`, así que `restore.failed` lleva
  también `exitCode` (de `psql`/`gpg`/`pg_restore` o `null`), igual que `backup.failed`; el plan §4 solo listaba `code`
  y `durationMs`. Sin secretos ni texto de las herramientas (probado en `backup-restore.int-spec.ts`).
- **T-07, nombre de la copia:** `restore` solo acepta nombres de copia final (`nimbo-<AAAAMMDD>T<HHMMSS>Z.dump.gpg`)
  dentro de `/backups`; cualquier otro es `RESTORE_FILE_NOT_FOUND` (evita rutas arbitrarias y JSON roto en la bitácora).
  La clave privada ausente o ilegible es `RESTORE_KEY_INVALID` (CA-4 «sin la clave del Operador»).
- **T-07, comparación de políticas (CA-5):** se comparan tabla, nombre, `permissive`, roles y `cmd` de `pg_policies`
  (plan §3 pide tabla y nombre), no el texto de `qual`/`with_check`: Postgres reescribe algunos *casts* al recargar
  (`ANY ((ARRAY[…])::text[])` → `ANY (ARRAY[(…)::text, …])`) sin cambiar su sentido. Se comparan además RLS/forzada de
  todas las tablas de `public` y los permisos de `nimbo_app`.
- **T-07, corpus del ensayo humano (ambigüedad para Adrián):** el plan §2 dice que el procedimiento invoca
  `createBackupCorpus()` también en el ensayo. No se agregó comando: necesita la app de Nest completa (con `tsx` no hay
  metadatos de decoradores) y su `close()` borra lo que crea. `respaldos.md` §2.2 indica datos inventados creados desde
  Nimbo para T-08 y remite a `backup-restore.int-spec.ts`, que corre la restauración completa con ese corpus. Si se
  quiere el corpus en la base local, haría falta un archivo más (comando y un modo «sin borrar»).
- **T-07:** `runMigrations` (`test/int/setup/migrate.ts`) devuelve ahora la salida de `migrate.ts` para comprobar
  `applied: []`; los demás llamadores no cambian.
- **Pendientes del plan §7:** ya están en `docs/sdd/pendientes.md`: copia externa antes de producción (RN-6) → PD-170;
  objetos de MinIO sin copia fuera de su volumen → PD-171; rol del volcado en staging (R-2) y ensayo en staging (P-2)
  → PD-173. Queda sin fila la nota de la D-11 de la spec 000 que todavía remite a la 022 (la agrega el dueño en el PR).
