# Plan 013b — Página del enlace público (web) y techo global de fallos

> Spec: `./spec.md` · Estado del plan: Propuesto
> Obligatorio y ≤ 250 líneas. Dice **qué** archivos se tocan y **qué** se espera de cada uno; no es el código en
> prosa (sin cuerpos de funciones ni pseudocódigo). Lo aprueba Adrián antes de escribir código.

## 1. Resumen técnico
- **Dos PR** (`workflow.md` §4.6, decisión de Fátima). **PR-A (api)** entrega el techo de PD-175 y el texto S-3, y
  cierra PD-175. **PR-B (web)** entrega los mockups y la página. PR-B se integra después de PR-A.
- **Refactor previo (decisión de Fátima, Art. I.4):** la extracción de `usePreparingDownload` y su uso en `storage`
  (P-C) va en un PR `refactor(web)` propio, sin cambio visible, antes de PR-B (como PD-177 antes de 013b).
- **Techo (CA-12 a CA-15):** `PublicLinkPasswordGate` suma una segunda llave sobre el mismo `IAttemptLockout`,
  `sharing:link-fail-all:<enlaceId>`. El orden de `check` es:
  1. Si el enlace no tiene contraseña, pasa (nunca cuenta, CA-15).
  2. Si el techo está activo (`check(techo)`), `429` con la espera, sin Argon2 ni reserva por red. Así, sin
     contraseña y con el techo activo da `429`, no `403` (CA-12).
  3. Si la contraseña falta (`isMissing`), `403` sin contar (013 CA-12).
  4. Reserva por enlace y red de 013, sin cambios, y Argon2.
  5. Si falla, `recordFailure(techo, política)`. Un acierto solo libera la reserva por red (`clear`) y no toca el
     techo, que por eso no se reinicia (RN-3).
- **De dónde sale «activó» (B-1):** `RedisAttemptLockout` ya lo calcula de forma atómica en `RECORD_FAILURE_SCRIPT`
  (`{1, lock_ms}` solo para el fallo que cruza el máximo) y hoy lo descarta en `toLockState`. `recordFailure` pasa a
  devolver `FailureRecord`: `{ locked: false }` o `{ locked: true; retryAfterSeconds; engagedLock }`, que es un
  subtipo de `LockState`. Por eso `identity/application/auth.service.ts:121`, que solo lee `locked`, no cambia.
  El script no cambia. Con fallos simultáneos solo uno recibe `engagedLock: true` (Lua es atómico). El gate une
  `engagedLock` del techo y de la red, y `PublicLinkAccessService` audita una vez, sin cambios (CA-14).
- **Web:** `app/(public)/enlace/page.tsx` es un componente de servidor que pasa `API_PUBLIC_URL`, como
  `verificar-correo`. El resto corre en el navegador, en `features/sharing`: un cliente del visitante sin sesión
  (`requestJson`, `credentials: 'omit'`, CA-9), un hook con los estados y la vista de los 9 estados.
- **Token (CA-8):** el fragmento crudo `#<token>` (`linkUrl`, `public-links.controller.ts:52`) se lee sin borrarlo
  (S-1). Es otro conocimiento que el de `useFragmentToken` de `identity` (`#token=` de un solo uso, que se borra),
  así que no es una copia: no hay deuda DRY ni PD.
- **Descarga:** el patrón «Preparando… a los 2 s y una petición a la vez» ya está tres veces en `storage`. Se extrae
  `usePreparingDownload` a `lib/` y lo usan la página y esos tres sitios (Art. VI.2, tercera repetición ya superada; P-C).
- **S-3 (CA-16):** solo cambia el texto `INVALID_PASSWORD`. `createPublicLinkSchema` no se toca.

