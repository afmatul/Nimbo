# Defensa de Nimbo — qué está hecho, cómo funciona y por qué

Verificación del 30 de septiembre de 2026, sobre el repositorio `afmatul/Nimbo`.

Este documento es para explicar el sistema en voz alta: qué problema resuelve cada pieza, cómo está armada y por qué se eligió esa forma. La spec sigue siendo la fuente de verdad. Esto es una síntesis para la exposición, no un reemplazo de `specs/` ni de `docs/sdd/architecture.md`.

Hay tres grados, y conviene decirlos así:

| Marca | Significado |
|---|---|
| **En `main`** | El código ya está integrado y se puede recorrer en el repositorio. |
| **Diseñado** | Hay spec y plan aprobados. La forma de implementarlo está decidida. El código de producción todavía no está en ninguna rama remota. |
| **Arranque** | La spec y el plan existen en su rama. Falta descomponer en tareas y escribir el código. |

---

## 1. Qué se revisó, por separado

En este entorno el único worktree registrado del repositorio es el de `main`. Las otras líneas de trabajo viven como ramas remotas. Para no mezclarlas con `main`, se inspeccionaron en worktrees aparte (HEAD detached, solo lectura).

| Lugar | Commit | Qué hay |
|---|---|---|
| Worktree `/workspace`, rama `main` (= `origin/main`) | `a01bbff` — `test(access): arnés de aislamiento y rutas [003]` | Fundaciones (000, bloques 1–2), sistema de diseño (000b), registro y verificación (001) completos en API, worker y web, y el **mínimo de backend de la 003** (tareas T-01 a T-47). La 002 está solo como spec, plan y tareas. |
| Rama `origin/spec/005-carga-y-descarga`, worktree aparte | `56125a9` — `docs(storage): plan 005 en estado Aprobado [005]` | Spec 005 en estado `Lista` y plan **Aprobado**. Mockups de carga y explorador. ADR-0011, ADR-0012 y ADR-0021 en estado Propuesto. Sin `tasks.md` y sin código de `storage`. La rama va **8 commits por detrás de `main`** (todo el código de 001 y de 003) y 4 por delante (solo documentación). |
| Rama `origin/spec/006a-catalogo-y-limites`, worktree aparte | `fcf16d2` | Catálogo de planes a medias: T-01 a T-06 hechas (tabla `plan`, siembra, `PlanLimits` e `IPlanLimitsProvider` declarados en `storage`). T-07 a T-12 pendientes (el adaptador que de verdad lee la tabla). PR [#8](https://github.com/afmatul/Nimbo/pull/8) abierto. También va 8 commits por detrás de `main`. |

No hay rama remota `spec/002` ni commits de implementación de sesiones, login, JWT real ni dispositivos. La página `/iniciar-sesion` en `main` es un marcador que lo dice en el propio código: el inicio de sesión real llega con la 002.

El backlog de `specs/README.md` se quedó atrás del código: sigue marcando la 003 como «Planificada» y la 001 como «En revisión», cuando el mínimo de la 003 y el registro de la 001 ya están en `main`. Para la defensa, manda el código y las casillas de `tasks.md`, no esa tabla.

---

## 2. Mapa para la exposición

| Spec | Qué se puede afirmar hoy |
|---|---|
| 000 y 000b | El esqueleto del monorepo, compose, `shared`, logger, salud y el sistema de diseño Cielo Sereno ya están en `main`. CI, imágenes y staging siguen pendientes (desde el 30/09). |
| 001 | Una persona se registra, recibe un enlace por correo y verifica la cuenta. API, worker y web. |
| 002 | El diseño del inicio de sesión, las sesiones, los dispositivos y la recuperación está cerrado y aprobado. **El código no está en el remoto.** |
| 003 | El mínimo de servidor está en `main`: negación por defecto, `Actor`, roles, políticas de acceso, `withActor`, rol `nimbo_app` y la suite de aislamiento. Falta la web (T-48 a T-56) y falta el verificador JWT real, que lo pone la 002. |
| 005 | Está especificada y el plan está aprobado. Explica cómo se van a subir y bajar archivos usando lo que la 003 ya dejó preparado. El código de carga y descarga no existe todavía. |
| 006a | Dependencia de la 005 para los límites del plan. El arranque está en otra rama, incompleto. La 005 puede avanzar con un doble de prueba mientras tanto. |

---

## 3. La forma del sistema (decisiones que sostienen todo lo demás)

Nimbo es un almacenamiento como servicio. Lo que lo distingue de una nube genérica —edición colaborativa de `.docx`, historial con autoría e inteligencia documental con citas— llega en fases posteriores. La Fase 1 construye la base sin la cual eso no se puede defender: identidad, autorización y, a continuación, los bytes.

### Monolito modular, worker aparte

`web` (Next.js), `api` (NestJS) y `worker` (el mismo código de dominio, otro proceso) comparten PostgreSQL, Redis y MinIO. ADR-0001 lo justifica así: cuatro personas y el calendario del curso no pagan el costo de microservicios, y las fronteras por módulo permiten extraer un servicio el día que haga falta. El worker existe porque el correo, la limpieza de cargas y más adelante la indexación no deben vivir dentro del request HTTP.

Cada módulo tiene cuatro capas: `domain` (reglas, sin Nest ni TypeORM), `application` (servicios que orquestan puertos), `infrastructure` (TypeORM, Redis, SMTP, MinIO) y `presentation` (controladores que validan y delegan). Otro módulo solo importa el `index.ts` público. Eso lo vigila el lint de fronteras (ADR-0008).

### Por qué las specs mandan sobre el código

El proceso es Crystal Clear con Spec-Driven Development en versión lite: spec, tareas, implementación, revisión. ADR-0009. Si el código necesita comportarse distinto, primero se corrige la spec. Por eso este documento separa «diseñado» de «en `main`»: defender una decisión que está en el plan es válido; presentarla como si ya corriera, no.

---

## 4. Spec 001 — el cimiento que ya corre (En `main`)

La 002 y la 003 se apoyan en esto. Sin una cuenta verificada no hay sesión, y sin `usuario.rol` no hay `Actor`.

### Qué hace

`POST /auth/register`, `POST /auth/resend-verification` y `POST /auth/verify-email` son rutas públicas. `AuthController` valida el cuerpo con esquemas zod de `packages/contracts` (ADR-0020) y delega en `RegistrationService`. El controlador no tiene reglas de negocio.

El alta responde siempre `202` con `{ status: 'accepted' }`, exista o no el correo. Así nadie usa el registro para descubrir cuentas. La contraseña se guarda con Argon2id (`Argon2idHasher`, puerto `IPasswordHasher`). El enlace de verificación es un token opaco de un solo uso; en `token_cuenta` se persiste solo su hash. Pedir otro enlace invalida el anterior. Hay límite por correo (60 segundos y 5 por hora, juntos el registro y el reenvío) y límite por IP, con `@nestjs/throttler` y `IRateLimiter` sobre Redis.

El correo no se manda dentro de la transacción. `RegistrationService` confirma la escritura y después publica el mensaje en la cola `mail` a través de `IMailer` (ADR-0018). El `worker` lo entrega por SMTP; en local eso es Mailpit, con reintentos. Si el servidor de correo cae, el alta ya quedó hecha. Cuando la verificación se confirma, y solo después del commit, `identity` publica el evento `identity.client-account-verified` (ADR-0019) para que `billing` cree más adelante la suscripción. Hoy ese oyente todavía no está enlazado: el evento ya tiene productor.

En la web, el flujo de registro (plan elegido, formulario, «revisa tu correo», verificación) vive en `apps/web/src/features/identity/` y usa los tokens de Cielo Sereno. El plan elegido se queda en el navegador: no viaja en el `POST`. `/iniciar-sesion` muestra «Inicio de sesión disponible pronto».

### Decisiones que conviene poder explicar

- **Respuesta neutra y hash de Argon2id también cuando el correo no existe.** Si el alta de un correo nuevo tardara más que la de uno repetido, el tiempo delataría la cuenta. El mismo criterio lo va a repetir el login de la 002.
- **Token opaco con hash, nunca el valor en claro.** Art. IX.6. El mismo objeto `OpaqueToken` lo van a reutilizar el refresco, el dispositivo y el enlace de recuperación.
- **Correo por cola, evento después del commit.** Un rollback no debe enviar un enlace ni anunciar una cuenta que no existe.
- **Validación en `packages/contracts`.** La web y la API comparten el mismo esquema. No se agregó `class-validator` (ADR-0020 enmienda esa parte de ADR-0015).

Lo que la 001 dejó explícitamente para la 002: al verificar el correo **todavía no se abre sesión**. `verifyEmail` devuelve `verified` o `already-verified`. Abrir la sesión en ese momento es el CA-15 de la 002.

---

## 5. Spec 003 — roles y acceso, el mínimo que ya está en `main`

La promesa del producto es que los archivos de una persona no los ve nadie más, ni siquiera Administrador, Soporte u Operador, salvo que ella los comparta. Y que esa decisión se toma **dentro de la consulta**, no escondiendo botones ni filtrando una lista ya traída de la base.

La 003 entrega el mecanismo único. Las specs siguientes declaran qué rol exige cada ruta y reciben un `Actor` ya validado. No escriben su propia autorización.

Estado real de las tareas (`specs/003-roles-y-acceso/tasks.md`):

- **Hechas, en `main`:** T-01 a T-47. Son cuatro bloques: guards (PR-A), rol de base de datos y `withActor` (PR-B), políticas y `PermissionResolver` (PR-C), arnés de aislamiento (PR-D).
- **Pendientes:** T-48 a T-56, la web (página 403, 404, áreas de cliente e interno). Dependen del contexto de sesión de la 002, que todavía no existe.

El encabezado de la spec sigue diciendo «Planificada». El código ya pasó de ahí en el backend.

### 5.1 Cómo entra una petición

`AuthGuardsModule` registra dos guards globales, en este orden: primero `JwtAuthGuard`, después `RolesGuard`. El worker no los importa. Niegan por defecto (decisión D-2).

```text
petición
  → ¿la ruta o el controlador tienen @Public()?
       sí → el controlador corre (registro, verificación, salud)
       no → JwtAuthGuard exige una sola cabecera Authorization: Bearer <token>
              cabecera ausente, duplicada o mal formada → 401 SHARED_UNAUTHENTICATED
              Passport + estrategia de nombre "jwt"
              claims válidos → createActor(userId, role) y se guarda en la petición
              token vencido, alterado o de otra clave → 401
  → RolesGuard
       ruta no pública sin @Roles(...) → 403 SHARED_FORBIDDEN (ruta no declarada)
       el rol del Actor no está en la lista → 403
       sí está → el controlador recibe el Actor con @CurrentActor()
                 y el id de sesión con @CurrentSessionId()
```

Detalles que importan al defenderlo:

- La cabecera se lee de `rawHeaders`, no del mapa ya normalizado de Node. Dos cabeceras `Authorization` se rechazan. El patrón admite un solo token Bearer, sin espacios de más.
- El `Actor` se construye **solo** con `createActor`. `canReadContent` es `true` únicamente si el rol es `CLIENT`. Un Administrador no «casi» puede leer contenido: el flag nace en `false` y ningún parámetro, cuerpo ni cabecera lo cambia (D-11, no hay suplantación).
- Nadie lee `req.user`. El guard escribe un `RequestPrincipal` y los decoradores lo exigen. Si un controlador pide el actor en una ruta pública, falla: ahí no hay principal.
- Un error inesperado de Passport no se convierte en 500. Sale como 401 y, si no era un rechazo de token esperado, queda una bitácora `auth.unexpected_error` con la clase del error y un mensaje recortado. Las bitácoras `auth.unauthenticated` y `auth.forbidden` llevan ruta, motivo y, en el 403, id y rol. No llevan el token ni el correo.
- Toda ruta tiene que declarar `@Public()` o `@Roles(...)`. Aunque la negación por defecto ya la proteja, una prueba recorre las rutas registradas y falla si alguna no declara nada (D-10). Hoy las rutas de identidad llevan `@Public()`.

### 5.2 El puerto del token, y por qué la 003 pudo adelantarse a la 002

`shared` declara `IAccessTokenVerifier` y el nombre de estrategia `ACCESS_TOKEN_STRATEGY = 'jwt'`. `JwtAuthGuard` extiende `AuthGuard('jwt')`. Quien registra la estrategia es `identity`, cuando exista la 002. `shared` no importa `identity`, y `realtime` (más adelante) tampoco: ambos dependen del puerto. Eso es ADR-0010 aplicado al token.

Hoy **no hay `JwtStrategy` de producción**. Sin estrategia registrada, toda ruta no pública responde 401. Las pruebas usan `TestAccessTokens` y `TestJwtStrategy`: firman con una clave que solo existe en `test/`, con los mismos claims que emitirá la 002 (`sub`, `rol`, `sid`) y con la misma vida de 15 minutos. La suite de contrato del puerto ya está escrita. Cuando la 002 entregue `JwtTokenService`, esas mismas pruebas se vuelven a correr con el verificador real (tareas T-53 a T-55 de la 002). El contrato se fijó antes que la implementación para que los dos lados se puedan probar por separado.

Esa es la razón de haber hecho el mínimo de la 003 antes de terminar el login: la autorización no necesita la pantalla de inicio de sesión para demostrar que niega, que separa roles y que no deja pasar un actor fabricado en el cuerpo de la petición.

### 5.3 Niveles, políticas y `PermissionResolver`

Sobre un archivo concreto hay tres niveles, con una política cada uno (`IAccessPolicy`):

| Nivel | Puede |
|---|---|
| Propietario | Todas las acciones, también las que se agreguen después al enum. |
| Editor | Ver, previsualizar, descargar, consultar al agente, editar y generar versiones. No compartir, no crear enlaces, no borrar el original, no ver la lista de accesos. |
| Lector | Ver, previsualizar, descargar y consultar al agente. |

`editor` y `viewer` son conjuntos cerrados: una acción nueva queda negada hasta que alguien la agregue a propósito. `owner` es al revés, cerrado hacia el permiso. El `switch` de `policyFor` es exhaustivo: un nivel nuevo no compila hasta tener política.

`PermissionResolver.can(actor, nodeId, action)` hace dos cortes antes de tocar la base:

1. Si `canReadContent` es falso (cualquier rol interno), responde que no, **sin consultar** de quién es el recurso (CA-9).
2. Si `nodeId` no es un UUID, tampoco consulta.

Solo entonces llama a `IAccessLevelReader`. La implementación `SqlAccessLevelReader` exige estar dentro de `withActor`. Si alguien la llama fuera, lanza `ActorScopeMissingError`. No hay un «por si acaso» que consulte con el manager raíz y se salte el actor.

### 5.4 `accessibleNodes`: la única definición de «qué ve este actor»

La función `accessibleNodes(actor)` devuelve un fragmento SQL `(nodo_id, tipo_nodo, nivel)` con parámetros. Los repositorios de las specs siguientes lo meten en su consulta (`IN` o `JOIN`). No es una lista que se trae a TypeScript para filtrar después. Filtrar después rompe los conteos y la paginación: una página de 20 que llega con 3 revela que había 17 ajenos, y mete filas de otra cuenta en memoria.

**Hoy el fragmento es un `SELECT … WHERE false` para todo el mundo**, también para `CLIENT`. Es deliberado (decisión D-1). La 003 no crea las tablas `archivo` ni `comparticion`. La rama de propiedad la escribe la 005; la de comparticiones, la 012. Hasta entonces, el resolvedor no concede nivel a nadie. Los roles internos seguirán recibiendo el conjunto vacío para siempre: ellos ven metadatos por otro puerto (`INodeMetadataReader`, spec 011), nunca por aquí, porque aquí es por donde se llega al contenido.

### 5.5 La segunda barrera: rol `nimbo_app` y `withActor`

ADR-0005 eligió dos barreras, no una.

La primera es el filtro en el SQL de la aplicación (`accessibleNodes` y `propietario_id` donde el recurso no es un nodo). La segunda es *row level security* en PostgreSQL, para el día en que un repositorio olvide el `WHERE`. Un superusuario ignora RLS aunque la tabla tenga `FORCE`. Por eso la API y el worker **no** se conectan como el dueño de las tablas.

Lo que ya está en `main`:

- El rol `nimbo_app` (`LOGIN`, no superusuario, sin `BYPASSRLS`, no dueño). Lo crea `infra/postgres/init/10-nimbo-app.sh` (`pnpm db:app-role`). Las migraciones corren con el rol dueño (`DATABASE_MIGRATION_URL`). La app usa `DATABASE_URL`.
- `DatabaseRoleCheck` corre al arrancar `api` y `worker`. Si la conexión es superusuario, tiene `BYPASSRLS` o es dueña de tablas (también por pertenencia de rol, no solo por `relowner`), el proceso no levanta. La bitácora guarda tres booleanos, nunca la URL.
- La migración de permisos concede a `nimbo_app` leer y escribir las tablas, le quita `DELETE` sobre `usuario` y `token_cuenta`, y le quita todo sobre la tabla de migraciones. Los `ALTER DEFAULT PRIVILEGES` hacen que las tablas que cree la 005 hereden ese permiso sin un `GRANT` nuevo.
- `ITransactionRunner.withActor(actor, work)` abre una transacción, ejecuta `SELECT set_config('app.actor_id', $1, true), set_config('app.actor_role', $2, true)` con parámetros enlazados, y publica el `EntityManager` y el actor en un `AsyncLocalStorage` (`TransactionContext`). El `true` equivale a `SET LOCAL`: el valor muere con la transacción y no se le pega a la siguiente petición que reutilice la conexión del pool. Se usa `set_config` y no `SET LOCAL` porque este último no acepta parámetros, y concatenar el id sería inyección.
- El id tiene que ser un UUID y el rol uno de `Role` **antes** de abrir la transacción. Si ya hay una transacción de otro actor, lanza: no se reentra a mitad de la de otro. El lint `rls.js` prohíbe escribir `app.actor_id` o `app.actor_role` en cualquier archivo que no sea el runner.
- Las funciones `nimbo_actor_id()` y `nimbo_actor_role()` son la única lectura de ese contexto del lado de la base. Sin actor, `nullif(current_setting(…, true), '')` da `NULL`. Las políticas de la 005 van a decir «sin id, cero filas». Son `SECURITY INVOKER`: leen la sesión de quien consulta, no la de quien las creó.

`RegistrationService` usa `run()`, la transacción **sin** actor. `usuario` y `token_cuenta` no son datos de un cliente frente a otro en el sentido de RLS de archivos, y el registro es público: todavía no hay `Actor`.

### 5.6 La suite de aislamiento

`pnpm test:isolation` arma un mundo con dos clientes de datos casi idénticos y una cuenta de cada rol interno (insertadas directo: las cuentas internas de verdad llegan en la spec 011). Comprueba que el actor de una transacción no se filtra a la siguiente sobre la misma conexión, que la app no es dueña de las tablas, que los roles internos no obtienen contenido vía `PermissionResolver`, y que cada ruta declara `@Public()` o `@Roles`. Cuando existan archivos, la 005 agrega aquí las pruebas con filas reales.

### 5.7 Por qué se hizo así

| Decisión | Por qué esta forma |
|---|---|
| Guards en `shared`, no en `backoffice` (D-2, DF-50) | Si vivieran en el módulo de administración, todos los módulos dependerían de M8 para proteger una ruta. |
| Negar por defecto | Olvidar un decorador cierra la ruta. Abrirla exige `@Public()` a propósito. |
| 401 si no hay sesión, 403 si el rol no alcanza, 404 si el recurso es ajeno o no existe | El 404 idéntico evita decir «existe, pero no es tuyo». El 403 se reserva para «tu rol no entra a esta operación». |
| `Actor` con tres campos y `canReadContent` derivado | El rol no es un permiso sobre archivos. Un interno puede tener una ruta de backoffice y, a la vez, cero acceso al contenido. El flag lo decide un solo lugar. |
| Autorización en la consulta **y** RLS (ADR-0005) | Solo código: un `find()` sin `where` filtra mal. Solo RLS: la regla queda escondida, el plan de la consulta se controla peor y un `UPDATE` sobre una fila invisible afecta 0 filas en silencio. Las dos juntas: el SQL expresa la regla y la base frena el olvido. |
| Una base para todas las cuentas | Las comparticiones cruzan cuentas. Un esquema por cliente obligaría a unir N esquemas y a migrar N veces. |
| `accessibleNodes` vacío hasta la 005 | Escribir la consulta de propiedad sin tabla `archivo` sería ficción. El contrato (la forma del fragmento y el lector) ya está, para que la 005 lo rellene sin cambiar a los llamadores. |
| Puerto de verificación en `shared` | El guard y, después, el handshake de Socket.IO no pueden importar `identity`. Si lo hicieran, la frontera del ADR-0010 se rompe. |

---

## 6. Spec 002 — autenticación, sesiones y dispositivos (Diseñado)

Spec, plan y tareas están aprobados (27/09/2026). Las tareas T-01 a T-80 y las de la web siguen sin marcar. No hay tablas `sesion` ni `dispositivo`, no hay `POST /auth/login`, no hay cookie de refresco y no hay `JwtTokenService`. Lo que sigue es **cómo quedó decidido implementarlo y por qué**, para poder defender el diseño y para saber exactamente qué enchufa en la 003 el día que se escriba.

### 6.1 El problema

Con la 001 la persona crea la cuenta y la verifica, y todavía no puede volver a entrar, recuperar una contraseña ni ver desde dónde está abierta su sesión. El riesgo que esta spec cierra es el robo de credenciales: fuerza bruta, un token copiado, una sesión olvidada en otro equipo.

### 6.2 Dónde vive cada credencial (D-1)

| Pieza | Dónde | Por qué |
|---|---|---|
| Token de acceso | Solo en memoria de la web. Viaja en `Authorization: Bearer`. | `localStorage` lo lee cualquier script de la página. La memoria muere con la pestaña. |
| Token de refresco | Cookie `httpOnly`, `Secure` fuera de localhost, `SameSite=Strict`, ruta limitada a `/api/v1/auth/session`. | El JavaScript de la página no la lee. `SameSite=Strict` corta el envío en navegaciones cruzadas. Al recargar, la web pide un acceso nuevo con esa cookie. |
| Dispositivo | Otra cookie `httpOnly`, 1 año, valor aleatorio de 256 bits. En la base, solo el hash, por cuenta. | Sirve para saber si el navegador es nuevo y avisar. Si la persona borra cookies, ese navegador vuelve a contar como nuevo. No es una huella del hardware. |

El JWT de acceso dura **15 minutos** y lleva solo `sub` (id de cuenta), `rol`, `sid` (id de sesión), `iat` y `exp`. Sin correo y sin nombre (D-13). Lo firma el backend con `JWT_ACCESS_SECRET`. HS256, Passport y `@nestjs/jwt` (ADR-0017, opción c.2): la estrategia de Passport no decide el vencimiento (`ignoreExpiration: true`); el único que verifica firma, algoritmo y reloj es `JwtTokenService`, detrás del puerto que la 003 ya declaró, usando `IClock` para que las pruebas no dependan del reloj real.

La sesión (el refresco) vence a los **7 días sin uso** y, como máximo, a los **30 días** de haber entrado, aunque se use a diario (D-2). Después hay que volver a escribir la contraseña.

### 6.3 Rotación y reúso (D-3)

Cada renovación entrega un refresco nuevo y el anterior deja de servir. La fila `sesion` guarda el hash del token vigente y el hash del anterior, y la rotación se hace con `SELECT … FOR UPDATE` sobre esa fila: dos pestañas no rotan a la vez a ciegas.

Si alguien presenta un refresco que ya se rotó **hace más de 10 segundos**, se revoca toda esa sesión y el dueño recibe el correo «Cerramos una sesión por seguridad». Esa presentación es la señal de que el token fue copiado. Dentro de esos 10 segundos (gracia de rotación) se rechaza sin revocar, para no castigar dos pestañas que renovaron juntas.

El refresco es un token opaco `<id-de-sesión>.<secreto>`, no un JWT. Así se puede invalidar al momento. Un JWT de acceso ya emitido sigue vivo hasta 15 minutos: es el techo aceptado cuando se revoca o se suspende una cuenta.

### 6.4 Cómo se reparte el código

Tres servicios, una razón de cambio cada uno:

- `AuthService` — login: bloqueo, credenciales, estado de la cuenta.
- `SessionService` — abrir, rotar, listar y revocar sesiones y dispositivos.
- `PasswordService` — recuperación y cambio de contraseña.

Tres controladores: `AuthController` suma `login`, `session/refresh` y `session/logout` (las dos últimas leen la cookie); `PasswordController` atiende la recuperación pública y el cambio ya autenticado; `SessionsController` lista y revoca, con `@Roles` y `@CurrentActor()` de la 003.

`IdentityModule` registra la `JwtStrategy` con el nombre `jwt` y exporta `I_ACCESS_TOKEN_VERIFIER`. A partir de ese momento el guard que ya está en `main` deja de responder 401 a todo y empieza a construir `Actor` de verdad. Las rutas públicas de la 001 se quedan con `@Public()`.

### 6.5 Reglas de seguridad que ya están cerradas

- **Credenciales inválidas, misma respuesta** si el correo no existe o si la contraseña está mal (`IDENTITY_INVALID_CREDENTIALS`). Si el correo no existe se calcula igual un Argon2id, para no delatarlo por el tiempo. Es el mismo criterio de la 001.
- **Cuenta no verificada**, contraseña correcta: no hay sesión; se responde `IDENTITY_EMAIL_NOT_VERIFIED` y se lleva a pedir otro enlace. Contraseña incorrecta: la respuesta genérica. Así no se confirma la cuenta a quien no sabe la contraseña.
- **Cuenta suspendida**, contraseña correcta: `IDENTITY_ACCOUNT_SUSPENDED`. La renovación de una cuenta suspendida falla y revoca la sesión.
- **Fuerza bruta:** 5 fallos del mismo correo normalizado en 15 minutos bloquean ese correo 15 minutos, exista o no la cuenta (si solo se bloqueara cuando existe, el bloqueo enumeraría). Además, 20 intentos por IP cada 15 minutos, antes de evaluar la contraseña. El bloqueo por correo vive en Redis (`IAttemptLockout`, script Lua atómico, reloj de `IClock`). Si Redis cae, el login falla cerrado.
- **Recuperación:** enlace opaco de un solo uso, 1 hora, hash en `token_cuenta`. La respuesta al pedirlo es neutra. Si la cuenta no está verificada, en lugar del enlace de recuperación se manda un enlace de verificación nuevo. Al restablecer: cambia la contraseña, se cierran **todas** las sesiones, se quita el bloqueo y **no** se inicia sesión. La persona entra con la contraseña nueva.
- **Cambiar la contraseña estando dentro:** pide la actual. Se cierran las demás sesiones; la actual sigue. Cinco actuales incorrectas en 15 minutos bloquean el cambio, sin cerrar la sesión.
- **Lista de sesiones:** navegador y sistema (leídos del agente de usuario), inicio, última actividad y la marca «Este dispositivo». No muestra IP ni ubicación. Cerrar una sesión ajena responde como si no existiera. «Cerrar las demás» revoca todas salvo la actual. Cerrar sesión borra la cookie de refresco y conserva la de dispositivo.
- **Dispositivo nuevo:** correo «Nuevo inicio de sesión en Nimbo». El navegador donde se verificó el correo queda como conocido, sin aviso.
- **Verificar el correo abre sesión** (cierra el hueco que dejó la 001). Si abrir la sesión fallara, la cuenta queda verificada igual y la persona entra a mano.

Los cuatro correos nuevos son plantillas de `identity` que salen por el mismo `IMailer` de la 001. El worker no cambia.

### 6.6 Qué reutiliza y qué no inventa

Reutiliza de la 001: `IPasswordHasher`, `IUserRepository`, `token_cuenta`, `OpaqueToken`, `IMailer`, `ThrottlerModule`, `IRateLimiter`, `ITransactionRunner`, `IClock`, `ZodValidationPipe` y la política de contraseña. Los límites de la recuperación son los mismos números que los del reenvío de verificación, a propósito, para no tener dos políticas.

No se crea historial de tokens de refresco (bastan el hash vigente y el anterior), ni un endpoint `/me`, ni una librería de cookies, ni «revocar al suspender» (eso lo pedirá la 011 cuando exista quien suspenda).

---

## 7. Spec 005 — carga y descarga (Arranque)

La rama `spec/005-carga-y-descarga` tiene la spec en `Lista` y el plan aprobado por el architect y confirmado el 28/09/2026. Hay mockups de la carga (progreso, pausa, corte, rechazos, nombre repetido, cancelar) y del explorador (vacío, carga, arrastre, error, menú de descarga). No hay `tasks.md` ni módulo `storage` de producción. Antes de implementar, esa rama tiene que incorporar los 8 commits de `main`: si no, se escribiría encima de un árbol que todavía no tiene el registro ni los guards.

Depende de la 003 (ya está el mínimo) y de que alguien implemente `IPlanLimitsProvider`. La 006a lo está construyendo en su rama (T-01 a T-06 listas). Mientras ese adaptador no esté en `main`, el plan de la 005 permite un doble de prueba que devuelve los límites del plan.

### 7.1 Qué va a hacer

Un cliente sube archivos a la raíz de su espacio, ve el progreso en su navegador, puede pausar, reanudar o cancelar, y descarga con un enlace que dura 5 minutos, apunta a un solo objeto y obliga a descargar. Administrador, Soporte y Operador reciben 403 en todas esas rutas. Sin token, 401. Un archivo de otra cuenta responde 404, igual que uno que no existe.

### 7.2 Por qué los bytes no pasan por la API

Subir un archivo grande en el cuerpo del `POST` ata un worker de la API durante toda la transferencia, se cae con un corte de red y mete el contenido en un proceso que también atiende login y autorización. DF-16 lo cierra así: el navegador habla **directo con MinIO** mediante URLs prefirmadas (SigV4). La API solo decide si se puede, emite la URL y, al terminar, comprueba que lo que quedó guardado es lo que se dijo.

El umbral entre carga simple y carga por partes es configuración, no regla de negocio. Por debajo, un solo `PUT` prefirmado. Por encima, multipart de S3: una URL por parte, reanudable preguntándole a MinIO qué partes ya llegaron (`listParts`). El servidor lista las partes él mismo al completar; no confía en los ETags que mande el cliente. El progreso (porcentaje, bytes, velocidad) lo calcula el navegador. No hay Socket.IO en esta spec: difundirlo a otras pestañas es la 015. Esa contradicción con el texto viejo de la arquitectura quedó resuelta (DF-58).

La clave del objeto se fija al iniciar, con la forma `u/{propietario}/{archivo}/{version}`. Solo UUID, nunca el nombre. Las partes se suben ya a la clave final. El nombre del archivo no sale en bitácoras ni en la URL.

### 7.3 Cuota, nombre y tipo

Los límites (tamaño máximo por archivo y cuota) salen de `PlanLimits` vía `IPlanLimitsProvider`. Ningún número de negocio vive en el código de la carga. `storage` **declara** ese puerto; `billing` lo implementa importándolo del `index.ts` de `storage`. Se eliminó la flecha `storage → billing` (DF-51, opción A). Así `storage` no depende de facturación para saber si un archivo cabe, y facturación puede cambiar sin que la carga importe el módulo de pagos.

Al iniciar se reserva el tamaño declarado como una fila `carga` activa. La decisión se serializa con `SELECT … FOR UPDATE` sobre la fila del usuario: dos cargas simultáneas no se comen la misma cuota. El espacio usado (`usuario.espacio_usado`, `bigint`) solo se suma en la transacción que crea `archivo` y `version_archivo` con `origen = 'carga'`. Rechazar, cancelar o expirar libera la reserva y no suma. Que `storage` escriba esa única columna de `usuario` es una excepción aceptada (DF-59): no es un import de `identity`, es una escritura acotada en `IQuotaRepository`.

Nombre repetido: no hay «reemplazar» (eso es una versión nueva, spec 014). El servidor ofrece «conservar ambos» —`nombre (1).ext`, el primer número libre— o cancelar. La comparación no distingue mayúsculas y la papelera no cuenta. El número se fija en la transacción de completar, no en el cliente, porque dos cargas a la vez podrían elegir el mismo «(1)».

Al completar se leen los magic bytes. `.docx`, `.xlsx` y `.pptx` tienen que ser ZIP con la estructura OOXML de ese tipo; `.pdf` e imágenes, su firma; `.txt` y `.md`, UTF-8 válido. Un ejecutable (PE, ELF, Mach-O) se rechaza con cualquier extensión. Si el tipo o el tamaño real no coinciden, se borran **todas** las versiones del objeto (el bucket tiene versionado; borrar solo la última dejaría los bytes) y la carga queda `rechazada`. No hay antivirus: está fuera de alcance.

### 7.4 Cómo usa lo que la 003 ya construyó

Cada caso de uso corre dentro de `withActor(actor, …)`. Los repositorios toman el `EntityManager` de `TransactionContext.requireActorScope(actor)`. Sin ese actor, el lector de la 003 ya lanza; con las políticas, además, la base no devuelve filas.

La 005 completa la rama `CLIENT` de `accessibleNodes`: el fragmento vacío de hoy pasa a ser la consulta de propiedad sobre `archivo`. Los roles internos siguen en el conjunto vacío. La descarga (`POST /files/:id/download-url`) resuelve el archivo **uniendo ese fragmento en el SQL**, y solo entonces firma una URL de 300 segundos contra el host público de MinIO, distinto del de la web y de la API, con `Content-Disposition: attachment`. El host aislado evita que la cookie de sesión viaje con el archivo. La clave de objeto vive en `version_archivo`, y la política de RLS de esa tabla no entrega filas a los roles internos: aunque un repositorio se equivoque, no obtiene la clave con la que se firma la URL.

Las políticas, ya escritas en el plan y todavía no migradas, usan `nimbo_actor_id()` y `nimbo_actor_role()` de la 003, con `ENABLE` y `FORCE ROW LEVEL SECURITY` en `archivo`, `version_archivo` y también en `carga`. `carga` no es un nodo del árbol (no entra en `accessibleNodes`), pero guarda nombre, clave y el id de multipart, así que recibe la misma barrera.

### 7.5 El worker y el actor que no existe (ADR-0021, Propuesto)

A las 24 horas una carga sin completar expira, se borran sus partes y se libera la reserva. Ese barrido corre en el worker, con `nimbo_app`, **sin** un usuario llamando. Con las políticas cerradas, una consulta sin actor ve 0 filas y el trabajo «terminaría bien» sin limpiar nada. Darle `BYPASSRLS` rompería ADR-0005.

La opción elegida (DF-52, B) es una función `SECURITY DEFINER` mínima, `carga_expiradas`, que devuelve solo `(id, propietario_id)` de cargas ya vencidas, con tope de filas, y que no deja al llamador mirar al futuro (`LEAST(p_ahora, now())`). El worker, con cada dueño, abre `withActor(createActor(propietario, CLIENT), …)` y limpia **como ese cliente**. La función no devuelve nombre, clave ni `upload_id`. ADR-0021 está Propuesto: enmienda ADR-0005, que no había previsto trabajos de mantenimiento ni RLS en `carga`. Hay que poder decir que falta el acuerdo formal del equipo, aunque la opción ya está decidida en el plan.

### 7.6 Modelo de datos, alineado con el E-R

Se siguen las dos tablas `archivo` y `carpeta` (ADR-0011, Propuesto, cierra DF-40) y las versiones por composición con columna `origen` (ADR-0012, Propuesto). No se inventa una tabla única de nodos. `version_archivo.origen` distingue carga, edición, restauración y optimización. Cuatro migraciones reversibles, a mano (ADR-0002), posteriores a las de 001 y 003. Tamaños en `bigint`.

### 7.7 Lo que queda fuera, a propósito

Carpetas y papelera (006), reemplazar por una versión nueva (014), progreso en otras pestañas (015), enlaces públicos (013), vista previa, búsqueda, indexación, el bloqueo de carga cuando el plan está vencido (010) y recuperar una carga después de cerrar la pestaña. Reanudar solo vale en la misma pestaña; si se cierra, a las 24 horas expira. Es YAGNI de calendario: la 005 demuestra subir y bajar con aislamiento, no el explorador completo.

---

## 8. Cómo se van a hablar cuando las tres estén juntas

Hoy el tramo que ya corre es el de la 001 más los guards de la 003 en modo «sin estrategia, 401». El relato completo, el día que la 002 y la 005 estén en `main`, es este:

1. La persona se registra (001). El worker manda el correo. Al abrir el enlace, la 002 abre una sesión: cookie de refresco, cookie de dispositivo, token de acceso de 15 minutos en memoria, y la web va a Mis archivos.
2. Cada llamada a la API lleva el Bearer. `JwtAuthGuard` pide a `JwtTokenService` (el puerto de `shared`) que verifique. Si vale, `createActor` arma el `Actor` y `RolesGuard` exige `CLIENT` en las rutas de archivos.
3. Si el acceso está por vencer, la web llama a `POST /auth/session/refresh` con la cookie. `SessionService` rota el secreto bajo `FOR UPDATE`. El JavaScript nunca ve el refresco.
4. Al subir, `UploadService` corre en `withActor`. Reserva cuota, y si el archivo es grande devuelve URLs prefirmadas. El navegador las usa contra MinIO. Al completar, el servidor valida tamaño y firma, inserta `archivo` y `version_archivo` en la misma transacción en la que suma `espacio_usado`, y `accessibleNodes` empieza a devolver ese nodo como `OWNER`.
5. Al descargar, `FileService` busca el archivo dentro de `accessibleNodes(actor)`. Si es de otra cuenta, la consulta no lo trae y la respuesta es el mismo 404 que si el UUID no existiera. Si es propio, firma una URL de 5 minutos en el origen de objetos.
6. Un rol interno que llame a esas rutas cae en el 403 del `RolesGuard`. Si algún código interno olvidara el rol y consultara igual, `canReadContent` es falso, `accessibleNodes` le da el conjunto vacío y RLS no le entrega `version_archivo`.

Ese es el sentido de haber construido la 003 antes que los archivos: las tres barreras (rol, consulta, RLS) quedan escritas una vez, y la 005 las usa en lugar de inventar las suyas.

---

## 9. Decisiones que más se preguntan

**¿Por qué no JWT también para el refresco?** Porque un JWT no se puede invalidar antes de que venza, y cerrar una sesión o detectar un token robado tiene que ser inmediato. El acceso es corto (15 min) y stateless; el refresco es opaco, está hasheado y se rota.

**¿Por qué la cookie y no el cuerpo de la petición para el refresco?** Para que el script de la página no pueda leerlo ni filtrarlo. El acceso va en memoria y en la cabecera precisamente porque la cookie de sesión no debe salir hacia MinIO ni hacia otros orígenes.

**¿Por qué `nimbo_app` separado del rol que migra?** Porque el dueño de la tabla, y más un superusuario, no queda sujeto a RLS. La segunda barrera solo existe si la app no puede saltársela. Por eso el proceso se niega a arrancar si la URL apunta al rol equivocado.

**¿Por qué `set_config` y no un `SET` al pedir la conexión?** El pool reutiliza conexiones. Un valor de sesión sobreviviría a la siguiente petición de otra cuenta. `set_config(…, true)` dura lo que dura la transacción. El `AsyncLocalStorage` evita que dos peticiones concurrentes en el mismo proceso se mezclen el `EntityManager`.

**¿Por qué el personal interno no ve ni metadatos de contenido por el mismo camino?** Porque el camino de `accessibleNodes` es el que lleva a la clave del objeto. Mezclar «ver el nombre para soporte» con «poder firmar la descarga» es como se filtra un archivo. Los metadatos de soporte, cuando existan, salen por `INodeMetadataReader`, con columnas acotadas, y quedan en la auditoría visible para el cliente (spec 004 y 011).

**¿Por qué la 005 no reemplaza un archivo con el mismo nombre?** Reemplazar es una versión nueva con autoría. Meterlo en la carga obligaría a decidir historial, restauración y edición antes de tener archivos. Conservar ambos resuelve el choque de nombres sin abrir ese modelo.

**¿Por qué el plan de la 005 está en otra rama y detrás de `main`?** Porque se escribió cuando 001 y 003 todavía no se habían integrado. El diseño ya cita sus planes (guards, `withActor`, `accessibleNodes`, zod, cola de correo). Implementar exige traer `main` primero. No es una versión alternativa del sistema: es documentación adelantada.

---

## 10. Qué conviene no afirmar

- Que ya se puede iniciar sesión, renovar una sesión o cerrarla. La ruta existe como marcador.
- Que `accessibleNodes` ya devuelve los archivos de la persona. Hoy devuelve un conjunto vacío a propósito.
- Que RLS ya protege `archivo`. Están el rol, el `withActor` y las funciones SQL. Las políticas se crean con las tablas, en la 005.
- Que el verificador de tokens de producción es el de la 002. En producción no hay estrategia registrada; en pruebas hay un emisor de test.
- Que la 005 o la 006a están implementadas. La 006a tiene la tabla `plan` y el puerto declarados en su rama, no el adaptador que lee la suscripción, y ninguna de las dos está en `main`.
- Que ADR-0011, ADR-0012 y ADR-0021 están aceptados. Están Propuestos en la rama de la 005.
- Que el backlog de `specs/README.md` describe el día de hoy. La 001 y el backend de la 003 van por delante de esa tabla.

---

## 11. Dónde está cada cosa, por si preguntan el archivo

| Tema | Dónde mirar |
|---|---|
| Guards y decoradores | `apps/api/src/shared/presentation/auth/` |
| Puerto token → claims | `apps/api/src/shared/application/auth/i-access-token-verifier.port.ts` |
| `Actor` | `apps/api/src/shared/domain/actor.ts` |
| `withActor` | `apps/api/src/shared/infrastructure/persistence/typeorm-transaction-runner.ts` |
| Funciones SQL del actor | `apps/api/src/migrations/20260928110100-crear-funciones-de-actor.ts` |
| Rol `nimbo_app` | `apps/api/src/migrations/20260928110000-conceder-permisos-nimbo-app.ts`, `apps/api/src/shared/infrastructure/persistence/database-role.check.ts` |
| Políticas y resolvedor | `apps/api/src/modules/access/` |
| Fragmento SQL vacío | `apps/api/src/modules/access/infrastructure/sql/accessible-nodes.ts` |
| Registro | `apps/api/src/modules/identity/` |
| Marcador de login | `apps/web/src/app/(public)/iniciar-sesion/page.tsx` |
| Aislamiento | `apps/api/test/isolation/` |
| Diseño de la 002 | `specs/002-autenticacion-sesiones-y-dispositivos/` |
| Diseño de la 003 | `specs/003-roles-y-acceso/` |
| Diseño de la 005 (rama) | `specs/005-carga-y-descarga/` en `origin/spec/005-carga-y-descarga` |
| Dos barreras | `docs/adr/0005-autorizacion-en-la-consulta-y-rls.md` |
| Fronteras de módulos | `docs/adr/0010-separacion-de-modulos.md` |
| JWT y Passport | `docs/adr/0017-dependencias-de-autenticacion.md` |
