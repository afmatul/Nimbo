# Tareas 025 — Despliegue público en Deploya

> Spec: `./spec.md` · Plan: `./plan.md`
> Todas hechas (2026-11-12).

- [x] **T-01** Imagen del api (`Dockerfile`) y web (`apps/web/Dockerfile`), páginas públicas dinámicas — CA: CA-1, CA-6, CA-7 — Prueba: build con el builder clásico (#109)
- [x] **T-02** Entrypoint, traducción de variables y `nimbo_app` — CA: CA-2, CA-3, CA-4 — Prueba: unitaria `deploya-env.spec.ts` — Depende: T-01 (#109)
- [x] **T-03** Worker y optimizer con la misma imagen y plantillas `infra/deploya/*.env` — CA: CA-5 — Prueba: simulación local — Depende: T-02 (#109)
- [x] **T-04** Dockerfile del api en la raíz y base desde `mirror.gcr.io` — CA: CA-1, CA-11 — Prueba: alta real y simulación — Depende: T-01 (`a2efa8f`, #110)
- [x] **T-05** Guía `docs/operations/deploya.md` pantalla por pantalla — CA: CA-8, CA-12 — Depende: T-03 (#109, #110)
- [x] **T-06** `nimbo-docs`: ONLYOFFICE 9.3.1 sin root y las cuatro variables del api — CA: CA-9, CA-10 — Prueba: conversión JWT y ciclo de edición en Chromium — Depende: T-02 (#113)
- [x] **T-07** `X-Forwarded-Proto` https y verificación con diagnóstico — CA: CA-9 — Prueba: edición en la demo — Depende: T-06 (#115, #116, #117)
- [x] **T-08** **(humana, Adrián)** Despliegue real, primer administrador y recorrido de la demo — CA: los visibles — Depende: T-05, T-07

## Notas del developer
- El primer despliegue de cada proyecto falla a propósito (sin recursos ni variables); un proyecto fallido no ocupa cupo.
- #115 reemplazó `$the_scheme` globalmente y rompió la salud de Deploya; #116 lo acotó y #117 amplió la búsqueda a todos los `includes` y hace fallar el build si no encuentra el encabezado.