## 2. Módulos, archivos y diseño
| PR | Módulo / capa | Archivo (nuevo o cambiado) | Responsabilidad |
|---|---|---|---|
| A | contracts | `packages/contracts/src/sharing.ts` | `SHARING_FIELD_MESSAGES.INVALID_PASSWORD` = «Escribe una contraseña de 8 a 128 caracteres.» (CA-16) |
| A | shared (de Adrián, P-A) | `application/rate-limit/i-attempt-lockout.port.ts`, `infrastructure/rate-limit/redis-attempt-lockout.ts`, `index.ts` | Tipo `FailureRecord` (§1) exportado; `recordFailure` devuelve el `engagedLock` que el script ya calcula. Sin métodos nuevos; `check`, `reserveAttempt` y `clear` igual |
| A | shared (de Adrián, P-A) | `infrastructure/config/env.schema.ts`, `.env.example` | `PUBLIC_LINK_GLOBAL_MAX_FAILURES_PER_HOUR` (`positiveInt`, 100), junto a las `PUBLIC_LINK_*` de 013 (`pnpm env:check`) |
| A | sharing | `application/sharing-config.ts`, `sharing.module.ts` | `SharingConfig.publicLinkCeiling: LockoutPolicy` (`maxFailures` del entorno; `windowSeconds` = `lockSeconds` = 3600, constante con nombre, S-2) |
| A | sharing | `application/public-link-password-gate.ts` | Orden de §1. Los pasos del techo van en métodos privados (≤ 30 líneas, ≤ 3 parámetros); `engagedLock` = el de la red o el del techo |
| B | web/app | `apps/web/src/app/(public)/enlace/page.tsx` | `export const metadata` con `title` «Archivo compartido · Nimbo» y `robots: { index: false }` (CA-8, S-5); monta `PublicLinkVisit` con `env.API_PUBLIC_URL` |
| B | web/sharing (cliente y textos) | `features/sharing/public-link-visitor-api.ts`, `public-link-messages.ts`, `index.ts` | `createPublicLinkVisitorApi(apiPublicUrl)`: `open(token)` y `download(token, password?)` con `requestJson`, `credentials: 'omit'`, validados con `publicLinkDetailsSchema`/`downloadUrlSchema`, cuerpo solo `token`/`password` (013 D-4). Catálogo `code` → `{ title, tone }` como `ShareMessage` (Art. VI): `SHARING_LINK_UNAVAILABLE`, `SHARING_LINK_PASSWORD_INVALID`, `SHARED_TOO_MANY_REQUESTS` (`messageForCode` con `retryAfterSeconds`), red/5xx. `index.ts` exporta `PublicLinkVisit` |
| B | web/sharing (estado) | `features/sharing/hooks/use-public-link-visit.ts` | Lee el fragmento crudo y escucha `hashchange`. Fragmento vacío → `unavailable` sin llamar a la API (CA-6). El `POST /open` en curso vive en un `ref`, así el doble montaje de `StrictMode` no lo repite. Estados `loading`, `ready`, `unavailable`, `rate-limited`, `load-error`; `download(password?)` con `usePreparingDownload` y el resultado `started` o el error |
| B | web/sharing (vista) | `features/sharing/components/public-link-visit.tsx`, `public-link-password-form.tsx` | Los 9 estados de spec §6 con `IdentityCard`, `FileTypeIcon` + `receivedFileType`, `formatBytes`, `expiresAtLabel`, `StateView` (no-disponible, error-carga), `Alert` de advertencia con `role="status"` (`429` y red al descargar, S-8) y `Alert` `success` con `role="status"` (descarga iniciada, CA-3). Formulario: `PasswordField` (P-B), `autoComplete="off"`, `maxLength` = `PUBLIC_LINK_PASSWORD_MAX_LENGTH`, vacío sin enviar; con error, `aria-invalid`, `role="alert"`, campo vacío y foco (CA-4). Solo tokens de `ui-guidelines.md` |
| R | web/lib (P-C) | `apps/web/src/lib/use-preparing-download.ts` | `usePreparingDownload<T>(requestUrl, onFailure, openUrl = openInBrowser)` → `{ preparing: T \| null, download(arg) }`: «Preparando…» pasados `PREPARING_DELAY_MS`, una petición a la vez y limpieza del temporizador. `PREPARING_DELAY_MS` y `openInBrowser` se mudan aquí |
| B | web/lib | `apps/web/src/lib/format-date.ts` | `expiresAtLabel(iso)` → «14 nov 2026, 14:30» con los formateadores que ya existen (`dateTimeLabel` da «hoy, 14:30», I-1) |
| R | web/storage (de Adrián, P-C) | `features/storage/components/file-row-menu.tsx`, `components/shared-file-detail.tsx`, `hooks/use-version-download.ts` | Usan `usePreparingDownload` sin cambiar lo que se ve. `file-row-menu.tsx` reexporta `PREPARING_DELAY_MS` y `openInBrowser`, así sus 8 importadores no cambian. `shared-file-detail` gana el «una petición a la vez» que ya tienen los otros dos |
| B | diseño (T-01, `ui-designer`) | `docs/design/mockups/sharing/enlace-publico/` (generador `_generadores/enlace-publico/generar.js` sobre `marco/marco.js`), `docs/design/capturas/sharing/enlace-publico/`, `ui-guidelines.md` §7 | 9 estados a 360 y 1440 px (18 PNG). El HTML actual pasa a `--propuesta` y el README se corrige (spec §6). La fila 302 se parte en «Enlace público (página)» y «Enlace público (diálogo)» |

