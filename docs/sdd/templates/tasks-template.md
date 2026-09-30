# Tareas NNN — <Título>

> Spec: `./spec.md` · Plan: `./plan.md`
> 5 a 12 tareas verticales, de medio día a un día, un commit cada una (`feat(<modulo>): … [NNN T-xx]`).
> Cada tarea deja algo probado de punta a punta y lista sus CA. Sin tareas de «cierre»: el PR integrado lo es.

- [ ] **T-01** Contratos y migración de … (con `down`) — CA: CA-1 — Archivos: `packages/contracts/src/…`, `…migrations/…`
- [ ] **T-02** Regla/política de dominio … con sus pruebas unitarias — CA: CA-1, CA-2
- [ ] **T-03** Endpoint `…` con prueba de integración (feliz + error principal) — CA: CA-1, CA-3 — Depende: T-01, T-02
- [ ] **T-04** Aislamiento: otra cuenta no ve ni modifica … — CA: CA-4 — RNF-05 (solo si toca datos de cliente)
- [ ] **T-05** Pantalla `…` con sus estados (spec §6) y pruebas de componente — CA: CA-1, CA-5
- [ ] **T-06** **(humana)** Recorrido de la demo en local y nota en el PR — CA: los visibles

## Notas del developer
<Desviaciones (con enlace al registro de cambios de la spec), DF o pendientes que surgieron.>
