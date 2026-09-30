# Revisión 003 — PR-F «web» (T-48…T-54)

| Campo | Valor |
|---|---|
| Fecha | 2026-09-29 |
| Commit / rango revisado | `3e94f77` · `d6945d8..3e94f77` (rama `feat/003-web`) |
| Veredicto | ✅ Aprobar — sin bloqueantes; I-1…I-3, SEC-1, UI-1, UI-2 y F-1 corregidos en la misma rama; T-55 (recorrido humano) pendiente |

> Revisión del PR parcial F de 003 (plan §6.12). La revisión de PR-A está en `review.md`. Las secciones de
> Verificación, Seguridad y UI las escribieron `tester`, `security-auditor` y `ui-designer`; el resto, `reviewer`.
> Las correcciones posteriores a la revisión se listan al final.

## Verificación
> Lo escribe `tester`. Un CA sin prueba verde bloquea el veredicto.
> Alcance: **PR-F de 003** (web, T-48…T-54), rama `feat/003-web`, diff `d6945d8..HEAD` (incluye el commit de pruebas
> del tester `2b42fae`). T-55 (humana) y T-56 (cierre) quedan fuera de esta verificación.

Rutas relativas a `apps/web/src/`.

| CA | Prueba(s) | Nivel | Estado |
|---|---|---|---|
| CA-17 · el cliente llega a Mis archivos y la cuenta interna a su área | `features/access/home-path.spec.ts` › «CA-1: CLIENT va a Mis archivos», «%s va al área interna» (ADMIN, SUPPORT, OPERATOR), «cubre todos los roles de contracts»; el destino tras iniciar sesión es de 002: `features/identity/components/login-form.spec.tsx` › «CA-1: éxito → … va a /archivos», «CA-1: un rol interno va a /interno» | unit (componente) | ✅ |
| CA-17 · una ruta de cliente abierta por una cuenta interna la manda a su área | `features/access/components/require-role.spec.tsx` › «CA-17: una cuenta interna en una ruta de cliente va a /interno sin ver los hijos», «CA-17: %s en una ruta de cliente también va a /interno sin ver los hijos» (ADMIN, OPERATOR; tester), «CA-17: %s en una ruta interna ve los hijos sin redirección» (tester), «CA-17: un cliente en /interno va a /archivos sin ver los hijos»; `app/(app)/(interno)/layout.spec.tsx` › «CA-17: %s entra al área interna», «CA-17: un cliente que abre el área interna vuelve a /archivos sin verla» (tester) | unit (componente) | ⚠️ ver F-1 |
| CA-17 · área de marcador de la cuenta interna | `features/access/components/internal-area-placeholder.spec.tsx` › «CA-17: saluda por nombre y anuncia el área del rol en minúsculas», «CA-17: con %s nombra el área de %s», «CA-17: «Cerrar sesión» llama a onLogout», «CA-17: axe sin violaciones serias ni críticas»; `app/(app)/(interno)/interno/page.spec.tsx` › «CA-17: con una sesión de SUPPORT saluda por fullName…», «CA-17: «Cerrar sesión» usa la acción de cierre de 002», «CA-17: la página no tiene violaciones serias ni críticas de axe» (tester) | unit (componente) | ✅ |
| CA-17 · estado «sin permiso» (403) | `features/access/components/forbidden-state.spec.tsx` › «CA-17: muestra «Sin permiso» con el texto de §11 y el correo de soporte», «CA-17: muestra un ícono de candado», «CA-17: «Ir a mi inicio» lleva a %s → %s», «CA-17: el foco va al título al montar», «CA-17: la acción tiene un objetivo táctil de al menos 44 px», «no tiene violaciones graves de accesibilidad» | unit (componente + jest-axe) | ✅ (ver F-2, F-3) |
| CA-17 · estado «no encontrado» (404) | `features/access/components/not-found-state.spec.tsx` › «CA-17: con rol %s, «Ir a mi inicio» lleva a %s», «CA-17: sin sesión, «Ir al inicio» lleva a la raíz», «CA-17: el foco va al título al montar», «CA-17: la acción tiene un objetivo táctil de al menos 44 px», «no tiene violaciones graves de accesibilidad»; `app/not-found.spec.tsx` › «CA-17: muestra NotFoundState con «Ir al inicio» porque la raíz no tiene sesión», «no tiene violaciones graves de accesibilidad» | unit (componente + jest-axe) | ✅ |
| CA-17 · en español, con los componentes de 000b | Todas las anteriores afirman el texto exacto en español; los estados usan `StateView` y `Button` de 000b (`components/nimbo/state-view`); `features/access/role-labels.spec.ts` › «CA-17: nombra cada rol en español» | unit | ✅ |
| CA-17 · a 360 y 1440 px | Sin prueba automatizada: jsdom no mide el diseño. Diferido a la revisión del `ui-designer` en T-55 y a los E2E con Playwright + `@axe-core/playwright` (PD-41, Fase 2) | manual / e2e | ⏳ diferido |
| CA-17 · mensajes del catálogo (T-54) | `lib/error-catalog.spec.ts` › «CA-17: sin permiso, mensaje en español con la acción de escribir a soporte», «CA-1 y CA-17: la web no muestra el message del servidor, solo el de su catálogo» | unit | ✅ |
| CA-1 (web) | `lib/error-catalog.spec.ts` › «CA-1: sin sesión válida, mensaje en español con la acción de iniciar sesión», «CA-1 y CA-17: la web no muestra el message del servidor…». La renovación ante 401 es de `auth-fetch` (002), fuera de este PR. La parte HTTP de CA-1 está en PR-A (T-15, T-17) | unit | ✅ |
| CA-5 (experiencia) | `features/access/components/require-role.spec.tsx` › «CA-5: sin sesión no decide ni muestra los hijos (lo hace SessionGate)» y los casos de redirección anteriores. La barrera real (403 del servidor) está en PR-A/PR-D (T-16, T-42) | unit (componente) | ✅ |
| CA-11 (web) | `features/access/components/not-found-state.spec.tsx` › «CA-11: muestra el mismo texto exista o no el recurso»; `app/not-found.spec.tsx` (mismo texto). El 404 uniforme por HTTP es de PR-D (T-46). **Con archivos reales: diferido a 005** (D-1) | unit | ✅ (parte web) · ⏳ 005 |