13 filas (A = PR-A, R = refactor previo, B = PR-B). **Archivos de producción, sin maquillar:**
- **PR-A: 9.** `sharing.ts` (contracts), `i-attempt-lockout.port.ts`, `redis-attempt-lockout.ts`, `shared/index.ts`,
  `env.schema.ts`, `.env.example`, `sharing-config.ts`, `sharing.module.ts`, `public-link-password-gate.ts`. Pruebas y
  fixtures que cambian: 8 (las 5 de PR-A en §6, `load-env.spec.ts`, `minio-config.module.spec.ts` y el mock bloqueado
  de `auth.service.spec.ts:144`, que suma `engagedLock`). Documento: `shared/README.md` (fila de `IAttemptLockout`).
- **Refactor previo `refactor(web)`: 4.** `use-preparing-download.ts`, `file-row-menu.tsx`, `shared-file-detail.tsx`,
  `use-version-download.ts`.
- **PR-B: 8.** `page.tsx`, `public-link-visitor-api.ts`, `public-link-messages.ts`, `sharing/index.ts`,
  `use-public-link-visit.ts`, `public-link-visit.tsx`, `public-link-password-form.tsx`, `format-date.ts`. Si Adrián
  elige (a) en P-B, son **13** (`components/nimbo/password-field.tsx` y sus 4 importadores de `identity`). Aparte,
  mockups y capturas.
- En total son 21 (o 26) y pasa de los 12 de `workflow.md` §4.1. Fátima eligió dos PR (§4.6) y sacar P-C a un
  refactor propio (Art. I.4) en lugar de una tercera spec: ningún PR pasa de 9 archivos (13 con P-B (a)).
- **Puertos nuevos:** ninguno. `IAttemptLockout` solo amplía el tipo de retorno de `recordFailure` (compatible).
- **Abstracciones nuevas:** `usePreparingDownload` (cuatro usos de una misma regla de RNF-14, Art. VI.2).
  `PublicLinkVisitorApi` es el tipo de una fábrica con una sola implementación, igual que `SharingApi` (012b).
- **Dependencias nuevas entre módulos:** ninguna en `api`. En web, `storage → lib` y `sharing → lib` (lo normal).
  `sharing → identity` solo si se elige (b) en P-B.
- **Reutilizar antes de crear** (buscado con Grep): `requestJson`/`ApiClientError`, `messageForCode` (ya tiene el
  `429` con minutos), `IdentityCard`, `PublicHeader` (por `(public)/layout.tsx`), `StateView`, `FileTypeIcon`,
  `receivedFileType` (012b), `formatBytes`, `PUBLIC_LINK_PASSWORD_MAX_LENGTH`, `publicLinkDetailsSchema`,
  `openInBrowser`. El patrón «Preparando…» de `file-row-menu.tsx:136`, `shared-file-detail.tsx:37` y
  `use-version-download.ts:32` se extrae a `usePreparingDownload` y se usa en los cuatro sitios.

## 3. Datos
No aplica: sin tablas ni migraciones. El techo vive en Redis con la llave del enlace y caduca con la ventana; ninguna
tabla guarda la IP (013 S-3). La web no guarda nada en `localStorage` ni `sessionStorage`.

## 4. Contratos
Sin rutas ni esquemas nuevos. Lo que consume la página (013 §4):

