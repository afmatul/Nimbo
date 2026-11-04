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
- [ ] **T-05** Rotación a las 7 copias más recientes (0,25 d) — CA: CA-3 — Prueba: integración primero (8 corridas) — Depende: T-03
- [ ] **T-06** Servicio `backup` en compose (perfil `backups`, volumen `backup_data`, secreto de la clave, `schedule` con `BACKUP_TIME`/`TZ`), `.env.example` y `ambientes.md` (0,5 d) — CA: CA-1, CA-9 — Prueba: integración primero (hora a un minuto; forma del compose con y sin perfil) — Depende: T-03
- [ ] **T-07** `restore.sh` sobre base vacía con negativa a base con tablas y a otra clave, y el procedimiento de restauración en `respaldos.md` (0,75 d) — CA: CA-4, CA-5, CA-6 — Prueba: integración primero (`backup-restore.int-spec.ts`: conteos, `applied: []`, RLS, `health/ready` 200) — Depende: T-03, T-06
- [ ] **T-08** **(humana, Abel como Operador)** Ensayo en local siguiendo `respaldos.md` (respaldo, restauración sobre volumen nuevo, recuperación de una versión) y fila en su registro; nota en el PR (0,5 d) — CA: CA-5, CA-8 — Depende: T-02, T-07

## Notas del developer
<Desviaciones (con enlace al registro de cambios de la spec), DF o pendientes que surgieron.>