Pruebas agregadas por el tester (commit `2b42fae`, `test(web): … [003 PR-F]`):
- `features/access/components/require-role.spec.tsx`: ADMIN y OPERATOR en una ruta de cliente (antes solo SUPPORT) y los
  tres roles internos en una ruta interna.
- `app/(app)/(interno)/layout.spec.tsx` (nuevo): el layout del grupo `(interno)` deja pasar a los tres roles internos
  y devuelve al cliente a `/archivos` sin mostrar el contenido. Antes ninguna prueba fijaba la lista `allowed` real.
- `app/(app)/(interno)/interno/page.spec.tsx`: axe sobre la página completa (con el `h1` «Área interna»).

| RNF | Evidencia | Estado |
|---|---|---|
| RNF-13 (estados «sin permiso» y «no encontrado» en español, AA) | Textos exactos y jest-axe sin violaciones serias ni críticas en los cinco componentes y páginas; foco al título al montar | ✅ en componentes · 360/1440 px ⏳ T-55 / PD-41 |

| Suite | Resultado | Cobertura |
|---|---|---|
| lint / typecheck | ✅ `pnpm lint` y `pnpm typecheck` (el tester repitió `pnpm lint` y `pnpm --filter web typecheck` después de su commit) | — |
| unit | ✅ api 672 · web **300/300** en 67 suites (290 + 10 del tester; `pnpm --filter web exec jest`) | Archivos de PR-F: líneas 100 %, sentencias 98,7 %, ramas 92,6 % (sin rama: `use-focus-title-on-mount.ts:12`, título ausente; `error-catalog.ts:106`, `correlationId` por omisión). Los archivos de los grupos `(app)` no entran en la medición porque el glob no acepta los paréntesis |
| int | ✅ 378/378. `dotenv-bootstrap` falló la primera vez porque el `.env` local estaba desactualizado; tras regenerarlo desde `.env.example` pasa (es de entorno, no de PR-F) | — |
| isolation | ✅ 97/97 | — |
| env:check | ✅ | — |
| e2e | No aplica en 003: PD-41 (Fase 2) | — |

Migraciones: PR-F no agrega ninguna.

Hallazgos de verificación:
- **[F-1] (menor, sin bloqueo) El layout del grupo `(cliente)` no tiene prueba.** `app/(app)/(cliente)/layout.tsx`
  (`RequireRole allowed={['CLIENT']}`) es la pieza que hace cumplir «una ruta de cliente abierta por una cuenta interna
  redirige a su área». `RequireRole` está probado con `['CLIENT']`, pero ninguna prueba fija que el layout real use esa
  lista: si alguien la cambia (p. ej., a los cuatro roles), ninguna prueba falla. El tester no puede escribirla porque la
  carpeta `(cliente)` queda fuera de su alcance en esta tarea. Propuesta: `app/(app)/(cliente)/layout.spec.tsx`, simétrica
  a la de `(interno)` (cliente → ve los hijos; ADMIN/SUPPORT/OPERATOR → `replace('/interno')` y sin hijos). CA afectado:
  CA-17.
- **[F-2] (observación) `ForbiddenState` no se monta en ninguna pantalla.** El plan §6.9 dice que «las pantallas que
  reciben 403 o 404 de la API muestran `ForbiddenState` o `NotFoundState`». En 003 ninguna pantalla recibe un 403 por rol
  (`/cuenta/seguridad` es de los cuatro roles), así que el componente queda listo y probado, pero sin uso. El primer
  módulo con rutas `@Roles` limitadas que tenga pantalla (005 u 011) debe conectarlo y probarlo. CA afectado: CA-17
  (parte «cuando una respuesta es 403»).
- **[F-3] (observación) El objetivo táctil de 44 px se prueba por la clase `h-11`, no por la medida.** jsdom no calcula
  el diseño, así que es la mejor prueba posible en unitarias; la medida real se confirma en T-55 (360 px) o en los E2E de
  PD-41.
- **[F-4] (observación para `ui-designer`) Jerarquía de encabezados.** `StateView` usa `h3`: en `/interno` se pasa de
  `h1` a `h3`, y el `not-found` raíz no tiene `h1`. axe lo clasifica como moderado (`heading-order`,
  `page-has-heading-one`), así que no rompe CA-17 («sin violaciones serias»), pero conviene revisarlo en T-55.

Criterios sin prueba automatizable, diferidos:
- **CA-17 a 360 y 1440 px, y la redirección real en el navegador** (iniciar sesión como cliente y como cuenta interna,
  abrir `/archivos` como interna y una ruta inexistente): recorrido humano **T-55** con revisión del `ui-designer`
  (`ui-review.md`) y E2E con Playwright + axe a 360/1440 px en **PD-41** (Fase 2). T-55 está sin marcar en `tasks.md`.
- **CA-11 con archivos reales, CA-10 y CA-14**: diferidos a **005** (D-1, plan §6.11). Fuera de PR-F.

