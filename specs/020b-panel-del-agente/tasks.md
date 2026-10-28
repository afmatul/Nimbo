# Tareas 020b — Panel del agente (web)

> Spec: `./spec.md` · Plan: `./plan.md`
> 5 a 12 tareas verticales, de medio día a un día, un commit cada una (`feat(intelligence): … [020b T-xx]`).
> Cada tarea es una línea: criterio, prueba y de qué depende. Los archivos viven en `plan.md`. Sin tareas de «cierre».
> Toda la spec depende de la **020** (contratos y endpoints en `packages/contracts/src/intelligence/`); T-01 lo verifica.

- [x] **T-01** Cliente del agente: `getStatus` y `streamAnswer` con lector SSE validado por evento, errores previos por `code` y renovación única ante 401 — CA: CA-3, CA-9, CA-10 — Prueba: unitaria (marcos partidos, marco inválido, corte, 401, abortar) — Depende: 020 (contratos)
- [x] **T-02** Sesión del agente solo en memoria: reductor, ámbito, detener y reintentar, mensajes por `code` en el catálogo — CA: CA-4, CA-7, CA-8, CA-9, CA-16, CA-17 — Prueba: unitaria del hook y del catálogo, sin `localStorage` — Depende: T-01
- [x] **T-03** `CitationChip` con la etiqueta del servidor sin texto duplicado y `AgentAnswer` en texto plano con `[n]` → chip y aviso de ubicación aproximada — CA: CA-3, CA-6, CA-13 — Prueba: componente — Depende: T-02
- [x] **T-04** `AgentPanel` con contador, `inicio`, `vacio`, `respondiendo`, `con-citas` y `sin-resultados`, hoja a 360 px y foco — CA: CA-1, CA-2, CA-3, CA-5, CA-19 — Prueba: componente + axe a 360 y 1440 px — Depende: T-02, T-03
- [x] **T-05** Estados de fallo del panel: `limite-alcanzado` (con «Ver planes» o «Renovar plan» sin fecha), `no-disponible`, parcial y `error-pregunta` (vacía y larga) — CA: CA-7, CA-8, CA-9 — Prueba: componente + axe — Depende: T-04
- [x] **T-06** Entrada y montaje: «Agente Nimbo» abre el panel, proveedor en el layout del Cliente, sin entrada para roles internos — CA: CA-1, CA-17, CA-18 — Prueba: componente (`app-layout`, regresión incluida) — Depende: T-04
- [x] **T-07** Selector de ámbito con árbol de carpetas reutilizado (extrae `useTreeFocus`) y `AGENT_SCOPE_NOT_FOUND` → «Todos mis archivos» — CA: CA-14, CA-16 — Prueba: componente + regresión de `move-dialog` — Depende: T-05
- [x] **T-08** «Preguntar sobre esto» en la ficha y en la carpeta, «Ubicación citada» y archivo inexistente solo con «No encontramos este archivo.» — CA: CA-11, CA-12, CA-15 — Prueba: componente — Depende: T-06, T-07
- [ ] **T-09** **(humana)** Recorrido de la demo en local: preguntar con streaming, abrir una cita, limitar a una carpeta, agotar consultas y apagar el modelo; a 1440 y 360 px — CA: los visibles — Depende: T-01 a T-08 y la 020 integrada

## Notas del developer
Integración en `feat/020b-panel-del-agente` sobre la 020 (2026-10-27). Sin DF ni pendientes nuevos. Desviaciones menores, para revisar en `/review`:
- **T-01:** `requestJson` se partió en `sendRequest` y `errorFromResponse` (sin cambio de comportamiento) para que el flujo SSE lea los errores igual que el resto; la renovación ante 401 se repite una segunda vez (D-1, sin extraer).
- **T-02/T-05:** estados derivados extra: `cargando`, `detenido` (sin aviso: el mockup no lo trae), `ambito-no-disponible` y `error`. Textos tomados del mockup o nuevos, por confirmar: «Podrás preguntar de nuevo cuando renueves tu plan.» (solo lectura, campo apagado) y «No pudimos responder tu pregunta.» (título del aviso genérico).
- **T-04:** el medidor no usa `QuotaBar` (trabaja en bytes); reutiliza `quotaPercentOf`/`quotaTierOf`. Vacío e inicio no usan `StateView` (no admite la lista de formatos).
- **T-06:** «Subir archivos» cierra el panel y lleva a Mis archivos. En `/cuenta/seguridad` (fuera de `(cliente)`) no hay entrada al agente y la sesión del panel se pierde al ir ahí; CA-17 no la nombra.
- **T-07:** `features/storage/index.ts` nuevo como índice público; «Mis archivos» (raíz) no se acepta como carpeta del ámbito.
- **S-2:** mockup y capturas del estado `vacio` actualizados a los seis formatos (pendiente de aprobación del estado, según `/mockup`).
