# Plan 013b — Página del enlace público (web) y techo global de fallos

> Spec: `./spec.md` · Estado del plan: Aprobado
> Obligatorio y ≤ 250 líneas. Dice **qué** archivos se tocan y **qué** se espera de cada uno; no es el código en
> prosa (sin cuerpos de funciones ni pseudocódigo). Lo aprueba Adrián antes de escribir código.

## 1. Resumen técnico
- **Dos PR** (`workflow.md` §4.6; Adrián aceptó pasar de los 12 archivos de §4.1, PR #100, M-1).
  - **PR-A (api)**, T-01 a T-03: entrega el techo de PD-175 y el texto de S-3, y cierra PD-175.
  - **PR-B (web)**, T-04 a T-09: entrega el refactor de la descarga, los mockups y la página. Se integra después de PR-A.
  - No hay un tercer PR.
- **Techo (CA-12 a CA-15):** `PublicLinkPasswordGate` suma una segunda llave sobre el mismo `IAttemptLockout`,
  `sharing:link-fail-all:<enlaceId>`. Orden de `check`:
  1. Si el enlace no tiene contraseña, pasa (nunca cuenta, CA-15).
  2. Si el techo está activo (`check(techo)`), `429` con la espera, sin Argon2 ni reserva por red. Sin contraseña y
     con el techo activo también da `429`, no `403` (CA-12).
  3. Si la contraseña falta (`isMissing`), `403` sin contar (013 CA-12).
  4. Reserva por enlace y red de 013, sin cambios, y Argon2.
  5. Si falla, `recordFailure(techo, política)`. Un acierto solo libera la reserva por red (`clear`), así que el
     techo no se reinicia (RN-3).
- **De dónde sale «activó»:**
  - `RedisAttemptLockout` ya lo calcula de forma atómica en `RECORD_FAILURE_SCRIPT`: devuelve `{1, lock_ms}` solo al
    fallo que cruza el máximo. Hoy `toLockState` lo descarta.
  - `recordFailure` pasa a devolver `FailureRecord`: `{ locked: false }` o
    `{ locked: true; retryAfterSeconds; engagedLock }`. Es un subtipo de `LockState`, así que
    `identity/application/auth.service.ts:121`, que solo lee `locked`, no cambia. El script tampoco cambia.
  - Con fallos simultáneos, solo uno recibe `engagedLock: true` porque el script Lua es atómico. El gate une el
    `engagedLock` del techo y el de la red, y `PublicLinkAccessService` audita una sola vez sin cambios (CA-14).
- **Web:** `app/(public)/enlace/page.tsx` es un componente de servidor que pasa `API_PUBLIC_URL`, como
  `verificar-correo`. El resto corre en el navegador, dentro de `features/sharing`:
  - un cliente del visitante sin sesión (`requestJson`, `credentials: 'omit'`, CA-9);
  - un hook con los estados;
  - la vista de los 9 estados.
- **Token (CA-8):** se lee el fragmento crudo `#<token>` (`linkUrl`, `public-links.controller.ts:52`) sin borrarlo
  (S-1). No es una copia de `useFragmentToken` de `identity`: ese lee `#token=`, es de un solo uso y lo borra. Por
  eso no hay deuda DRY ni PD.
- **Descarga (M-3, T-04):**
  - «Preparando… a los 2 s y una petición a la vez» ya está tres veces en `storage`. Se extrae a
    `usePreparingDownload` en `lib/` (Art. VI.2) y lo usan esos tres sitios y la página.
  - La firma se queda en ≤ 3 parámetros. `download` devuelve `Promise<boolean>`: `true` si de verdad arrancó y
    `false` si el hook lo ignoró porque ya había una petición en curso (N-1). Cada sitio que lo llama envuelve lo
    suyo: `file-row-menu` limpia el aviso (`onNotice(null)`) y cierra el menú (`setOpen(false)`) solo si arrancó.
    Así un segundo clic sigue sin hacer nada, como en el código actual, y lo prueba un doble clic en
    `file-row-menu.spec.tsx`.
  - **T-04 sí cambia el comportamiento:** `shared-file-detail` gana «una petición a la vez», y lo prueba un doble
    clic que debe dar una sola petición. Ese cambio va en un commit `fix(storage): … [013b T-04]`, separado del
    `refactor(storage)` (N-2).
- **S-3 (CA-16):** solo cambia el texto `INVALID_PASSWORD`. `createPublicLinkSchema` no se toca.

## 2. Módulos, archivos y diseño
| PR | Módulo / capa | Archivo (nuevo o cambiado) | Responsabilidad |
|---|---|---|---|
| A | contracts | `packages/contracts/src/sharing.ts` | `SHARING_FIELD_MESSAGES.INVALID_PASSWORD` = «Escribe una contraseña de 8 a 128 caracteres.» (CA-16, T-02) |
| A | shared (de Adrián, P-A) | `application/rate-limit/i-attempt-lockout.port.ts`, `infrastructure/rate-limit/redis-attempt-lockout.ts`, `index.ts`, `README.md` del módulo | Tipo `FailureRecord` (§1) exportado y fila de `IAttemptLockout` del README; `recordFailure` devuelve el `engagedLock` que el script ya calcula. Sin métodos nuevos; `check`, `reserveAttempt` y `clear` no cambian |
| A | shared (de Adrián, P-A) | `infrastructure/config/env.schema.ts`, `.env.example` | `PUBLIC_LINK_GLOBAL_MAX_FAILURES_PER_HOUR` (`intBetween(1, 10 000, 100)` y ≥ `PUBLIC_LINK_MAX_FAILURES` en `refineApiEnv`, #102 M-2), junto a las `PUBLIC_LINK_*` de 013 (`pnpm env:check`) |
| A | sharing | `application/sharing-config.ts`, `sharing.module.ts` | `SharingConfig.publicLinkCeiling: LockoutPolicy`: `maxFailures` sale del entorno; `windowSeconds` y `lockSeconds` valen 3600, con una constante con nombre (S-2) |
| A | sharing | `application/public-link-password-gate.ts`, `README.md` del módulo | El orden de §1, con los pasos del techo en métodos privados (≤ 30 líneas, ≤ 3 parámetros); `engagedLock` es el de la red o el del techo. El README actualiza la fila de `POST /download` y el flujo del gate (m-1) |
| B | web/lib (P-C) | `apps/web/src/lib/use-preparing-download.ts`, `lib/format-date.ts` | `usePreparingDownload<T>(requestUrl, onFailure, openUrl = openInBrowser)` devuelve `{ preparing: T \| null, download(arg): Promise<boolean> }` (`true` si arrancó, N-1): «Preparando…» pasados `PREPARING_DELAY_MS`, una petición a la vez y limpieza del temporizador. `PREPARING_DELAY_MS` y `openInBrowser` se mudan aquí. `expiresAtLabel(iso)` da «14 nov 2026, 14:30» con los formateadores que ya existen (`dateTimeLabel` da «hoy, 14:30», I-1) |
| B | web/storage (de Adrián, P-C) | `features/storage/components/file-row-menu.tsx`, `components/shared-file-detail.tsx`, `hooks/use-version-download.ts` | Usan `usePreparingDownload` y envuelven lo suyo en quien llama (§1): `file-row-menu` hace `onNotice(null)` y `setOpen(false)` solo si `download` arrancó (N-1); `use-version-download` guarda la versión en `preparing`. `shared-file-detail` gana «una petición a la vez» (cambio de comportamiento declarado). `file-row-menu.tsx` deja de definir y exportar `PREPARING_DELAY_MS` y `openInBrowser`, sin reexportarlos (m-2) |
| B | web (solo imports, P-C) | `features/storage/components/file-detail-view.tsx`, `own-file-detail.tsx`, `quick-access-sidebar.tsx`; `features/sharing/components/received-shares-view.tsx` | Importan `openInBrowser` de `lib/use-preparing-download.ts`; nada más cambia. Las pruebas `storage/a11y.spec.tsx`, `file-detail-view.spec.tsx` y `file-row-menu.spec.tsx` importan `PREPARING_DELAY_MS` del mismo sitio |
| B | web/app | `apps/web/src/app/(public)/enlace/page.tsx` | `export const metadata` con `title` «Archivo compartido · Nimbo» y `robots: { index: false }` (CA-8, S-5); monta `PublicLinkVisit` con `env.API_PUBLIC_URL` |
| B | web/sharing (cliente y textos) | `features/sharing/public-link-visitor-api.ts`, `public-link-messages.ts`, `index.ts` | `createPublicLinkVisitorApi(apiPublicUrl)` (detalle abajo). Catálogo `code` → `{ title, tone }` como `ShareMessage` (Art. VI): `SHARING_LINK_UNAVAILABLE`, `SHARING_LINK_PASSWORD_INVALID`, red/5xx al abrir y al descargar (dos textos, CA-7) y `SHARED_TOO_MANY_REQUESTS` con texto neutro propio (M-2). `index.ts` exporta `PublicLinkVisit` |
| B | web/sharing (estado y vista) | `features/sharing/hooks/use-public-link-visit.ts`, `components/public-link-visit.tsx`, `public-link-password-form.tsx` | Hook, vista y formulario (detalle abajo). Solo tokens de `ui-guidelines.md` |
| B | diseño (T-05, `ui-designer`) | `docs/design/mockups/sharing/enlace-publico/` (generador `_generadores/enlace-publico/generar.js` sobre `marco/marco.js`), `docs/design/capturas/sharing/enlace-publico/`, `ui-guidelines.md` §7 | 9 estados a 360 y 1440 px (18 PNG). El HTML actual pasa a `--propuesta` y el README se corrige (spec §6). La fila 302 se parte en «Enlace público (página)» y «Enlace público (diálogo)» |

12 filas.

**Detalle de las filas largas de PR-B:**
- **Cliente del visitante** (`createPublicLinkVisitorApi(apiPublicUrl)`):
  - `open(token)` y `download(token, password?)` con `requestJson` y `credentials: 'omit'`;
  - respuestas validadas con `publicLinkDetailsSchema` y `downloadUrlSchema`;
  - el cuerpo lleva solo `token` y `password` (013 D-4), y `password` se omite si está vacía.
- **Texto del `429` (M-2):** «Hubo demasiados intentos con este enlace. Espera {n} minutos e inténtalo de nuevo.»,
  con {n} desde `retryAfterSeconds` con `minutesFrom` de `lib/error-catalog.ts` (hacia arriba, mínimo 1; se exporta,
  S-3), y el caso «1 minuto» en `public-link-visit.spec.tsx`. No usa el genérico de `error-catalog.ts:374` y no dice el motivo (RN-1).
- **Hook `use-public-link-visit.ts`:**
  - lee el fragmento crudo y escucha `hashchange`;
  - con el fragmento vacío pasa a `unavailable` sin llamar a la API (CA-6);
  - cada pedido del fragmento (montaje, `hashchange` o «Reintentar») vive en un estado con su ficha y su aviso, y un solo `useEffect` hace el `POST /open`; llega después de montar, así el doble montaje de `StrictMode` no lo repite, y nada de un pedido anterior (ni su `/open` ni su descarga) se aplica (PD-194);
  - estados: `loading`, `ready`, `unavailable`, `rate-limited`, `load-error`;
  - `download(password?)` usa `usePreparingDownload` y termina en `started` o en el error.
- **Vista `public-link-visit.tsx`:** los 9 estados de spec §6, con:
  - `IdentityCard`, `FileTypeIcon` + `receivedFileType`, `formatBytes`, `expiresAtLabel`;
  - `StateView` para no-disponible y error-carga;
  - `Alert` de advertencia con `role="status"` para el `429` y la red al descargar (S-8);
  - `Alert` `success` con `role="status"` para la descarga iniciada (CA-3).
- **Formulario `public-link-password-form.tsx`:**
  - `PasswordField` (P-B), `autoComplete="off"`, `maxLength` = `PUBLIC_LINK_PASSWORD_MAX_LENGTH`;
  - con el campo vacío no envía nada;
  - con error: `aria-invalid`, mensaje con `role="alert"`, campo vacío y foco (CA-4).

**Archivos de producción, sin maquillar:**
- **PR-A: 9 de código y 1 documento.**
  - Código: `sharing.ts` (contracts), `i-attempt-lockout.port.ts`, `redis-attempt-lockout.ts`, `shared/index.ts`,
    `env.schema.ts`, `.env.example`, `sharing-config.ts`, `sharing.module.ts`, `public-link-password-gate.ts`.
  - Documento: `apps/api/src/modules/sharing/README.md` (m-1). El README de `shared` también cambia (fila de
    `IAttemptLockout`).
  - Pruebas y fixtures que cambian: 8. Son las 5 de PR-A en §6, más `load-env.spec.ts`,
    `minio-config.module.spec.ts` y el mock bloqueado de `auth.service.spec.ts:144`, que suma `engagedLock`.
- **PR-B: 12.**
  - `use-preparing-download.ts`, `format-date.ts`;
  - `file-row-menu.tsx`, `shared-file-detail.tsx`, `use-version-download.ts`;
  - `page.tsx`, `public-link-visitor-api.ts`, `public-link-messages.ts`, `sharing/index.ts`;
  - `use-public-link-visit.ts`, `public-link-visit.tsx`, `public-link-password-form.tsx`.
  - Con la opción (a) de P-B, que eligió Adrián, son **17**: se suman `components/nimbo/password-field.tsx` y sus 4
    importadores de `identity`. El movimiento va en un commit propio dentro de T-08, sin cambio de comportamiento.
  - Aparte cuentan 4 archivos de «solo imports» (fila «solo imports», m-2), 3 pruebas con solo imports, y los
    mockups y capturas. `lib/error-catalog.ts` solo exporta `minutesFrom` (S-3).
- Entre los dos PR son 26. Pasa de los 12 de `workflow.md` §4.1, y Adrián lo aceptó (PR #100, M-1).

**Puertos y dependencias:**
- **Puertos nuevos:** ninguno. `IAttemptLockout` solo amplía el tipo de retorno de `recordFailure`, de forma compatible.
- **Abstracciones nuevas:** `usePreparingDownload`, con cuatro usos de una misma regla de RNF-14 (Art. VI.2).
  `PublicLinkVisitorApi` es el tipo de una fábrica con una sola implementación, igual que `SharingApi` (012b).
- **Dependencias nuevas entre módulos:** ninguna en `api`. En web, `storage → lib` y `sharing → lib`, lo normal.
  No hay `sharing → identity`, porque en P-B se eligió (a).

**Reutilizar antes de crear** (buscado con Grep):
- `requestJson`/`ApiClientError`, `IdentityCard`, `PublicHeader` (por `(public)/layout.tsx`), `StateView`,
  `FileTypeIcon`, `receivedFileType` (012b), `formatBytes`, `PUBLIC_LINK_PASSWORD_MAX_LENGTH`,
  `publicLinkDetailsSchema` y `openInBrowser`.
- El patrón «Preparando…» de `file-row-menu.tsx:136`, `shared-file-detail.tsx:37` y `use-version-download.ts:32` se
  extrae a `usePreparingDownload` y se usa en los cuatro sitios.
- `messageForCode` no se reutiliza para el `429` de la página (M-2).

## 3. Datos
No aplica: sin tablas ni migraciones. El techo vive en Redis con la llave del enlace y caduca con la ventana. Ninguna
tabla guarda la IP (013 S-3), y la web no guarda nada en `localStorage` ni `sessionStorage`.

## 4. Contratos
Sin rutas ni esquemas nuevos. Lo que consume la página (013 §4):

| Método | Ruta | Rol | Request → Respuesta | Errores (`code`) que la web traduce |
|---|---|---|---|---|
| POST | `/api/v1/public-links/open` | público | `{ token }` → `200 PublicLinkDetails` | `404` `SHARING_LINK_UNAVAILABLE` (CA-6); `429` `SHARED_TOO_MANY_REQUESTS` (CA-5); red/5xx (CA-7) |
| POST | `/api/v1/public-links/download` | público | `{ token, password? }` → `200 { url, expiresAt }` | `404` `SHARING_LINK_UNAVAILABLE`; `403` `SHARING_LINK_PASSWORD_INVALID` (CA-4); `429` `SHARED_TOO_MANY_REQUESTS` con `Retry-After` (CA-5, CA-12) |

El techo responde el mismo `429` con `Retry-After`. En `POST /public-links` solo cambia el texto de
`fields[].message` para `INVALID_PASSWORD` (CA-16).

## 5. Seguridad y operación
- **Visitante sin `actor`:** ADR-0039 no cambia. El techo vive en `PublicLinkPasswordGate`, que no ve el actor
  derivado, y la auditoría sigue en `PublicLinkAccessService` (condición de Adrián, PR #87).
- **Llave del techo:** solo el id del enlace, sin red ni IP. Los enlaces sin contraseña salen antes y no cuentan (CA-15).
- **Concurrencia (S-2):**
  - `check(techo)` y `recordFailure(techo)` no son una sola operación. Con verificaciones simultáneas cerca del
    máximo, unas pocas pasan de 100.
  - Lo acotan Argon2, que corre como mucho 4 a la vez (013 R-3), y el límite por red (30/min).
  - Se acepta como techo aproximado, sin método atómico nuevo (YAGNI).
  - La auditoría sí es exacta: `engagedLock` sale del script atómico, así que se registra una sola vez (CA-14).
- **Bitácoras:** sin eventos nuevos; `password_failed` y `public_link.locked` siguen como en 013, sin token,
  contraseña ni IP.
- **Auditoría:** `PUBLIC_LINK_LOCKED` con `trigger: 'public_link'`.
- **Métricas:** ninguna.
- **Web:**
  - el token sale del fragmento solo hacia la API, en el cuerpo, y no va al título ni al almacenamiento del navegador;
  - `web` no tiene `route.ts` ni `rewrites` que reenvíen `/public-links` (CA-9);
  - sin `console.log`.

## 6. Estrategia de pruebas (por riesgo)
Cada tarea de lógica empieza por su prueba en rojo, y ningún CA se prueba en tres capas.

| PR | CA | Nivel | Archivo |
|---|---|---|---|
| A | CA-14 (`engagedLock`) | int | `apps/api/test/int/shared/redis-attempt-lockout.int-spec.ts`: `recordFailure` da `engagedLock: true` solo al fallo que bloquea, también con fallos simultáneos (el caso concurrente que ya existe) |
| A | CA-12, CA-13, CA-14, CA-15; orden de §1 | unit | `sharing/application/public-link-password-gate.spec.ts`: sin contraseña y con el techo activo es `429`; un acierto no limpia el techo; `engagedLock` de los dos; un enlace sin contraseña no toca el techo |
| A | CA-12, CA-13, CA-14 | int | `apps/api/test/int/sharing/public-link-access.int-spec.ts`: `describe` propio con su app y su entorno (patrón de las líneas 426 y 477), con `PUBLIC_LINK_GLOBAL_MAX_FAILURES_PER_HOUR` bajo y fallos desde varias redes `X-Forwarded-For`. Luego: `429` con `Retry-After` desde otra red aun con la contraseña correcta; `open` sigue en `200`; con fallos simultáneos en el umbral, un solo `public_link.locked` en «Mi actividad» |
| A | CA-15 | iso | `apps/api/test/isolation/public-links.iso-spec.ts`: techo bajado y fallos repartidos entre redes en un enlace de A; otro enlace de A, uno de B y uno sin contraseña siguen sirviendo |
| A | CA-16 | unit | `packages/contracts/src/sharing.spec.ts` |
| B | CA-3 (regla de RNF-14) | web | `lib/use-preparing-download.spec.ts` (temporizadores falsos: 2 s y una petición a la vez); `storage/components/shared-file-detail.spec.tsx` (nuevo; hoy no existe): doble clic en «Descargar» = una sola petición; las demás suites de `storage` siguen verdes sin cambiar aserciones |
| B | CA-1 (fecha) | unit | `lib/format-date.spec.ts` (`expiresAtLabel` absoluta, nunca «hoy») |
| B | CA-9 | web | `features/sharing/public-link-visitor-api.spec.ts`: URL = `API_PUBLIC_URL` + ruta, `credentials: 'omit'`, sin `Authorization`, cuerpo solo `token`/`password`. `apps/web/src/app/no-public-link-proxy.arch.spec.ts` (vigila toda la app): nada en `src/app` (`route.ts`) ni en `next.config.ts` reenvía `/public-links` |
| B | CA-1 a CA-7, CA-10 | web | `hooks/use-public-link-visit.spec.ts` (fragmento crudo, recarga, `hashchange`, vacío sin API, `StrictMode` sin repetir `POST /open`) y `components/public-link-visit.spec.tsx` (un caso por estado, textos por `code` con el `429` neutro, foco y `aria-invalid` de CA-4) |
| B | CA-8 | web | `app/(public)/enlace/page.spec.tsx`: importa `metadata` y comprueba el título y `noindex` |
| B | CA-11 (axe y anuncio de errores) | web | `features/sharing/a11y.spec.tsx` sobre los 9 estados. Axe en jsdom no evalúa el viewport ni el contraste |
| B | CA-11 (360 px sin desplazamiento, contraste AA a 360 y 1440 px, «reducir movimiento») | humana | T-09, con nota en el PR, y las capturas de T-05 |

## 7. Riesgos y coherencia con el diseño
- **R-1 Proxy accidental (SEC-6):** lo mitigan la prueba de arquitectura y CA-9. La configuración de staging
  (Traefik sin el puerto 3000 ni `forwardedHeaders.insecure`) es de 022 y 000.
- **R-2 El techo como palanca de negación de servicio (m-4):**
  - Quien tiene el token puede frenar la descarga una hora. Con unas 5 redes /64 (caben en un /48) la mantiene
    bloqueada de forma continua.
  - Es lo decidido en PD-175 («`429` para todos, sin inhabilitar el enlace»). La ficha sigue visible y el
    propietario lo ve en «Mi actividad» (CA-14).
  - El remedio de generar otro enlace llega con la UI de la 013c. Mientras tanto, el propietario puede revocar o
    reemplazar el enlace por la API (013 CA-4, CA-8). Sin PD nuevo (decisión de Fátima).
- **R-3 Token en la barra (S-1):** queda en el historial del visitante, que ya tiene ese secreto. No viaja en el
  `Referer` ni a `web`.
- **R-4 Refactor de `storage` en PR-B (T-04):**
  - Puede cambiar sin querer la descarga del explorador, de la ficha o del historial.
  - El único cambio de comportamiento declarado es «una petición a la vez» en `shared-file-detail`, con su prueba.
  - Lo demás lo cuidan las suites de `storage` sin tocar aserciones, y los imports actualizados se revisan uno a uno
    (fila «solo imports»).
- **Lectura en «Mi actividad» (m-3):** el techo global y el bloqueo por red se ven igual (`public_link.locked`, mismo
  `trigger`). Se acepta por YAGNI: ninguna spec pide distinguirlos y el propietario reacciona igual en los dos casos.
- **Desviaciones de los diagramas (m-7):** DF-91 y `design-model.md` M3b se actualizan al implementar T-01, en PR-A
  (`workflow.md` §4.10; la desviación la introduce el código de T-01, así que se registra en PR-A). Se agregan la llave del techo, `check`/`recordFailure` y
  `FailureRecord`. Sin DF nuevo.
- **`429` del límite general (N-4):** es por red, no por enlace, y aun así dice «con este enlace». Adrián lo
  aceptó por RN-1.
- **Pendientes:** PD-175 se cierra con PR-A. PD-188 (N-3): `plan-and-billing.tsx:179` tiene su propia copia de
  `openInBrowser`; `billing` pasa a usar la de `lib` en su próximo cambio. PD-189 (T-05): el borde de «Reintentar»
  `outline` no llega a 3:1 sobre advertencia y error; la página lo corrige solo para sí en T-08.
- **ADR:** ninguno.

**Preguntas para Adrián:**
- [RESUELTA 2026-11-07, Adrián: sí; agregar a Adrián como revisor de esos archivos] **P-A** ¿Autorizas a Fátima a cambiar en `shared`, en PR-A, `i-attempt-lockout.port.ts`,
  `redis-attempt-lockout.ts`, `index.ts`, `README.md`, `env.schema.ts`, sus pruebas y fixtures, y el mock de
  `identity/application/auth.service.spec.ts:144` (precedente: 013 P-4)? Si no, los haces tú y T-01 espera ese commit — bloquea: no
- [RESUELTA 2026-11-07, Adrián: (a), en un commit propio sin cambio de comportamiento] **P-B** `PasswordField` (`features/identity/components/password-field.tsx`) tiene 4 usos dentro de
  `identity`: inicio de sesión, cambiar contraseña, restablecer y crear cuenta. La página pública es su primer uso
  fuera de `identity`, y un componente genérico que usan dos features va en `components/nimbo/` (`architecture.md`,
  árbol de `apps/web`; `ui-guidelines.md` §4).
  - (a) Moverlo ahora a `components/nimbo/` en PR-B y actualizar los 4 importadores (toca `identity`, que es tuyo).
  - (b) Importarlo desde `identity` y moverlo después.
  - **Recomiendo (a)**, si lo autorizas — bloquea: no
- [RESUELTA 2026-11-07, Adrián: sí] **P-C** ¿Autorizas a Fátima a hacer, en PR-B (T-04, commit `refactor(storage): … [013b T-04]`):
  - crear `apps/web/src/lib/use-preparing-download.ts` y sumar `expiresAtLabel` a `lib/format-date.ts`;
  - cambiar `file-row-menu.tsx`, `shared-file-detail.tsx` y `use-version-download.ts` de `storage`;
  - actualizar los imports de `file-detail-view.tsx`, `own-file-detail.tsx`, `quick-access-sidebar.tsx` y sus tres
    pruebas (`storage/a11y.spec.tsx`, `file-detail-view.spec.tsx` y `file-row-menu.spec.tsx`);
  - exportar `minutesFrom` de `lib/error-catalog.ts` para el texto del `429`?

  — bloquea: no

## 8. Aprobación
- `architect`: no aplica. No hay puerto nuevo entre módulos, tecnología nueva ni cambio de arquitectura; el tipo de
  retorno de `recordFailure` se amplía de forma compatible.
- Adrián: **Aprobado** (2026-11-07, PR #100, 95 %). P-A, P-B (a) y P-C resueltas en §7; notas N-1 a N-4 aplicadas.
