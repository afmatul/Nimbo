# Tareas 013b — Página del enlace público (web) y techo global de fallos

> Spec: `./spec.md` · Plan: `./plan.md`
> 5 a 12 tareas verticales, de medio día a un día, un commit cada una (`feat(sharing): … [013b T-xx]`).
> Cada tarea es una línea: criterio, prueba y de qué depende. Los archivos viven en `plan.md`. Sin tareas de «cierre».
> Dos PR (plan §1): **PR-A (api)** = T-01 a T-03, cierra PD-175; **PR-B (web)** = T-04 a T-09.

**PR-A (api)**
- [ ] **T-01** Techo global por enlace: `recordFailure` con `engagedLock` en `shared` (P-A), techo en `PublicLinkPasswordGate` con el orden del plan §1, variable de entorno, README de `sharing` y de `shared`, y DF-91 + `design-model.md` M3b — CA: CA-12, CA-13, CA-14 — Prueba: unitaria primero (`public-link-password-gate.spec.ts`) y luego integración (`redis-attempt-lockout.int-spec.ts`, `public-link-access.int-spec.ts` con fallos simultáneos)
- [ ] **T-02** Texto de ayuda de `INVALID_PASSWORD` sin «o deja el campo vacío» — CA: CA-16 — Prueba: unitaria primero (`packages/contracts/src/sharing.spec.ts`)
- [ ] **T-03** Aislamiento: el techo de un enlace de A no frena otro enlace de A, uno de B ni uno sin contraseña — CA: CA-15 — Prueba: aislamiento (`public-links.iso-spec.ts`) — Depende: T-01

**PR-B (web)**
- [x] **T-04** `usePreparingDownload` y `expiresAtLabel` en `lib/` (P-C); los usan `file-row-menu`, `shared-file-detail` (gana «una petición a la vez») y `use-version-download`, con imports actualizados; `download` devuelve si arrancó (N-1); commits `refactor(storage): … [013b T-04]` y `fix(storage): … [013b T-04]` para `shared-file-detail` (N-2) — CA: CA-3, CA-1 (fecha) — Prueba: unitaria primero (`use-preparing-download.spec.ts`, `format-date.spec.ts`, doble clic en `shared-file-detail.spec.tsx` y en `file-row-menu.spec.tsx`) y suites de `storage` en verde sin cambiar aserciones
- [x] **T-05** Mockup de los 9 estados de la página con `/mockup` (`ui-designer`): generador `_generadores/enlace-publico/generar.js`, 18 PNG, README corregido, fila 302 de `ui-guidelines.md` §7 partida en página y diálogo; aprobación de Adrián — CA: CA-1 a CA-7 — Prueba: axe y capturas a 360 y 1440 px
- [x] **T-06** Cliente del visitante sin sesión contra `API_PUBLIC_URL` y prueba de que nada en `web` reenvía `/public-links` — CA: CA-9, CA-10 — Prueba: unitaria web primero (`public-link-visitor-api.spec.ts`, `no-public-link-proxy.arch.spec.ts`)
- [x] **T-07** Hook `use-public-link-visit` (fragmento crudo, vacío sin API, `StrictMode` sin repetir `POST /open`, descarga con `usePreparingDownload`) y catálogo `public-link-messages.ts` con el `429` neutro — CA: CA-3, CA-5, CA-6, CA-7, CA-8 — Prueba: unitaria web primero (`use-public-link-visit.spec.ts`) — Depende: T-04, T-06
- [x] **T-08** Ruta `/enlace` (`metadata` con título genérico y `noindex`) y vista `PublicLinkVisit` con formulario de contraseña y sus 9 estados (`PasswordField` movido a `components/nimbo/` en un commit propio, P-B (a)) — CA: CA-1, CA-2, CA-4, CA-6, CA-7, CA-8, CA-11 (axe y anuncios) — Prueba: componente (`public-link-visit.spec.tsx`, `page.spec.tsx`) y axe (`a11y.spec.tsx`) — Depende: T-05, T-07
- [ ] **T-09** **(humana)** Recorrido de la demo en local (sin y con contraseña, incorrecta, techo bajado por entorno, revocado → «No disponible», sesión de Soporte) y revisión manual de CA-11 (360 px sin desplazamiento horizontal, contraste AA a 360 y 1440 px, «reducir movimiento»); nota en el PR — CA: los visibles, CA-11 — Depende: T-01, T-08

