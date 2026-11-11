# Tareas 013c — Diálogo del enlace público (web)

> Spec: `./spec.md` · Plan: `./plan.md`
> 5 a 12 tareas verticales, de medio día a un día, un commit cada una (`feat(sharing): … [013c T-xx]`).
> Cada tarea es una línea: criterio, prueba y de qué depende. Los archivos viven en `plan.md`. Sin tareas de «cierre».
> Un PR (web). Sin tarea de aislamiento: no hay rutas ni consultas nuevas (spec §5; lo cubre `public-links.iso-spec.ts` de 013).

- [ ] **T-01** Mockup de los 24 estados de la sección con `/mockup` (`ui-designer`): `_generadores/compartir/generar.js`, 48 PNG, README corregido, fila «Enlace público (diálogo…)» de `ui-guidelines.md` §7 y excepción de §4 (D-1); aprobación de Adrián — CA: CA-1 a CA-15 — Prueba: axe y capturas a 360 y 1440 px
- [ ] **T-02** Cliente del propietario en `SharingApi` (sin `password` vacía) y textos por `code` (`SHARING_LINK_NOT_FOUND`, `fix_password`) — CA: CA-4, CA-5, CA-12, CA-14 — Prueba: unitaria web primero (`sharing-api.spec.ts`, `share-messages.spec.ts`)
- [ ] **T-03** Hook `usePublicLink` (lectura, URL solo en memoria, `create`, `revoke`, relectura, respuesta vieja descartada) — CA: CA-1, CA-3, CA-7 a CA-9, CA-13 — Prueba: unitaria web primero (`use-public-link.spec.ts`) — Depende: T-02
- [ ] **T-04** Sección, formulario y campo de la URL montados en `ShareDialog` solo para archivos, con confirmaciones en línea, solo lectura, copiar, Escape y foco — CA: CA-2 a CA-15 — Prueba: componente primero (`public-link-section.spec.tsx`, `share-dialog.spec.tsx`) y axe (`a11y.spec.tsx`) — Depende: T-01, T-03
- [ ] **T-05** «Mi actividad»: «Alguien con el enlace» para `trigger` `public_link` y frases de las cuatro acciones `public_link.*` (P-A) — CA: CA-16, CA-17 — Prueba: unitaria web primero (`activity-labels.spec.ts`)
- [ ] **T-06** PD-200: número de pedido explícito y descarga atada al pedido en la página del visitante — CA: CA-18 — Prueba: unitaria web primero (`use-public-link-visit.spec.ts`) y suites de 013b en verde
- [ ] **T-07** **(humana)** Recorrido de la demo en local: generar sin y con contraseña, copiar, abrir `/enlace` en otra pestaña, reemplazar (el anterior da «No disponible»), revocar, solo lectura, carpeta sin sección, «Mi actividad» tras descargar; revisión manual de CA-15 (360 px, contraste AA a 360 y 1440 px, «reducir movimiento»); nota en el PR — CA: los visibles, CA-15 — Depende: T-04, T-05, T-06

## Notas del developer
