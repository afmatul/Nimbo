# Revisión 013b — Página del enlace público (web) y techo global de fallos

> Una página. La escribe `reviewer` (la sección «Seguridad» es de `security-auditor`) y la aprueba Adrián.

| Campo | Valor |
|---|---|
| Fecha | 2026-11-07 |
| Rango revisado | PR-A #102: `origin/main...1b26ffc6` (`feat/013b-techo-global-de-fallos`) · PR-B: `origin/main...1c39274d` (`feat/013b-pagina-del-enlace-publico-web`) |
| CI | PR-A ✅ (lint, typecheck, unit e integration con `test:isolation`, `gh pr checks 102`) · PR-B en local con Node 22: lint ✅, typecheck ✅, web 244 suites y 2309 pruebas ✅; `test:int` e isolation no aplican (no toca la api). Cobertura de los archivos nuevos: 99 % de sentencias y 90 % de ramas |
| Veredicto | ✅ Aprobar. El #102 ya está en `main` (I-2 resuelto con un merge) y T-09 está hecha |

## Verificación
| CA | Prueba (`archivo › caso`) | Estado |
|---|---|---|
| CA-1 | `public-link-visit.spec.tsx › CA-1: cargando…`, `› CA-1: sin contraseña…`, `› CA-1: la baldosa de «%s»…`; `format-date.spec.ts › CA-1` (3) | ✅ |
| CA-2 | `public-link-visit.spec.tsx › CA-2: con contraseña: la misma ficha… ayuda asociada` | ✅ |
| CA-3 | `public-link-visit.spec.tsx › CA-3` (descargando, iniciada, enviar otra vez durante «Preparando…»); `use-public-link-visit.spec.ts › CA-3` (4); `use-preparing-download.spec.ts` (5); doble clic en `shared-file-detail.spec.tsx` y `file-row-menu.spec.tsx` | ✅ |
| CA-4 | `public-link-visit.spec.tsx › CA-4: con el campo vacío…` y `› CA-4: contraseña incorrecta… con el foco` | ✅ |
| CA-5 | `public-link-visit.spec.tsx › CA-5` (descarga, «1 minuto», `429` al abrir); `public-link-messages.spec.ts › CA-5` (4) | ✅ |
| CA-6 | `public-link-visit.spec.tsx › CA-6` (2); `use-public-link-visit.spec.ts › CA-6` (vacío sin API, `404` al abrir y al descargar) | ✅ |
| CA-7 | `public-link-visit.spec.tsx › CA-7` (al abrir y al descargar); `public-link-messages.spec.ts › CA-7` | ✅ |
| CA-8 | `page.spec.tsx › CA-8`, `› S-5`; `use-public-link-visit.spec.ts › CA-8` (fragmento crudo, `StrictMode`, recarga, `hashchange`) | ✅ |
| CA-9 | `public-link-visitor-api.spec.ts › CA-9` (5); `no-public-link-proxy.arch.spec.ts` (7, con proxys genéricos, SEC-8); `page.spec.tsx › CA-9` | ✅ |
| CA-10 | `public-link-visitor-api.spec.ts › CA-9, CA-10: abre con POST… sin cookies ni Authorization`; api: `public-links.iso-spec.ts › CA-16` de 013. Con sesión de Soporte, la página se ve igual que para un anónimo (T-09) | ✅ |
| CA-11 | `sharing/a11y.spec.tsx › 013b CA-11`: 11 estados a 360 y 1440 px, cero violaciones. La parte manual (360 px sin desplazamiento, AA a 360 y 1440 px y «reducir movimiento») la hizo Fátima en **T-09** | ✅ |
| CA-12 | `public-link-password-gate.spec.ts › CA-12` (`it.each`); `public-link-access.int-spec.ts › CA-12, CA-13: al techo desde varias redes…` | ✅ |
| CA-13 | `public-link-password-gate.spec.ts › CA-13, RN-3…`; `public-link-access.int-spec.ts › CA-13, RN-3: un acierto antes del techo no reinicia la cuenta` | ✅ |
| CA-14 | `public-link-access.int-spec.ts › CA-14` (fallos simultáneos; techo y red en el mismo intento); `redis-attempt-lockout.int-spec.ts › 013b CA-14` (3) | ✅ |
| CA-15 | `public-links.iso-spec.ts › ISO-30 a ISO-33`; `public-link-password-gate.spec.ts › CA-15` | ✅ |
| CA-16 | `packages/contracts/src/sharing.spec.ts › CA-16 (013b)` | ✅ |

