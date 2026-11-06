# Tareas 013b — Página del enlace público (web) y techo global de fallos

> Spec: `./spec.md` · Plan: `./plan.md`
> 5 a 12 tareas verticales, de medio día a un día, un commit cada una (`feat(sharing): … [013b T-xx]`).
> Cada tarea es una línea: criterio, prueba y de qué depende. Los archivos viven en `plan.md`. Sin tareas de «cierre».
> Dos PR (plan §1): **PR-A (api)** = T-02 y T-03, cierra PD-175; **PR-B (web)** = T-01 y T-05 a T-08. T-04 va antes
> en un PR `refactor(web)` propio (`refactor(web): … [013b T-04]`).

**PR-A (api)**
- [ ] **T-02** Techo global por enlace: `recordFailure` con `engagedLock` en `shared` (P-A), techo en `PublicLinkPasswordGate` con el orden de S-2, variable de entorno y texto de `INVALID_PASSWORD` — CA: CA-12, CA-13, CA-14, CA-16 — Prueba: unitaria primero (`public-link-password-gate.spec.ts`, `sharing.spec.ts` de contratos) y luego integración (`redis-attempt-lockout.int-spec.ts`, `public-link-access.int-spec.ts` con fallos simultáneos)
- [ ] **T-03** Aislamiento: el techo de un enlace de A no frena otro enlace de A, uno de B ni uno sin contraseña — CA: CA-15 — Prueba: aislamiento (`public-links.iso-spec.ts`) — Depende: T-02

**PR `refactor(web)`**
- [ ] **T-04** `usePreparingDownload` en `lib/` (P-C), usado por `file-row-menu`, `shared-file-detail` y `use-version-download`, sin cambio visible — CA: CA-3 (base) — Prueba: unitaria primero (`use-preparing-download.spec.ts`) y suites de `storage` en verde sin cambiar aserciones

**PR-B (web)**
- [ ] **T-01** Mockup de los 9 estados de la página con `/mockup` (`ui-designer`): generador `_generadores/enlace-publico/generar.js`, 18 PNG, README corregido, fila 302 de `ui-guidelines.md` §7 partida en página y diálogo; aprobación de Adrián — CA: CA-1 a CA-7 — Prueba: axe y capturas a 360 y 1440 px
- [ ] **T-05** Cliente del visitante sin sesión contra `API_PUBLIC_URL` y prueba de que nada en `web` reenvía `/public-links` — CA: CA-9, CA-10 — Prueba: unitaria web primero (`public-link-visitor-api.spec.ts`, `no-public-link-proxy.arch.spec.ts`)
- [ ] **T-06** Hook `use-public-link-visit` (fragmento crudo, vacío sin API, `StrictMode` sin repetir `POST /open`, descarga con `usePreparingDownload`) y catálogo `public-link-messages.ts` — CA: CA-3, CA-5, CA-6, CA-7, CA-8 — Prueba: unitaria web primero (`use-public-link-visit.spec.ts`) — Depende: T-04, T-05
- [ ] **T-07** Ruta `/enlace` (`metadata` con título genérico y `noindex`) y vista `PublicLinkVisit` con formulario de contraseña y sus 9 estados (`PasswordField` según P-B) y `expiresAtLabel` en `format-date.ts` — CA: CA-1, CA-2, CA-4, CA-6, CA-7, CA-8, CA-11 (axe y anuncios) — Prueba: unitaria primero (`format-date.spec.ts`), componente (`public-link-visit.spec.tsx`, `page.spec.tsx`) y axe (`a11y.spec.tsx`) — Depende: T-01, T-06
- [ ] **T-08** **(humana)** Recorrido de la demo en local (sin y con contraseña, incorrecta, techo bajado por entorno, revocado → «No disponible», sesión de Soporte) y revisión manual de CA-11: 360 px sin desplazamiento horizontal, contraste AA y «reducir movimiento»; nota en el PR — CA: los visibles, CA-11 — Depende: T-02, T-07

## Notas del developer