**Veredicto de verificación de PR-F: ✅ con condiciones.** Todo lo que PR-F puede probar con pruebas de componentes
tiene prueba verde. CA-17 no queda cerrado del todo mientras falten T-55 (360/1440 px, recorrido real) y, en la Fase 2,
PD-41. F-1 conviene resolverlo antes del merge (una prueba de ~20 líneas).

## Seguridad
> Lo escribe `security-auditor`. Alcance: PR-F de 003 (T-48…T-54), rama `feat/003-web`, rango `d6945d8..3e94f77`
> (solo `apps/web` y `tasks.md`). Además se cubren los tres puntos que T-56 pide al auditor (tiempos del 404,
> superficie residual de 15 min y secretos de BD), que son de la API y ya están en la base.

- Aplica: sí. La spec toca autorización (CA-5, CA-11 y CA-17 en la web) y mensajes de error de `shared`.
- **Veredicto: ✅ Sin hallazgos bloqueantes**
- Pruebas ISO agregadas: ninguna. El PR no agrega endpoints ni casos de uso de la API. `pnpm test:isolation` está en
  verde (97/97, informado por el orquestador y no repetido). CA-11 en la API ya está cubierto por
  `apps/api/test/int/shared/not-found-uniformity.int-spec.ts`, que compara estado, cabeceras y cuerpo byte a byte con el
  mismo `x-correlation-id`.

### Hallazgos

- **[SEC-1] baja** · `apps/web/src/app/(app)/(cliente)/layout.tsx:11`, `apps/web/src/app/(app)/(interno)/layout.tsx:11`
  y `apps/web/src/app/(app)/(cliente)/archivos/page.tsx:8` (Server Component). **Riesgo:** los layouts son Server
  Components que pasan `children` a `RequireRole`, que es un Client Component. En el App Router, esos `children` se
  renderizan en el servidor y viajan en la carga RSC **aunque `RequireRole` devuelva `null`**. Hoy no se filtra nada:
  `/archivos` es un marcador estático y `/interno/page.tsx` es `'use client'` y lee la sesión en el navegador. Pero
  cuando 005, 006 u 011 escriban páginas de servidor bajo `(interno)` o `(cliente)` con datos, esos datos llegarán a
  cualquier sesión (y a quien no tenga sesión, porque `SessionGate` también es de cliente) antes de que la UI
  «decida». La barrera real sigue en la API: el token vive en memoria del navegador, así que un Server Component no
  puede traer datos autorizados. Por eso la severidad es baja y no hay una fuga actual. **Corrección sugerida:** dejar
  escrito en `features/access/README.md`, o en el JSDoc de `RequireRole`, que las páginas bajo `(app)` no hacen
  *fetch* de datos de cliente ni internos en el servidor: todo dato se pide desde el cliente con el token, a través de
  `auth-fetch`. Si más adelante se necesita SSR con datos, la protección tiene que ir en el servidor (middleware o
  verificación de sesión en el layout), no en `RequireRole`.

- **[SEC-2] baja** (fuera del diff; punto «secretos de BD» de T-56) ·
  `apps/api/src/shared/infrastructure/config/secret-keys.ts:7`. **Riesgo:** `SECRET_KEYS` lista `MINIO_*`,
  `SMTP_PASSWORD` y `JWT_ACCESS_SECRET`, pero no `DATABASE_URL` ni `DATABASE_MIGRATION_URL`, que llevan la contraseña de
  `nimbo_app` y la del dueño dentro de la URL. `env-report.ts` nunca imprime valores (bien), pero `REDACTED_FIELDS`
  deriva de `SECRET_KEYS`. Si alguna vez se registra un objeto con esas claves (por ejemplo, un volcado de
  configuración o un error de arranque que incluya la configuración), la bitácora no las redactaría.
  `NIMBO_APP_DB_PASSWORD` solo la leen compose y el script de rol, no la `api`. **Corrección sugerida:** agregar
  `DATABASE_URL` y `DATABASE_MIGRATION_URL` a `SECRET_KEYS`, o bien una redacción específica para URLs con
  credenciales, con una prueba en `redacted-fields.spec.ts`. Es defensa en profundidad y no bloquea.

- **[SEC-3] informativa** (fuera del diff, código de 001) · `apps/web/src/features/identity/components/register-form.tsx:47`
  muestra `issue.message` de `fields` tal como lo envía la API, en lugar de mapear `issue.reason` con
  `messageForReason`. No filtra datos (son mensajes de validación del propio usuario), pero se aparta de la regla «la
  web no muestra el texto del servidor» que T-54 aplica a `SHARED_*`. Queda para 001 si se quiere uniformar.

Sin hallazgos críticos, altos ni medios.

### Puntos revisados del PR

- **`RequireRole`** (`features/access/components/require-role.tsx:19-29`): con un rol que no está en `allowed` devuelve
  `null` y redirige con `router.replace`. Sin `user` devuelve `null`. Nunca renderiza los hijos antes de decidir. Mientras la
  sesión carga, `SessionGate` solo muestra «Cargando tu sesión…». Las pruebas comprueban que el rol equivocado **no**
  ve los hijos (`require-role.spec.tsx`, CA-17 con los tres roles internos). El JSDoc lo declara «experiencia, no
  barrera», y la barrera está en la API: `JwtAuthGuard` y `RolesGuard` de `shared` en `main` niegan por defecto (401 sin
  `@Public()`, 403 sin `@Roles()`, CA-7). El rol se lee de la sesión en memoria que devuelve la API. Si alguien lo
  manipula en el navegador, solo ve el marcador estático del área interna, y la API sigue rechazando.
- **Rutas internas visibles:** el *chunk* de `/interno` es descargable por cualquiera, como todo JS de Next, pero solo
  contiene textos de marcador y `ROLE_LABELS`. No trae endpoints, secretos ni nombres de herramientas internas.
