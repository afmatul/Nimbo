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
- [ ] **T-04** `usePreparingDownload` y `expiresAtLabel` en `lib/` (P-C); los usan `file-row-menu`, `shared-file-detail` (gana «una petición a la vez») y `use-version-download`, con imports actualizados; `download` devuelve si arrancó (N-1); commits `refactor(storage): … [013b T-04]` y `fix(storage): … [013b T-04]` para `shared-file-detail` (N-2) — CA: CA-3, CA-1 (fecha) — Prueba: unitaria primero (`use-preparing-download.spec.ts`, `format-date.spec.ts`, doble clic en `shared-file-detail.spec.tsx` y en `file-row-menu.spec.tsx`) y suites de `storage` en verde sin cambiar aserciones
- [ ] **T-05** Mockup de los 9 estados de la página con `/mockup` (`ui-designer`): generador `_generadores/enlace-publico/generar.js`, 18 PNG, README corregido, fila 302 de `ui-guidelines.md` §7 partida en página y diálogo; aprobación de Adrián — CA: CA-1 a CA-7 — Prueba: axe y capturas a 360 y 1440 px
- [ ] **T-06** Cliente del visitante sin sesión contra `API_PUBLIC_URL` y prueba de que nada en `web` reenvía `/public-links` — CA: CA-9, CA-10 — Prueba: unitaria web primero (`public-link-visitor-api.spec.ts`, `no-public-link-proxy.arch.spec.ts`)
- [ ] **T-07** Hook `use-public-link-visit` (fragmento crudo, vacío sin API, `StrictMode` sin repetir `POST /open`, descarga con `usePreparingDownload`) y catálogo `public-link-messages.ts` con el `429` neutro — CA: CA-3, CA-5, CA-6, CA-7, CA-8 — Prueba: unitaria web primero (`use-public-link-visit.spec.ts`) — Depende: T-04, T-06
- [ ] **T-08** Ruta `/enlace` (`metadata` con título genérico y `noindex`) y vista `PublicLinkVisit` con formulario de contraseña y sus 9 estados (`PasswordField` movido a `components/nimbo/` en un commit propio, P-B (a)) — CA: CA-1, CA-2, CA-4, CA-6, CA-7, CA-8, CA-11 (axe y anuncios) — Prueba: componente (`public-link-visit.spec.tsx`, `page.spec.tsx`) y axe (`a11y.spec.tsx`) — Depende: T-05, T-07
- [ ] **T-09** **(humana)** Recorrido de la demo en local (sin y con contraseña, incorrecta, techo bajado por entorno, revocado → «No disponible», sesión de Soporte) y revisión manual de CA-11 (360 px sin desplazamiento horizontal, contraste AA a 360 y 1440 px, «reducir movimiento»); nota en el PR — CA: los visibles, CA-11 — Depende: T-01, T-08

## Notas del developer