## Seguridad
- Datos de cliente: sí. Aislamiento: `public-links.iso-spec.ts` ISO-30 (control: el enlace de A al techo da `429` aun con la correcta) e ISO-31 a ISO-33 (otro enlace de A, uno de B y uno sin contraseña sirven su propio archivo), 4 de 4 ✅. El visitante no tiene `actor` (ADR-0039) y el gate no ve el actor derivado ✅.
- Token: se lee del fragmento (`use-public-link-visit.ts:45`) y solo viaja en el cuerpo del POST (`public-link-visitor-api.ts`); sin query, cabeceras, `Referer`, `localStorage`, `sessionStorage` ni `console`. Título genérico y `noindex` (`(public)/enlace/page.tsx:8-11`) ✅.
- SEC-6: `credentials: 'omit'`, sin `Authorization`, directo a `API_PUBLIC_URL`; sin `route.ts`, `rewrites` ni `middleware` ✅.
- Techo: llave solo con el id del enlace (`public-link-password-gate.ts:16,39`); sin contraseña no cuenta; con el techo activo, `429` sin Argon2id; un acierto no lo reinicia; `engagedLock` atómico (`redis-attempt-lockout.ts`), `public_link.locked` una vez; cotas del entorno 1–10 000 y ≥ `PUBLIC_LINK_MAX_FAILURES` ✅. R-2 (bloqueo con el token) aceptado en PD-175 y DF-91.
- Enumeración: inexistente, revocado, vencido, propietario suspendido y archivo en la papelera dan el mismo `404`; la web muestra un solo texto ✅.
- Bitácoras sin contenido, nombres de archivo, tokens, contraseñas ni IP (`public_link.password_failed` solo con `linkId`); sin eventos nuevos ✅. Roles internos: la página no lee la sesión y la cookie no viaja (Art. IX.1) ✅.
- Hallazgos:
  - **[SEC-7]** baja · `public-link-password-gate.ts:91`, `public-link-messages.ts:57-59` · el texto del `429` es neutro, pero los minutos cambian según el motivo (60 el techo, 15 la red, ≤ 1 el límite general) · **aceptado** en RN-1 (no da acceso ni intentos restantes; CA-5 pide {n} de la API), pendiente de que Adrián lo confirme.
  - **[SEC-8]** baja · `no-public-link-proxy.arch.spec.ts` · solo buscaba el literal `public-links` · **corregido** (`1c39274d`): falla ante `route.*` con `fetch`/`API_URL`/`API_PUBLIC_URL`, rutas catch-all bajo `src/app/api` y `pages/api`; cada caso se vio fallar.

## UI
- Coincide con el mockup aprobado (9 estados y 2 variantes): marco público, `IdentityCard`, baldosa con el color del tipo (`fileTypeColors`), avisos entre la ficha y la acción, `StateView` con `h1` oculto y título en `h2` ✅.
- Solo tokens, sin hex ni valores arbitrarios. Los selectores `[&_*]:` del `429` al abrir quedan aceptados en PD-189 ✅.
- Foco y `aria-*` correctos (`aria-invalid`, `aria-describedby` con error y ayuda, foco al campo tras el `403`); anuncios con `role="status"`/`"alert"`; «reducir movimiento» por la regla global de `globals.css`; axe con cero violaciones ✅.

## Bloqueantes
- Ninguno.

## Importantes y sugerencias
- **[I-1]** El catálogo definía `tone` y la vista lo escribía a mano (dos fuentes) · **corregido** (`12e63185`): `STATE_VIEW_BY_TONE` y `ALERT_VARIANT_BY_TONE`.
- **[I-2]** El PR-B choca con el #102 en `tasks.md`, `spec.md`, `plan.md` y `pendientes.md` · **resuelto**: merge de `main` en la rama web (`0939ffbc`), conservando lo del PR-A (T-01 a T-03 en `[x]`, PD-175 cerrado, PD-192).
- **[I-3]** Fechas «2026-11-08» cuando en hora de Guatemala era 2026-11-07 · **corregido** en las dos ramas.
- **[S-1]** `public-link-visit.tsx` (~375 líneas, funciones ≤ 30 y ≤ 3 parámetros) · partir estados y avisos cuando se resuelva PD-189 · no se aplica ahora.
- **[S-2]** `splitMessage` parte el texto por el punto · que el catálogo dé `{ title, description }` · no se aplica ahora.
- **[S-3]** a **[S-6]** · **corregidos** (`12e63185`): prueba de reenvío durante «Preparando…», `openUrl` obligatorio (YAGNI), caso renombrado a CA-10 y una sola constante `RETRY_ON_TINT`.
- **R-4 (T-04, `storage`):** sin regresión; ninguna aserción cambió y el único cambio de comportamiento es el declarado en `shared-file-detail` (commit `fix`, N-2).

## DF y pendientes
- DF: el PR-A actualiza DF-91 y `design-model.md` M3b; el PR-B no agrega ninguno.
- Pendientes nuevos: PD-189 (`StateView` con `tone="warning"`), PD-190 («1 minutos» en `error-catalog`) y PD-191 (tercera copia de «POST JSON + `safeParse`»), del PR-B; PD-192 (ayudantes de prueba de `sharing`), del PR-A. Sigue abierto PD-188. PD-175 se cierra con el PR-A.
- T-09 (humana, Fátima, 2026-11-08): recorrido de la demo y revisión manual de CA-11, todo ✅ (nota en `tasks.md` y en el PR-B).