- **`NotFoundState` y `app/not-found.tsx`:** un único texto constante («No encontramos lo que buscas. Puede que no
  exista o que no tengas acceso.») sin variantes por causa. La acción solo cambia según haya sesión o no, nunca según
  el recurso. Los destinos son constantes (`/`, `homePathFor`), así que no hay redirección abierta. CA-11 se cumple en la
  web.
- **`lib/error-catalog.ts`:** `SHARED_UNAUTHENTICATED` y `SHARED_FORBIDDEN` tienen texto propio. Un código desconocido
  cae en el genérico. La prueba «la web no muestra el message del servidor» comprueba que ni el `message` ni el
  `correlationId` aparecen en el texto.
- **`ForbiddenState` e `InternalAreaPlaceholder`:** muestran solo textos fijos, el `fullName` de la **propia** sesión
  (React lo escapa; no hay `dangerouslySetInnerHTML`) y la etiqueta del rol. `SUPPORT_CONTACT_EMAIL` viene de
  `@nimbo/contracts` (`identity/legal.ts`) como constante pública. No muestran identificadores, tokens ni rutas de la API.
- **Secretos y depuración:** el diff no tiene `console.*`, `process.env`, `NEXT_PUBLIC_*` ni credenciales. La web
  sigue sin variables `NEXT_PUBLIC_*` (CA-29 de 001).

### Puntos de T-56

- **Diferencias de tiempo del 404:** en la API, el 404 de lo ajeno y el de lo inexistente son idénticos en estado,
  cabeceras y cuerpo (prueba citada arriba). Hoy el recurso de sonda está en memoria, así que la diferencia de tiempo es
  de microsegundos y no se puede explotar por red. **Riesgo residual aceptado**, con una condición para 005: la
  consulta real tiene que filtrar por `accessibleNodes(actor)` dentro de **la misma** sentencia
  (`WHERE id = $1 AND …`). No vale buscar primero por id y comprobar la propiedad después, porque eso crea dos caminos
  con costos distintos (índice y RLS). La prueba de CA-11 con archivos reales en 005 debe repetir la comparación byte a
  byte.
- **Superficie residual de 15 min:** un rol suspendido conserva su token de acceso hasta 15 min, porque el guard no
  consulta la base (002 D-10, spec §13, plan §7b). En la web, `RequireRole` usa el rol de ese mismo token y no amplía la
  ventana. **Aceptado**, porque los roles no cambian (R-2). Hay que revisarlo si 011 permite cambiar el rol o suspender
  cuentas internas.
- **Secretos de BD:** son tres credenciales en variables de entorno. La contraseña de `nimbo_app` pasa por una variable
  de `psql` y no por concatenación. `DATABASE_MIGRATION_URL` tiene su propio esquema y no cae a la de la app. Los valores
  de `.env.example` son solo para el entorno local. Queda [SEC-2] como mejora.

### Checklist del Art. IX (lo que aplica a este PR)

| Punto | Estado |
|---|---|
| Autorización real en la API; la UI no es barrera | ✅ (guards de `shared`; `RequireRole` documentado como experiencia) |
| La UI no filtra contenido del rol no permitido mientras decide | ✅ hoy; ver [SEC-1] para páginas de servidor futuras |
| 404 uniforme «no existe» / «sin acceso» (CA-11) | ✅ web y API |
| Mensajes del servidor no se muestran (`SHARED_*`) | ✅ |
| Roles internos sin contenido, vista previa, URL firmada ni `objectKey` | ✅ (el área interna es un marcador sin datos) |
| Secretos solo en backend; nada en `NEXT_PUBLIC_*` ni en el repo | ✅ (las URLs de BD no se redactan: [SEC-2]) |
| Bitácoras sin datos sensibles | ✅ (la web no registra nada; sin `console.*`) |
| Dependencias nuevas | N/A (ninguna) |
| Pruebas ISO | N/A (sin endpoints nuevos); suite en verde 97/97 |

## UI

- Aplica: sí (CA-17, RNF-13; spec §11, plan §6.9).
- Veredicto: ✅ con observaciones. No hay violaciones `serious` ni `critical` de axe, ni colores escritos a mano ni
  desbordamiento a 360 px, y los textos coinciden con §11. Hay dos hallazgos de severidad media (UI-1 y UI-2) que
  conviene corregir antes de cerrar la Fase 1, pero no bloquean.
- Pantallas revisadas: no hay mockup, por la decisión explícita D-8 («sin mockups nuevos»). La referencia son los
  componentes de 000b (`StateView`, `Button`) y el marcador anterior de `/interno`. Las capturas se tomaron de la
  implementación (`next dev` de `feat/003-web` en el puerto 3012, con Playwright 1.49 y axe-core 4.x, tags
  wcag2a/aa, wcag21a/aa y best-practice) y la API se simuló interceptando `/auth/session/refresh` y
  `/auth/session/logout`. Se guardaron fuera del repositorio, en
  `…/scratchpad/review-003f/capturas/`: por §8 de `ui-guidelines.md` no van a `docs/design/capturas/`, y
  `e2e/__screenshots__/` todavía no existe (PD-41).
- `ForbiddenState` no está montado en ninguna ruta. Su captura es una **simulación**: se reproduce su DOM (mismas
  clases de `StateView`, candado, título, descripción y acción) sobre la página 404. El componente real queda cubierto
  por `forbidden-state.spec.tsx` (jest-axe).

