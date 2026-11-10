# Revisión 022c — Respaldos y restauración

| Campo | Valor |
|---|---|
| Fecha | 2026-11-10 |
| Rango revisado | `507dd5a..c6b846c` (`origin/main...HEAD`) |
| CI | Local: lint ✅ · typecheck ✅ · test ✅ · test:isolation ✅ (672) · int `operations/` ✅ (33) · int completo 191/192: `dotenv-bootstrap` falla por el ambiente (sin compose local), ajeno a 022c |
| Veredicto | ✅ Aprobar (I-1, I-2 e I-4 corregidos en esta pasada) |

## Verificación
| CA | Prueba | Estado |
|---|---|---|
| CA-1 | `backup-service.int-spec.ts` › «CA-1: run deja una copia…», «la copia es el volcado custom…», «con BACKUP_TIME un minuto por delante, schedule…» | ✅ |
| CA-2 | `backup-service.int-spec.ts` › `it.each(FAILURES)`: contraseña, clave ausente, clave inválida, volumen sin escritura (hash del volumen y salida sin secretos) | ✅ («base inalcanzable» sin caso propio, S-3) |
| CA-3 | `backup-service.int-spec.ts` › «tras 8 corridas quedan exactamente las 7…», «un respaldo fallido no rota» | ✅ |
| CA-4 | `backup-service.int-spec.ts` › «sin la clave privada nada es legible»; `backup-restore.int-spec.ts` › clave de un tercero, archivo truncado, sin clave montada | ✅ |
| CA-5 | `backup-restore.int-spec.ts` › conteos, RLS + políticas + permisos de `nimbo_app`, `applied: []`, `health/ready` 200; registro en `docs/operations/respaldos.md:305` | ✅ |
| CA-6 | `backup-restore.int-spec.ts` › «restore sobre la base de origen → RESTORE_TARGET_NOT_EMPTY» | ✅ |
| CA-7 | `object-versions.int-spec.ts` › «tras correr init.sh dos veces…» | ✅ |
| CA-8 | `object-versions.int-spec.ts` › sobrescrito, borrado, tras `purgeObject`; registro en `respaldos.md:306` | ✅ |
| CA-9 | `backup-service.int-spec.ts` › CA-9 base/local (sin `ports`, sin `env_file`, solo variables de respaldo, `backup_data` exclusivo, R-3). El diff no toca `apps/` (ni ruta ni pantalla) | ✅ |

## Seguridad
- Datos de cliente: sí, en bloque. No hay consultas por actor nuevas; el aislamiento existente sigue en verde (672). Tras restaurar se conservan la RLS y la RLS forzada de todas las tablas de `public`, las políticas y los `GRANT` de `nimbo_app` (CA-5).
- Bitácoras ✅: el stderr de `pg_dump`, `gpg`, `pg_restore` y `psql` va a `/dev/null`; las pruebas comprueban que no salen contraseña, host, ruta de la clave, `FATAL`, `gpg:` ni `ERROR`. `fail` no escribe el nombre de archivo recibido.
- Claves ✅: en compose solo entra la pública. La privada se monta con `-v` solo en `restore` y se importa en un `GNUPGHOME` temporal que se borra. Con `cp .env.example .env` el compose sin perfil sigue levantando.
- Rutas en `restore` ✅: `BACKUP_NAME_PATTERN` (`restore.sh:13`) va anclado y no admite `/`.
- **[SEC-1]** baja · `backup-restore.int-spec.ts:277` · la validación del nombre es la única barrera de rutas y no tiene prueba de recorrido. Añadir `../etc/passwd` y `nimbo-20250101T000000Z.dump.gpg/../x` → `RESTORE_FILE_NOT_FOUND`.
- **[SEC-2]** baja · `compose.yml:190-216`, `infra/backup/backup.sh:10` · el servicio `backup` corre como `root` (justificado en `tasks.md`, sin puertos, script `:ro`), pero copias y temporales salen `644` y el contenedor conserva todas sus capacidades. Sugerido: `umask 077` en `backup.sh`; `no-new-privileges`, `cap_drop: [ALL]` + `cap_add: [DAC_OVERRIDE]`; anotar la decisión de usuario en plan §5.

## UI
No aplica: no hay pantallas (spec §6).

## Bloqueantes
Ninguno.

## Importantes y sugerencias
- **[I-1]** ✔ corregido · `docs/sdd/pendientes.md` — la fila PD-172 había quedado entre la cabecera y el separador de «Cerrados».
- **[I-2]** ✔ corregido · `specs/README.md:75` — 022c pasa a «En revisión (2026-11-10)».
- **[I-3]** DRY (Art. VI.2): `startPostgres` con `10-nimbo-app.sh` aparece cuatro veces (`containers.ts:67`, `nosuperuser-postgres.ts:71` y las dos suites nuevas); `startBackup`, `parseLines`, la generación de claves `gpg` y las constantes del contrato se repiten en las dos suites. Extraer `test/int/operations/backup-harness.ts` y un `startPostgres({ network, alias, password })` en `containers.ts`; puede ir a PD-105.
- **[I-4]** ✔ corregido · plan §4: `restore.failed` lleva también `exitCode`.
- **[S-1]** `backup.sh:113-118` — un `BACKUP_TIME` inválido escribe texto plano y, con `restart: unless-stopped`, reinicia en bucle. Emitir `backup.failed` en JSON o documentarlo en `respaldos.md` §1.4.
- **[S-2]** `backup.sh:87-104` — un `docker stop` a mitad de corrida deja un `.nimbo-*.tmp` que nadie limpia; borrarlos al empezar `run_backup`.
- **[S-3]** CA-2 «base inalcanzable» sin caso propio en `FAILURES`; añadir un host inexistente.
- **[S-4]** `respaldos.md:111-112` — «cualquier error la revierte entera» no cubre un fallo de `gpg` posterior al `COMMIT`; matizar el texto.
- **[S-5]** `backup-service.int-spec.ts` (639 líneas) junta script y compose; partir en `backup-script` y `backup-compose`.
- **[S-6]** el valor por defecto `03:00` está en tres sitios (`backup.sh:17`, `compose.yml`, `.env.example`); bastan dos.

## DF y pendientes
- DF nuevos: ninguno (sin clases, puertos ni tablas; `architecture.md` ya dice `(022c) backup/`).
- Pendientes: PD-170, PD-171 y PD-173 abiertos. PD-172 cerrado en esta revisión: D-11 y «Fuera de alcance» de 000 remiten a 022c. I-3 puede sumarse a PD-105.

## Lo que está bien hecho
- Las pruebas ejecutan los mismos scripts contra Postgres, MinIO y compose reales, incluida la corrida programada (`schedule`) y la restauración en otro «servidor».
- La restauración en dos pasadas no toca la base ante una clave equivocada o un archivo truncado, como pidió `architect`.
- La comparación de RLS y políticas cubre todas las tablas; la diferencia de `qual` está razonada.
- Funciones de shell y TS ≤ 30 líneas y ≤ 3 parámetros; sin abstracciones especulativas.
- `respaldos.md` es operable, con vuelta atrás, R-7 y registro de pruebas del ensayo.