## Notas del developer

- **T-04** (2026-11-07):
  - `file-row-menu` y `shared-file-detail` limpian el aviso dentro de la `requestUrl` que pasan al hook, no tras
    `await download()`: así solo ocurre si arrancó (N-1) y antes de pedir la URL, como hoy; hacerlo después borraría
    el aviso de fallo. `setOpen(false)` sí va tras `download` cuando devuelve `true`.
  - «Reintentar» usa el `retry` que da el hook (la regla `react-hooks/immutability` no deja usar `download` antes de
    declararlo); el menú ya está cerrado al reintentar, así que no cambia nada visible.
  - `useVersionDownload` conserva `download: Promise<void>` (envuelve el `boolean` del hook) para no tocar
    `VersionActions` ni `use-version-actions.ts`.
  - En el worktree (`.claude/…`), Jest no encuentra pruebas con el `testMatch` de `<rootDir>` porque la ruta tiene una
    carpeta con punto; se corrió con `--testMatch "**/src/**/*.spec.{ts,tsx}"`. En el repositorio normal no pasa.
- **T-06** (2026-11-07):
  - `public-link-visitor-api.ts` repite el «`POST` JSON + `safeParse` → genérico» de `identity/api.ts` y de
    `identity/account-setup/api.ts` (tercera copia, Art. VI.2). No se extrajo a `lib/` porque tocaría `identity`, que
    no está autorizado en el plan; queda como PD-191 (ayudante en `lib/api-client`).
  - La ficha y la URL firmada de prueba viven en `features/sharing/test-public-link.ts` (como `test-sharing.ts`) para
    reutilizarlas en T-07 y T-08.
  - Hoy `web` no tiene `route.ts` ni `middleware`: la prueba de arquitectura los vigila por si aparecen, y se comprobó
    que falla con un `app/api/…/route.ts` que llama a `/public-links` (se borró tras verlo en rojo).
  - SEC-8 (revisión de cierre, 2026-11-07): la prueba también falla si un `route.*` de `src/app` hace `fetch` o usa
    `API_URL` o `API_PUBLIC_URL`, si hay un catch-all (`[...x]` o `[[...x]]`) bajo `src/app/api` y si hay cualquier
    archivo en `src/pages/api` o `pages/api`. Cada caso se vio en rojo con un archivo temporal (`fetch`, `API_URL`,
    `API_PUBLIC_URL`, `api/[...rest]`, `api/v1/[[...rest]]`, `src/pages/api/x.ts` y `pages/api/x.ts`), que se borró
    después.
- **T-07** (2026-11-07):
  - `usePublicLinkVisit(api, openUrl)` recibe el cliente y cómo abrir la URL, como `SharedFileDetail` (`api`,
    `openUrl`): la vista de T-08 crea el cliente con `API_PUBLIC_URL` y pasa `openInBrowser`. Las pruebas usan un
    cliente falso; el cliente real ya lo prueba T-06.
  - Estados del `POST /open` en `state` (`loading`, `ready`, `unavailable`, `rate-limited`, `load-error`) y del último
    «Descargar» en `outcome` (`idle`, `started`, `password-invalid`, `rate-limited`, `download-error` con su `retry`).
    Un `404` al descargar no es un `outcome`: pasa `state` a `unavailable`, sin ficha (CA-6). Vaciar el campo tras el
    `403` o el `429` (CA-4, CA-5) le toca al formulario de T-08, que lee `outcome`.
  - Otro `#token` en la pestaña (`hashchange`) o «Reintentar» vuelven a `loading` y limpian `outcome`; un
    `hashchange` con el mismo token no repite la petición.
  - El catálogo usa dos claves propias para la red o un 5xx (`PUBLIC_LINK_OPEN_FAILED`, `PUBLIC_LINK_DOWNLOAD_FAILED`),
    porque no traen `code`. Tonos: no disponible `neutral`; contraseña incorrecta y red al abrir `error`; `429` y red al
    descargar `warning` (README del mockup).
  - El `429` dice «Espera 1 minuto…» en singular cuando `minutesFrom` da 1 (menos de 60 s o sin `Retry-After`) y
    «Espera N minutos…» si da más (decisión de Fátima, 2026-11-08). `error-catalog` sigue diciendo siempre «minutos»
    y no se tocó: queda como PD-190.