| Pantalla | Estado | 360 px | 1440 px | axe | Captura |
|---|---|---|---|---|---|
| 404 de rutas (`app/not-found.tsx`) | sin sesión | ✅ | ✅ | ✅ (solo `moderate: page-has-heading-one`) | `no-encontrado--sin-sesion--{360,1440}.png` |
| 404 de rutas | foco en la acción (Tab) | ✅ anillo `ring` visible | ✅ | — | `no-encontrado--foco-accion--{360,1440}.png` |
| Sin permiso (`ForbiddenState`) | simulado | ✅ | ✅ | ✅ (solo `moderate: page-has-heading-one`) | `sin-permiso--simulado--{360,1440}.png` |
| Área interna (`/interno`) | ADMIN / SUPPORT / OPERATOR | ✅ (nombre largo en 2 líneas) | ✅ | ✅ (solo `moderate: heading-order`) | `area-interna--{admin,support,operator}--{360,1440}.png` |
| Área interna | cerrando sesión (API con 3 s de retraso) | ❌ sin progreso (UI-1) | ❌ | — | `area-interna--cerrando-sesion--{360,1440}.png` |
| Redirección por rol | SUPPORT abre `/archivos` → `/interno`; CLIENT abre `/interno` → `/archivos` | ✅ | ✅ | — | (se verificó la URL final) |

Mediciones: todos los botones miden 44 px de alto («Ir al inicio» 96×44, «Ir a mi inicio» 112×44, «Cerrar sesión»
124×44). `lang="es"`, un `main` por página y `scrollWidth` igual a `clientWidth` a 360 px. Contraste con tokens ya
verificados en §2: título `foreground` #1E2D40 sobre `card` #FAFCFF (≈ 14:1), descripción `muted-foreground` #5E7389
sobre `card` (4,76:1), texto blanco sobre `primary` #4A6FA5 (5,11:1). No aparece ningún par nuevo. El grep de hex y
de valores arbitrarios en los archivos del diff no encuentra nada.

### Hallazgos de 003

- **[UI-1] Media** · `features/access/components/internal-area-placeholder.tsx:27` y
  `app/(app)/(interno)/interno/page.tsx:19` · «Cerrar sesión» no da respuesta mientras espera a la API. Con la API
  retrasada 3 s, el botón sigue habilitado, sin `aria-busy` ni spinner, y admite más clics, cada uno con su propio
  `logout` (ver `area-interna--cerrando-sesion--1440.png`). Es una **regresión**: el marcador anterior usaba
  `SignOutButton` (002), que sí muestra `loading`, se deshabilita y lleva el ícono `LogOut`. Por eso `/archivos` y
  `/interno` presentan hoy la misma acción de dos formas distintas (DRY, RNF-14). · Corrección: reutilizar
  `SignOutButton` en `/interno`, en la fila del `h1` como en `/archivos`, y quitar la acción de `StateView` en
  `InternalAreaPlaceholder`, o pasarle el botón como hijo si el marcador lo admite. §11 pide «con "Cerrar sesión"»,
  no que esté dentro de la tarjeta. Si se quiere mantener dentro de la tarjeta, hace falta primero UI-A (000b).
- **[UI-2] Media** · `features/access/components/use-focus-title-on-mount.ts:13-14` · Al enfocar el `h3` con
  `tabIndex = -1`, Chromium dibuja el contorno por defecto del navegador (negro o `auto`, pegado al texto) en cuanto
  carga la página (ver `no-encontrado--sin-sesion--1440.png` y `sin-permiso--simulado--360.png`). No es el anillo
  `ring` de Cielo Sereno y queda como un recuadro áspero sobre el título. El foco programático en un elemento que no
  es interactivo no necesita un indicador visible (2.4.7 aplica a componentes operables), así que el recuadro solo
  añade ruido. · Corrección: quitar el contorno solo en ese destino de foco, por ejemplo con `focus:outline-none` en el
  título cuando tiene `tabIndex = -1`. Lo limpio es que lo haga `StateView` (UI-B). Mientras tanto, el hook puede
  añadir la clase utilitaria `outline-none` al nodo en lugar de un estilo en línea.
- **[UI-3] Baja** · `app/not-found.tsx:8` · La 404 no tiene `h1` (axe `moderate: page-has-heading-one`), y `/interno`
  pasa de `h1` a `h3` (axe `moderate: heading-order`). La causa es el `h3` fijo de `StateView` (UI-A). No es
  `serious`, así que no incumple CA-17. · Corrección: cuando exista `headingLevel` en `StateView`, usar `h1` en la
  404 y en `ForbiddenState` como pantalla completa, y `h2` en `/interno`. Hasta entonces se acepta y queda anotado.
- **[UI-4] Baja** · `features/access/components/{forbidden-state,not-found-state}.tsx` · «Ir a mi inicio» e «Ir al
  inicio» son `<button>` con `router.push`, aunque son navegación: no se anuncian como enlace y no permiten abrir en
  otra pestaña ni copiar la dirección. No incumple WCAG. · Corrección: pasar a `href` cuando `StateAction` lo admita
  (UI-C). Se acepta como diferencia intencional mientras tanto.
- **[UI-5] Baja** · `features/access/components/not-found-state.tsx:14,33` · El mensaje de §11 funciona como título
  y no hay descripción. A 360 px el título ocupa 3 líneas en negrita y queda desbalanceado frente a `ForbiddenState`,
  que tiene título corto («Sin permiso») y descripción. La spec no fija un título, así que la decisión es defendible.
  · Sugerencia: título corto («No encontrado» o «No encontramos esta página») con el texto de §11 como descripción,
  igual que en `ForbiddenState`. Requiere una nota en el plan §6.9, porque cambia el nombre accesible del
  encabezado que comprueban las pruebas.