| Método | Ruta | Rol | Request → Respuesta | Errores (`code`) que la web traduce |
|---|---|---|---|---|
| POST | `/api/v1/public-links/open` | público | `{ token }` → `200 PublicLinkDetails` | `404` `SHARING_LINK_UNAVAILABLE` (CA-6); `429` `SHARED_TOO_MANY_REQUESTS` (CA-5); red/5xx (CA-7) |
| POST | `/api/v1/public-links/download` | público | `{ token, password? }` → `200 { url, expiresAt }` | `404` `SHARING_LINK_UNAVAILABLE`; `403` `SHARING_LINK_PASSWORD_INVALID` (CA-4); `429` `SHARED_TOO_MANY_REQUESTS` con `Retry-After` (CA-5, CA-12) |

El techo es el mismo `429` con `Retry-After`. En `POST /public-links` solo cambia el texto de `fields[].message` para
`INVALID_PASSWORD` (CA-16).

## 5. Seguridad y operación
- **Visitante sin `actor`:** ADR-0039 no cambia. El techo vive en `PublicLinkPasswordGate`, que no ve el actor
  derivado, y la auditoría sigue en `PublicLinkAccessService` (condición de Adrián, PR #87).
- **Llave del techo:** solo el id del enlace, sin red ni IP. Los enlaces sin contraseña salen antes (CA-15).
- **Concurrencia (S-2):** `check(techo)` y `recordFailure(techo)` no son una sola operación. Con verificaciones
  simultáneas cerca del máximo, unas pocas pasan de 100: Argon2 corre como mucho 4 a la vez (013 R-3) y el límite
  por red (30/min) frena el ritmo. Se acepta como techo aproximado, sin método atómico nuevo (YAGNI). La auditoría
  sí es exacta: `engagedLock` sale del script atómico, así que es una sola vez (CA-14).
- **Bitácoras:** sin eventos nuevos (`password_failed` y `public_link.locked` de 013, sin token, contraseña ni IP).
  **Auditoría:** `PUBLIC_LINK_LOCKED` con `trigger: 'public_link'`. **Métricas:** ninguna.
- **Web:** el token sale del fragmento solo hacia la API, en el cuerpo. No va al título ni al almacenamiento del
  navegador. `web` no tiene `route.ts` ni `rewrites` que reenvíen `/public-links` (CA-9). Sin `console.log`.

## 6. Estrategia de pruebas (por riesgo)
Cada tarea de lógica empieza por su prueba en rojo; no se repite un CA en tres capas.

| PR | CA | Nivel | Archivo |
|---|---|---|---|
| A | B-1 (`engagedLock`) | int | `apps/api/test/int/shared/redis-attempt-lockout.int-spec.ts`: `recordFailure` da `engagedLock: true` solo al fallo que bloquea, también con fallos simultáneos (el caso concurrente que ya existe) |
| A | CA-12, CA-13, CA-14, CA-15; orden S-2 | unit | `sharing/application/public-link-password-gate.spec.ts`: sin contraseña y con el techo activo es `429`; un acierto no limpia el techo; `engagedLock` de los dos; un enlace sin contraseña no toca el techo |
| A | CA-12, CA-13, CA-14 | int | `apps/api/test/int/sharing/public-link-access.int-spec.ts`: `describe` propio con su app y su entorno (patrón de las líneas 426 y 477), `PUBLIC_LINK_GLOBAL_MAX_FAILURES_PER_HOUR` bajo y fallos desde varias redes `X-Forwarded-For`. Luego `429` con `Retry-After` desde otra red aun con la correcta, `open` sigue `200` y, con fallos simultáneos en el umbral, un solo `public_link.locked` en «Mi actividad» |
| A | CA-15 | iso | `apps/api/test/isolation/public-links.iso-spec.ts`: techo bajado, fallos repartidos entre redes en un enlace de A; otro enlace de A, uno de B y uno sin contraseña siguen sirviendo |
| A | CA-16 | unit | `packages/contracts/src/sharing.spec.ts` |
| B | CA-9 | web | `features/sharing/public-link-visitor-api.spec.ts` (URL = `API_PUBLIC_URL` + ruta, `credentials: 'omit'`, sin `Authorization`, cuerpo solo `token`/`password`); `apps/web/src/app/no-public-link-proxy.arch.spec.ts` (fuera de `features/sharing`, porque vigila toda la app): nada en `src/app` (`route.ts`) ni en `next.config.ts` reenvía `/public-links` |
| B | CA-1 a CA-7, CA-10 | web | `hooks/use-public-link-visit.spec.ts` (fragmento crudo, recarga, `hashchange`, vacío sin API, `StrictMode` sin repetir `POST /open`) y `components/public-link-visit.spec.tsx` (un caso por estado, textos por `code`, foco y `aria-invalid` de CA-4) |
| B | CA-8 | web | `app/(public)/enlace/page.spec.tsx`: importa `metadata` y comprueba el título y `noindex` |
| B | regla de RNF-14 | web | `lib/use-preparing-download.spec.ts` (temporizadores falsos: 2 s, una petición a la vez); las suites de `storage` siguen verdes sin cambiar aserciones |
| B | CA-11 (axe y anuncio de errores) | web | `features/sharing/a11y.spec.tsx` sobre los 9 estados (jsdom no mide contraste) |
| B | CA-11 (360 px sin desplazamiento, contraste AA, «reducir movimiento») | humana | T-08, con nota en el PR; capturas de T-01 |

## 7. Riesgos y coherencia con el diseño
- **R-1 Proxy accidental (SEC-6):** lo mitigan la prueba de arquitectura y CA-9. Staging (Traefik sin el puerto 3000
  ni `forwardedHeaders.insecure`) es de 022 y 000.
- **R-2 Techo como palanca de negación de servicio:** quien tiene el token puede frenar la descarga una hora. Es lo
  decidido en PD-175 («`429` para todos, sin inhabilitar el enlace»): la ficha sigue visible, el propietario lo ve en
  «Mi actividad» (CA-14) y puede generar otro enlace (013 CA-4).
- **R-3 Token en la barra (S-1):** queda en el historial del visitante, que ya tiene ese secreto. No viaja en el
  `Referer` ni a `web`.
- **R-4 Refactor de `storage` (PR `refactor(web)`):** puede cambiar sin querer la descarga del explorador. Lo mitigan las suites
  de `storage` sin tocar aserciones y la reexportación, que no cambia importadores.
- **Desviaciones de los diagramas:** DF-91 (aceptado) se actualiza con la llave del techo, `check`/`recordFailure` y
  `FailureRecord`, y `design-model.md` M3b también. Sin DF nuevo.
- **Pendientes:** PD-175 se cierra con PR-A. Sin PD nuevo. **ADR:** ninguno.

**Preguntas para Adrián:**
- [ABIERTA] **P-A** ¿Autorizas a Fátima a cambiar en `shared`, en PR-A, `i-attempt-lockout.port.ts`,
  `redis-attempt-lockout.ts`, `index.ts`, `README.md`, `env.schema.ts`, sus pruebas y fixtures, y el mock de
  `identity/application/auth.service.spec.ts:144` (precedente: 013 P-4)? Si no, lo haces tú y T-02 espera ese commit — bloquea: no
- [ABIERTA] **P-B** `PasswordField` (`features/identity/components/password-field.tsx`) tiene 4 usos dentro de
  `identity` (inicio de sesión, cambiar contraseña, restablecer y crear cuenta). La página pública es su primer uso
  fuera de `identity`, y un componente genérico usado por dos features va en `components/nimbo/` (`architecture.md`, árbol de `apps/web`;
  `ui-guidelines.md` §4).
  (a) moverlo ahora a `components/nimbo/` en PR-B y actualizar los 4 importadores (toca `identity`, que es tuyo);
  (b) importarlo desde `identity` y moverlo después. **Recomiendo (a)**, si lo autorizas — bloquea: no
- [ABIERTA] **P-C** ¿Autorizas a Fátima a crear `apps/web/src/lib/use-preparing-download.ts` y cambiar
  `file-row-menu.tsx`, `shared-file-detail.tsx` y `use-version-download.ts` de `storage` para usar el hook, en un PR
  `refactor(web)` propio antes de PR-B (y a sumar `expiresAtLabel` a `lib/format-date.ts` en PR-B)? — bloquea: no

## 8. Aprobación
- `architect`: no aplica (sin puerto nuevo entre módulos, sin tecnología nueva, sin cambio de arquitectura; el tipo de
  retorno de `recordFailure` se amplía de forma compatible).
- Adrián: pendiente (P-A, P-B y P-C en §7).
