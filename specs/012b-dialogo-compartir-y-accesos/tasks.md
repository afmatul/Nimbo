# Tareas 012b — Diálogo «Compartir», lista de accesos y «Compartidos conmigo» (web)

> Spec: `./spec.md` · Plan: `./plan.md` (Propuesto: `/implement` exige «Aprobado»)
> 9 tareas verticales, de medio día a un día, un commit cada una (`feat(sharing): … [012b T-xx]`). Rama `feat/012b-dialogo-compartir-y-accesos`, un PR.
> Cada tarea es una línea: criterio, prueba y de qué depende. Los archivos viven en `plan.md` §2. La prueba va primero (roja).
> Los contratos y rutas de la 012 llegan por su T-01; hasta que la API esté, se prueba con el doble de `StorageHttp`.

- [x] **T-01** Cliente `createSharingApi` (cinco llamadas) y catálogo `share-messages.ts` con acción por `code` — CA: CA-3, CA-11 — Prueba: unitarias `sharing-api.spec.ts` y `share-messages.spec.ts` (correo solo en el cuerpo; cada `code` con texto y acción) — Depende: 012 T-01
- [x] **T-02** `useAccessList` y `AccessList`: cargando, vacía, con personas, heredada, error de carga; cambiar nivel (solo bajar en solo lectura) y «Quitar acceso» con confirmación — CA: CA-1, CA-4, CA-5 — Prueba: componente `access-list.spec.tsx` — Depende: T-01
- [x] **T-03** `ShareDialog` con `ShareForm`: correo y nivel, progreso, éxito sin recargar y cada error conservando lo escrito — CA: CA-2, CA-3 — Prueba: componente `share-dialog.spec.tsx` (feliz, `RECIPIENT_NOT_FOUND`, `429`) — Depende: T-02
- [x] **T-04** `storage` web: `accessLevel` oculta escrituras y subida sin `OWNER`, y «Compartir» en menús de fila y ficha abre el diálogo — CA: CA-6, CA-1 — Prueba: componente (menús de archivo, carpeta y ficha como propietario, Editor y Lector; las suites de `storage` siguen en verde) — Depende: T-03, 012 T-04
- [ ] **T-05** `useReceivedShares` y `ReceivedSharesView`: cargando, vacía, lista con enlaces a carpeta o ficha y error de carga — CA: CA-8, CA-9, CA-11 — Prueba: componente `received-shares-view.spec.tsx` — Depende: T-01, P-3 resuelta
- [ ] **T-06** «Salir»: confirmación, progreso, éxito, `SHARING_SHARE_NOT_FOUND` con «Actualizar lista», y disponible en solo lectura — CA: CA-10, CA-11 — Prueba: componente (feliz y error principal) — Depende: T-05
- [ ] **T-07** Página `/compartidos` y el ítem «Compartidos» del menú lateral apuntando a ella — CA: CA-8 — Prueba: componente `app-layout.spec.tsx` (enlace y estado activo) y render de la página — Depende: T-05
- [ ] **T-08** Accesibilidad de ambas superficies a 360 y 1440 px: foco, anuncios, contraste y progreso — CA: CA-7 — Prueba: `a11y.spec.tsx` con axe sobre todos los estados de spec §6 — Depende: T-04, T-06, T-07
- [ ] **T-09** **(humana)** Recorrido de la demo en local con la 012 integrada: A comparte una carpeta con B como Editor desde el menú, ve el acceso, B la ve en «Compartidos conmigo», la abre y sale de otra; A revoca y B ya no la alcanza; nota en el PR — CA: los visibles — Depende: T-08, 012 T-12

## Notas del developer
<Desviaciones (con enlace al registro de cambios de la spec), DF o pendientes que surgieron.>