- **[UI-6] Baja** · `app/not-found.tsx:8` · La 404 se muestra sin cabecera ni marca: es la única pantalla sin
  sesión que no lleva `PublicHeader`, porque la raíz queda fuera del grupo `(public)`. Además, «Ir al inicio» lleva
  a `/`, que hoy es la página de estado y la galería de 000b, no una portada. · Sugerencia: envolver la 404 con
  `PublicHeader`, cuyo enlace «Iniciar sesión» ya ofrece una salida útil, y revisar el destino de «Ir al inicio»
  cuando exista la portada.
- **[UI-7] Baja (documentación)** · `docs/sdd/ui-guidelines.md` §7 · El inventario no tiene filas para
  «Sin permiso / No encontrado» (shared, 003) ni para «Área interna (marcador)» (backoffice, 003). · Corrección:
  agregarlas con «Decisión explícita (spec 003 §11, D-8)», como la fila de «Recuperar / restablecer contraseña». Lo
  hace `ui-designer` en `/mockup` o en el cierre T-56.

### Hallazgos de 000b (`StateView`), fuera del alcance del PR-F

- **[UI-A] Media** · `components/nimbo/state-view.tsx:73` · El título es siempre `h3`, sin nivel configurable. Esto
  impide tener un `h1` en pantallas completas (404/403) y rompe el orden de encabezados bajo un `h1` (causa de
  UI-3). · Corrección: una prop `headingLevel?: 1 | 2 | 3` (o `titleAs`) que conserve el mismo estilo.
- **[UI-B] Media** · `components/nimbo/state-view.tsx:73` · `StateView` no permite enfocar su título: no tiene
  `titleRef` ni `autoFocusTitle`. 003 lo resuelve buscando `querySelector('h3')` desde fuera
  (`use-focus-title-on-mount.ts:11`), lo que acopla el hook a un detalle interno. Si UI-A cambia el nivel, el foco
  deja de funcionar sin error visible (las pruebas de 003 lo detectarían). · Corrección: `autoFocusTitle` o
  `titleRef` en `StateView`, con `tabIndex={-1}` y `focus:outline-none` en el título (resuelve también UI-2).
- **[UI-C] Baja** · `components/nimbo/state-view.tsx:9-13, 86-94` · `StateAction` solo acepta `onClick`. No admite
  `href`, `loading` ni `icon`, lo que obliga a navegar con botones (UI-4) y no deja mostrar progreso en la acción
  (UI-1). · Corrección: `href` (y renderizar `<a>` con `buttonVariants`, o `Link` de Next), `loading` y `icon`
  opcionales.

### Checklist

| Punto | Estado |
|---|---|
| Coincide con el mockup / diferencias explicadas | ✅ Sin mockup por D-8. Se reutilizan `StateView` y `Button` de 000b |
| Sin hex ni valores arbitrarios | ✅ grep limpio en el diff |
| Reutiliza `components/ui` y `components/nimbo`, sin duplicar | ⚠️ UI-1: no reutiliza `SignOutButton` |
| Contraste AA; foco visible; color no es el único diferenciador | ✅ sin pares nuevos. Anillo `ring` en los botones; íconos decorativos con texto. ⚠️ UI-2 (contorno del navegador en el título) |
| 360 px sin desplazamiento horizontal; objetivos ≥ 44 px (plan §6.9) | ✅ 44 px de alto en todos |
| Estados de vacío, carga y error; progreso en operaciones > 2 s; errores con acción correctiva | ⚠️ UI-1 (cerrar sesión sin progreso). 403 y 404 tienen acción correctiva |
| `aria-live` en progreso; `prefers-reduced-motion` | ✅ N/A: sin animaciones nuevas |
| Límites y precios desde la API; español con tuteo | ✅ Textos de §11 literales. Correo desde `SUPPORT_CONTACT_EMAIL` |
| La UI no sugiere permisos que el servidor niega | ✅ `RequireRole` redirige: SUPPORT → `/interno`, CLIENT → `/archivos`. Es experiencia; la barrera es la API (CA-5) |
| axe sin `serious`/`critical` | ✅ solo `moderate` (UI-3) |
| Foco al título al montar (plan §6.9) | ✅ en 403 y 404. `/interno` deja el foco en `body`, correcto para una página y no para un estado |

## Bloqueantes
Ninguno.

## Importantes (no bloquean, deben atenderse antes de cerrar la fase)

- **[I-1]** `apps/web/src/app/(app)/(interno)/layout.tsx:11` y `apps/web/src/features/access/home-path.ts:8`: qué roles
  son internos está escrito en dos sitios y de forma distinta. `homePathFor` lo define por exclusión (todo lo que no
  es `CLIENT` va a `/interno`), mientras que el layout pone una lista literal con `ADMIN`, `SUPPORT` y `OPERATOR`.
  Hoy coinciden. Si mañana se agrega un rol a `ROLES`, `ROLE_LABELS` no compila (bien), pero `homePathFor` lo manda a
  `/interno` y el layout de `(interno)` no lo deja pasar. `RequireRole` hace `router.replace('/interno')` sobre la
  misma ruta y la página queda en blanco para siempre. Ninguna prueba lo detecta (ver el desvío 6). No es una barrera
  de seguridad (esa es CA-5), pero sí es conocimiento de roles repetido (Art. VI).
  Corrección: definir los grupos una sola vez en `features/access/home-path.ts` y derivar todo de ahí. Por ejemplo,
  `CLIENT_ROLES` como `readonly RoleName[]` con `CLIENT`, `INTERNAL_ROLES` como `ROLES` filtrado sin `CLIENT`, y
  `homePathFor` resuelto con `INTERNAL_ROLES.includes(role)`. Los dos layouts usan `allowed={CLIENT_ROLES}` y
  `allowed={INTERNAL_ROLES}`, y `require-role.spec.tsx` y `home-path.spec.ts` los importan en vez de repetir la
  lista. Con eso, la falta de pruebas de los layouts (desvío 6) deja de importar.