- **T-08** (2026-11-07):
  - `PasswordField` pasó a `components/nimbo/` en un commit propio (P-B (a)): solo la ruta y los 4 imports de
    `identity`; sus pruebas siguen verdes sin cambiar aserciones (no tenía prueba propia).
  - `public-link-visit.tsx` exporta `PublicLinkVisitView({ api, openUrl })`, que prueban la vista y axe con un cliente
    falso, y `PublicLinkVisit({ apiPublicUrl })`, que crea el cliente y pasa `openInBrowser`; `index.ts` solo exporta
    `PublicLinkVisit`. `page.spec.tsx` comprueba `metadata`, `noindex` y que la ficha se pide a `API_PUBLIC_URL`.
  - El formulario lee `outcome`: tras el `403` vacía el campo y le pone el foco (CA-4); tras el `429`, solo lo vacía
    (CA-5). El campo no es controlado (el valor se lee del `ref` al enviar), así no hay `setState` en un efecto.
  - Los textos del catálogo («Qué pasó. Qué hacer.») se parten en la primera oración para el `h2` y el párrafo de
    `StateView`, como el mockup.
  - `StateView` no tiene tono de advertencia ni deja estilar el botón de su acción: el `429` al abrir usa
    `type="empty"` con `role="status"` y clases de `warning` en `className`, y el borde `secondary-foreground` de
    «Reintentar» (PD-189) va con variantes `[&_button]:`, `[&_h2]:`, `[&_p]:` y `[&_svg]:` (solo tokens, sin valores
    arbitrarios). No se tocó `components/nimbo/state-view.tsx`: queda en PD-189 sumarle `tone="warning"` y un estilo
    de acción, y quitar entonces esos selectores de la página (decisión de Fátima, 2026-11-08).
  - La baldosa del ícono del tipo lleva el color del tipo, como el mockup (decisión de Fátima, 2026-11-08):
    `file-type-chip.tsx` exporta `fileTypeColors(fileType)`, el color y el fondo del mapa del chip como `style` (son
    variables de `globals.css`, sin utilidades `file-*`). `FileTypeChip` y `FileTypeIcon` no cambian. Contraste del
    ícono sobre la baldosa (sobre `card`): docx 5.12, xlsx 4.78, pptx 4.77, pdf 4.77, img 5.48, otro 5.02 (AA).
  - El fixture `PUBLIC_LINK_DETAILS` de T-06 pasó de 2 516 582 a 2 400 000 bytes: `formatBytes` usa unidades decimales
    y daba «2,5 MB», no el «2,4 MB» de CA-1. Ninguna prueba anterior leía el tamaño.
  - El bloque de axe de la página pide cero violaciones (no solo las graves, como los de 012b), en los 11 HTML del
    mockup (9 estados y 2 variantes), dentro de un `<main>` como el de `(public)/layout.tsx`.
  - Revisión de cierre (I-1, S-3 a S-6; 2026-11-07):
    - El tono sale del catálogo con dos mapas con nombre: `STATE_VIEW_BY_TONE` (tipo y clases de `StateView`) y
      `ALERT_VARIANT_BY_TONE` (`variant` del `Alert`). Los tres estados sin ficha pasan por un `CatalogState`. Como el
      `type="error"` de `StateView` exige acción (RNF-14), un tono `error` sin «Reintentar» se mostraría como estado
      con `role="status"`; hoy no hay ningún caso así. «Tu descarga comenzó» sigue en `success` fijo: no está en el
      catálogo.
    - S-6: Tailwind solo genera clases que aparecen literales, así que `RETRY_ON_TINT` pasó a
      `[&_button]:border-secondary-foreground [&_button]:text-foreground` y va en el contenedor: `StateView` y
      `NoticeAlert`, que gana un `className` opcional. Los botones de `StateView` ya heredaban `foreground`, así que no
      cambia nada visible.
    - S-3: la prueba no se pone en rojo con solo quitar el `if (preparing) return` del formulario, porque el hook
      también descarta la segunda petición (`inFlight`). Cubre la línea del guardia: las líneas de
      `public-link-password-form.tsx` quedan al 100 %.
    - S-4: todos los que llaman a `usePreparingDownload` ya pasaban `openUrl`, así que ninguna prueba cambió.
      `openInBrowser` sigue exportado: lo usan otras 5 vistas.
