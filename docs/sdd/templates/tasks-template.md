# Tareas NNN — <Título>

> Spec: `./spec.md` · Plan: `./plan.md` (si existe)
> Leyenda: `[P]` paralelizable con otras `[P]` del mismo bloque · Cada tarea ≈ 2–4 h y un commit, con sus CA.
> No hace falta una matriz CA→tareas ni un diagrama de paralelismo aparte: basta con que cada tarea liste sus CA.

## Bloque 0 — Preparación
- [ ] **T-01** Contratos en `packages/contracts` para … — CA: n/a — Archivos: `…`
- [ ] **T-02** Migración `…` con `down` — CA: CA-1 — Depende: —

## Bloque 1 — Dominio (pruebas primero)
- [ ] **T-03** [P] Prueba + implementación de `…Policy` — CA: CA-1, CA-2 — Archivos: `…`
- [ ] **T-04** [P] …

## Bloque 2 — Aplicación e infraestructura
- [ ] **T-05** Caso de uso `…UseCase` con prueba unitaria — CA: … — Depende: T-03
- [ ] **T-06** Adaptador / repositorio con prueba de integración — CA: … — Depende: T-02

## Bloque 3 — Presentación
- [ ] **T-07** Endpoint `…` + prueba de API — CA: …
- [ ] **T-08** [P] UI `features/…` según `docs/design/mockups/<modulo>/<pantalla>/` (todos los estados de la spec §9) — CA: …
- [ ] **T-08b** [P] E2E a 360/1440 px con axe para la pantalla — CA: …

## Bloque 4 — Seguridad, operación y documentación
- [ ] **T-09** Pruebas de aislamiento para … — CA: … — RNF-05
- [ ] **T-10** Métricas y bitácoras — RNF-17/18
- [ ] **T-11** Actualizar OpenAPI, manual afectado y `.env.example`
- [ ] **T-12** Actualizar diagrama de clases / E-R, `design-model.md` y estado de los DF resueltos (si el plan se aparta del diseño)

## Notas del developer
<Hallazgos, desviaciones reportadas (con enlace al registro de cambios de la spec).>
