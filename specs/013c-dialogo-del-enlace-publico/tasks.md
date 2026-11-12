# Tareas 013c — Diálogo del enlace público (web)

> Spec: `./spec.md` · Plan: `./plan.md`
> 5 a 12 tareas verticales, de medio día a un día, un commit cada una (`feat(sharing): … [013c T-xx]`).
> Cada tarea es una línea: criterio, prueba y de qué depende. Los archivos viven en `plan.md`. Sin tareas de «cierre».
> Un PR (web). Sin tarea de aislamiento: no hay rutas ni consultas nuevas (spec §5; lo cubre `public-links.iso-spec.ts` de 013).

- [x] **T-01** Mockup de los 24 estados con `/mockup` (`ui-designer`): `_generadores/compartir/generar.js`, 48 PNG, README corregido, fila «Enlace público (diálogo…)» de `ui-guidelines.md` §7 y excepción de §4 a `ConfirmDestructiveDialog` (D-1); aprobado por Adrián (2026-11-11), con la solo lectura en `ReadOnlyBanner` — CA: CA-1 a CA-15 — Prueba: axe y capturas a 360 y 1440 px
- [x] **T-02** Cliente del propietario en `SharingApi` con `publicLinkBody` (sin `password` vacía), `publicLinkMessageOf` con `reload` y `none`, `isReadOnlyError`, y `variant` de advertencia en `ShareErrorAlert` — CA: CA-4, CA-10, CA-12, CA-14 — Prueba: unitaria web primero (`sharing-api.spec.ts`, `share-messages.spec.ts`)
- [x] **T-03** Hook `usePublicLink` (lectura, `generated` solo en memoria y limpiado, `create`, `revoke`, relectura, respuesta vieja descartada) — CA: CA-1, CA-3, CA-7 a CA-9, CA-13 — Prueba: unitaria web primero (`use-public-link.spec.ts`) — Depende: T-02
- [x] **T-04** Formulario (vencimiento, contraseña opcional con error junto al campo, progreso, `429` en advertencia) y campo de la URL con copiar y su fallo — CA: CA-3 a CA-6, CA-12 — Prueba: componente primero (`public-link-form.spec.tsx`, `generated-link-field.spec.tsx`) — Depende: T-02
- [x] **T-05** Sección en `ShareDialog` solo para archivos: estados, confirmaciones en línea, solo lectura y `403` tardío con `ReadOnlyBanner`, Escape, X y clic fuera con acción en curso, foco y axe — CA: CA-1, CA-2, CA-7 a CA-11, CA-13 a CA-15 — Prueba: componente primero (`public-link-section.spec.tsx` con CA-4 de punta a punta, `share-dialog.spec.tsx`) y axe (`a11y.spec.tsx`) — Depende: T-01, T-03, T-04
- [x] **T-06** «Mi actividad»: «Alguien con el enlace» para `trigger` `public_link`, mirado antes que `origin`, y frases de las cuatro acciones `public_link.*` (P-A) — CA: CA-16, CA-17 — Prueba: unitaria web primero (`activity-labels.spec.ts`)
- [x] **T-07** PD-200: número de pedido explícito, `usePublicLinkDownload` con guardia por pedido y ficha con `key` por pedido; las pruebas de descarga se mudan con las mismas aserciones — CA: CA-18 — Prueba: componente primero (`public-link-visit.spec.tsx`) y `use-public-link-download.spec.ts` en verde
- [x] **T-08** **(humana)** Recorrido de la demo en local: generar sin y con contraseña, copiar, abrir `/enlace` en otra pestaña, reemplazar (el anterior da «No disponible»), revocar, solo lectura, carpeta sin sección, «Mi actividad» tras descargar; revisión manual de CA-15 (360 px, contraste AA a 360 y 1440 px, «reducir movimiento»); nota en el PR (hecha el 12/11; el paso 14, solo lectura, se recorrió con Playwright) — CA: los visibles, CA-15 — Depende: T-05, T-06, T-07

## Notas del developer