- **[I-2]** `apps/web/src/lib/error-catalog.ts:50` frente a `specs/003-roles-y-acceso/plan.md:201`: el mensaje de
  `SHARED_FORBIDDEN` agrega «a {SUPPORT_CONTACT_EMAIL}», y el plan dice «…escríbenos.». El cambio es correcto: la
  acción es más concreta y coincide con §11. Pero el código y el plan no pueden contradecirse, y la prueba
  (`error-catalog.spec.ts`) fija el texto del código. Corrección: actualizar `plan.md` §6.2 (línea 201) con el texto
  que ya está implementado. No va a `design-findings.md`, porque no se aparta de ningún diagrama ni del E-R.

- **[I-3]** `specs/003-roles-y-acceso/tasks.md` (Bloque 5): se marcaron T-48…T-54 como hechas, pero el bloque no tiene
  una nota de evidencia (los bloques anteriores sí la tienen: comandos y conteos) ni registra los seis desvíos
  declarados. Corrección: agregar al final del Bloque 5 una nota «Pruebas (Docker)» con los conteos de los gates
  (api 672, web 290, int 378/378, iso 97/97, env:check) y, en «Notas», una línea por desvío: 1 (va con I-2), 2 y 3
  (limitaciones de `StateView` de 000b, con PD, ver S-1 y S-2), 4 (ver S-3), 5 (ver S-4) y 6 (resuelto por I-1).

## Sugerencias

- **[S-1]** `apps/web/src/features/access/components/use-focus-title-on-mount.ts:11-13` (desvío 3): el hook depende de
  que `StateView` dibuje su título como `h3` y cambia el DOM de React a mano (`tabIndex = -1`). Si 000b cambia el nivel
  del encabezado, el foco deja de moverse sin avisar (las pruebas actuales sí lo detectarían, porque comparan
  `document.activeElement`). Para 003 se acepta. Cuando lo necesite una segunda feature (los estados de error de 005
  lo van a necesitar), conviene llevarlo a `StateView` como prop (`focusTitleOnMount`, con `ref` y `tabIndex` -1
  dentro del componente) y borrar el hook. Registrarlo en `pendientes.md`, no en `design-findings.md`.

- **[S-2]** `apps/web/src/features/access/components/forbidden-state.tsx:27` y `not-found-state.tsx:33` (desvío 2):
  «Ir a mi inicio» e «Ir al inicio» navegan, así que semánticamente son enlaces. Como botones con `router.push`, no
  se pueden abrir en otra pestaña ni copiar. axe no lo marca y CA-17 se cumple, así que se acepta. La corrección de
  fondo es de 000b: que `StateAction` acepte `href` y dibuje un `Link` con estilo de botón. Registrarlo junto con S-1
  como un único pendiente de `StateView`.

- **[S-3]** `apps/web/src/app/not-found.tsx:8-10` y `apps/web/src/app/(app)/(interno)/interno/page.tsx:17` (desvío 4):
  la 404 no tiene `h1`, y su encabezado es un `h3` con una oración larga. En `/interno` se salta de `h1` a `h3`. Son
  reglas `moderate` de axe (`page-has-heading-one`, `heading-order`) que el filtro de las pruebas, que solo mira
  `serious`/`critical`, no ve. Una opción barata: en `not-found.tsx`, un `h1` con `sr-only` («Página no
  encontrada»). Que lo decida el `ui-designer` en su sección; no hace falta registrarlo en la spec.

- **[S-4]** `apps/web/src/app/(app)/(interno)/interno/page.tsx:18` (desvío 5): «Cerrar sesión» llama a `signOut()` sin
  estado de carga, mientras que `SignOutButton` (002) sí lo tiene. Así quedan dos versiones de la misma acción, y un
  doble clic dispara dos `logout` (son idempotentes, así que no hay daño). Se acepta en un marcador que 011
  reemplaza. Si se quiere unificar: `InternalAreaPlaceholder` puede recibir un `ReactNode` de acción y la página le
  pasa `SignOutButton`. Conservar el `h1` «Área interna» está bien: da un encabezado de página.

- **[S-5]** `apps/web/src/lib/error-catalog.spec.ts` (prueba «la web no muestra el message del servidor»): arma un
  `ApiClientError` con el mensaje del servidor, pero `messageForCode` nunca recibe ese mensaje, así que la aserción
  principal no puede fallar. Lo que la prueba sí comprueba es que los `SHARED_*` no caen en el mensaje genérico (que
  incluye el `correlationId`). Hay dos salidas: renombrarla a «CA-1 y CA-17: los códigos SHARED_* tienen mensaje
  propio, no el genérico» y quitar el `serverMessage`, o probar el camino real (un componente que recibe el
  `ApiClientError`).

- **[S-6]** Pruebas sin el prefijo `CA-n:` que pide el plan §9: las de axe en `forbidden-state.spec.tsx`,
  `not-found-state.spec.tsx` y `not-found.spec.tsx`, y «cubre todos los roles de contracts» en
  `role-labels.spec.ts`. Basta con anteponer `CA-17:`.

- **[S-7]** `apps/web/src/app/not-found.tsx`: «Ir al inicio» lleva a `/`, que hoy es la página de estado y la galería
  de componentes de 000b. No es una puerta de entrada para un usuario. Conviene revisarlo en T-55. Si molesta, la 404
  raíz podría llevar a `/iniciar-sesion` (así lo resolvería `SessionGate` para quien tenga sesión), con el cambio
  anotado en la spec.

