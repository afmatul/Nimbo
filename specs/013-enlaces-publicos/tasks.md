# Tareas 013 — Enlaces públicos (API)

> Spec: `./spec.md` · Plan: `./plan.md` (Aprobado, 2026-10-31, Adrián, PR #87)
> T-01 es el **PR previo** `refactor(shared): …` desde `main` (plan §7 D-3); T-02 a T-10 van en `feat/013-enlaces-publicos`, un PR, rebasada tras integrar el previo.
> Una línea por tarea: criterio, CA, prueba y dependencia; el detalle vive en el plan. La prueba va primero (roja). Commits `feat(sharing): … [013 T-xx]`.

- [ ] **T-01** (PR previo) Hasher y bloqueo de `identity` a `shared` sin cambiar comportamiento, con README de ambos (plan §2, D-2) — CA: RN-8 — Prueba: suites movidas y de `identity` en verde
- [x] **T-02** Contratos `.strict()`, `AUDIT_TRIGGERS` con `public_link` y migración (plan §3, §4) — CA: CA-2, CA-17 — Prueba: esquemas, permisos, `up → down → up`
- [x] **T-03** Dominio `PublicLink`, `LinkToken`, `limitNetworkOf` y errores `SHARING_LINK_*` — CA: CA-2, CA-4, CA-7, RN-7 — Prueba: unitarias de dominio — Depende: T-02
- [x] **T-04** `POST /public-links` con reemplazo serializado y su auditoría — CA: CA-1, CA-3 a CA-6, CA-15, CA-16 — Prueba: int, un caso por CA de error (plan §6) — Depende: T-01, T-03
- [x] **T-05** `GET` y `DELETE /public-links` (revocar en solo lectura y con el archivo en la papelera) — CA: CA-7, CA-8, CA-15 — Prueba: int en `public-links.int-spec.ts` — Depende: T-04
- [x] **T-06** `POST /public-links/open`: resolver, actor derivado, límite por red — CA: CA-9, CA-11, CA-14, CA-16 — Prueba: unit del orden e int de los motivos de CA-11 — Depende: T-05
- [x] **T-07** `POST /public-links/download` sin contraseña o con la correcta y su auditoría — CA: CA-10, CA-14, CA-18 — Prueba: int (5 min, versión vigente, purga) — Depende: T-06
- [x] **T-08** Contraseña que falta o falla y bloqueo por enlace + red con `public_link.locked` — CA: CA-12, CA-13, CA-18 — Prueba: unit e int con `X-Forwarded-For` — Depende: T-07
- [x] **T-09** Aislamiento (incluidos ids en el cuerpo), README de `sharing` y `design-model.md` T2 — CA: CA-11, CA-16, CA-17 — Prueba: `public-links.iso-spec.ts` (plan §6) — Depende: T-08
- [x] **T-10** **(humana)** Demo por API: generar con contraseña, ficha, bloqueo, otra red descarga, reemplazar, revocar, «Mi actividad»; nota en el PR — CA: los visibles — Depende: T-09

## Notas del developer
