# Tareas NNN — <Título>

> Spec: `./spec.md` · Plan: `./plan.md`
> 5 a 12 tareas verticales, de medio día a un día, un commit cada una (`feat(<modulo>): … [NNN T-xx]`).
> Cada tarea es una línea: criterio, prueba y de qué depende. Los archivos viven en `plan.md`. Sin tareas de «cierre».

- [ ] **T-01** Contratos y migración de … (con `down`) — CA: CA-1 — Prueba: migración reversible
- [ ] **T-02** Regla/política de dominio … — CA: CA-1, CA-2 — Prueba: unitaria — Depende: T-01
- [ ] **T-03** Endpoint `…` — CA: CA-1, CA-3 — Prueba: integración, feliz y error principal — Depende: T-01, T-02
- [ ] **T-04** Aislamiento: otra cuenta no ve ni modifica … — CA: CA-4 — Prueba: aislamiento (solo si toca datos de cliente)
- [ ] **T-05** Pantalla `…` con sus estados (spec §6) — CA: CA-1, CA-5 — Prueba: componente
- [ ] **T-06** **(humana)** Recorrido de la demo en local y nota en el PR — CA: los visibles

## Notas del developer
<Desviaciones (con enlace al registro de cambios de la spec), DF o pendientes que surgieron.>