- **[S-8]** `forbidden-state.tsx:13` y `not-found-state.tsx:15`: los textos de §11 viven en los componentes y no en
  el catálogo (Art. VI.3, «mensajes de error visibles → catálogo»). Por ahora se acepta, porque el plan §6.9 los ubica
  ahí y ningún código de la API los usa todavía. Cuando 005 agregue `STORAGE_NODE_NOT_FOUND` al catálogo con el mismo
  texto de «no encontrado», conviene que las dos lecturas salgan de una sola constante.

## Sobre los desvíos declarados

| # | Evaluación | ¿Registrar? |
|---|---|---|
| 1 | Correcto: coincide con §11 y la acción es más concreta. | Sí, en `plan.md` §6.2 (I-2). No va a `design-findings.md`. |
| 2 | Aceptable. Es una limitación de `StateView` (000b). | Sí, en `pendientes.md` (S-2), junto con el 3. |
| 3 | Aceptable, aunque frágil. | Sí, en `pendientes.md` (S-1). |
| 4 | Aceptable: la spec no fija un título. Falta un `h1` (S-3). | No. Lo decide el `ui-designer`. |
| 5 | Aceptable en un marcador. | No (S-4 opcional). Basta una línea en las Notas de `tasks.md`. |
| 6 | Aceptable solo si se resuelve I-1. Hoy la lista de roles del layout es conocimiento sin prueba. | Nota en `tasks.md`. |

Ninguno de los seis va a `design-findings.md`: no tocan clases, puertos ni tablas de `design-model.md`.

## Checklist
| Aspecto | Estado |
|---|---|
| Cumple spec y criterios | ✅ CA-17 (componentes + jest-axe), CA-11 (texto único en la web) y CA-1 (catálogo). T-55 pendiente para 360/1440 px |
| SOLID | ✅ Componentes con una sola responsabilidad. `InternalAreaPlaceholder` recibe la acción por props |
| YAGNI (sin abstracciones ni código especulativo) | ✅ Nada fuera del plan §6.9 |
| DRY (fuentes únicas respetadas) | ⚠️ Roles internos duplicados (I-1). Textos de §11 fuera del catálogo (S-8) |
| Código limpio | ✅ Funciones cortas, nombres claros, comentarios de «por qué» |
| Fronteras de módulos y capas | ✅ `features/access` usa la sesión de `features/identity` y `StateView` de `components/nimbo`. No importa de mockups |
| Seguridad y aislamiento | ✅ `RequireRole` se declara solo experiencia; la barrera es CA-5. No se muestra el `message` del servidor |
| Bitácoras sin datos sensibles | N/A (solo web) |
| Migraciones reversibles | N/A |
| Pruebas suficientes y significativas | ⚠️ Buenas y con CA. Una aserción no puede fallar (S-5), faltan prefijos (S-6) y la lista de roles del layout no tiene prueba (I-1) |
| UI: tokens de `ui-guidelines.md`, sin hex, componentes reutilizados, estados completos | ✅ Sin hex ni valores arbitrarios. `StateView`/`Button` de 000b. Objetivos de 44 px (`h-11`). Encabezados, ver S-3 |
| Documentación actualizada | ⚠️ `plan.md` §6.2 (I-2). Notas y evidencia del Bloque 5 (I-3) |

## Lo que está bien hecho
- `RequireRole` es pequeño y correcto. Calcula el destino durante el render, redirige en un efecto que depende de un
  `string` (así las listas literales del layout no provocan redirecciones repetidas) y, mientras decide, no muestra a
  los hijos. Deja la sesión ausente a `SessionGate` y dice en su comentario que no es una barrera.
- `ROLE_LABELS` como `Record<RoleName, string>` exhaustivo: un rol nuevo no compila sin su etiqueta.
- `homePathFor` se reutiliza donde ya lo había creado 002 (`login-form.tsx`), sin una segunda copia.
- `InternalAreaPlaceholder` es puro, con la acción de cierre por props. Se prueba sin sesión y la página solo conecta.
- Las pruebas cubren lo que pide la tarea con nombres `CA-n:`: foco al título, objetivo táctil, las dos variantes de
  «inicio» y jest-axe en cada estado. La página `/interno` se prueba contra el `SessionProvider` real y verifica la
  llamada a `logout`.
- `SUPPORT_CONTACT_EMAIL` sale de `contracts` en los dos textos, sin crear otra constante de correo (plan §6.9).

## Correcciones aplicadas tras la revisión

| Hallazgo | Corrección |
|---|---|
| I-1 | `CLIENT_ROLES` e `INTERNAL_ROLES` en `features/access/home-path.ts` (`INTERNAL_ROLES` derivado de `ROLES`); los usan `homePathFor` y los dos layouts |
| I-2 | Nota en `plan.md` §6.2: la API dice «escríbenos.»; el catálogo de la web añade el correo (spec §11) |
| I-3 | Evidencia del Bloque 5 y desvíos del PR-F en `tasks.md` |
| F-1 | `app/(app)/(cliente)/layout.spec.tsx`: el cliente entra; los tres roles internos vuelven a `/interno` sin ver el contenido |
| SEC-1 | JSDoc de `RequireRole`: las páginas bajo `(cliente)`/`(interno)` no piden datos desde el servidor |
| SEC-2 | Fuera del PR: `docs/sdd/pendientes.md` PD-51 |
| UI-1 | `/interno` usa el `SignOutButton` de 002 junto al `h1` (carga, sin doble cierre, con prueba); `InternalAreaPlaceholder` ya no recibe `onLogout` |
| UI-2 | `useFocusTitleOnMount` añade `outline-none` al título enfocado (con prueba) |
| UI-A, UI-B, UI-C | Fuera del PR (000b): `docs/sdd/pendientes.md` PD-50 |

Gates tras las correcciones: `pnpm --filter web exec jest` 68 suites, 308/308; `typecheck` y `lint` de web en verde.
