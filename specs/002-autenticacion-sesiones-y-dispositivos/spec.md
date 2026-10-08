# Spec 002 — Autenticación, sesiones y dispositivos

| Campo | Valor |
|---|---|
| Estado | Hecha (2026-10-07): integrada en `main` (cbdd788), revisión ✅ y recorrido de Adrián |
| Dueño | Adrián (1) |
| Fase | 1 |
| Requisitos | RF-02, RF-03, RF-04 (principales); aplican también RNF-04, RNF-05 (cada quien solo ve y revoca sus sesiones), RNF-07 (límite de tasa del inicio de sesión y de la recuperación), RNF-13, RNF-14, RNF-17 |
| Depende de | **001** (dependencia dura: mismo módulo; usa `usuario`, `token_cuenta`, `IPasswordHasher`, `IUserRepository`, `IMailer`, el `ThrottlerModule` y la verificación que abre sesión, D-20 de 001); 000 (bloques 1 y 2 en `main`); 000b para la interfaz |
| Módulo | M1 `identity` (+ `notifications` para los correos) |
| DF | DF-11 decidido por D-4 · DF-15 (parte `SessionsController`) decidido por D-8. Falta que el `architect` actualice `design-findings.md` y los diagramas |
| Última actualización | 2026-09-26 |

## 1. Contexto y problema

Con la 001 una persona crea su cuenta y la verifica, pero todavía no puede volver a entrar, recuperar una contraseña
olvidada ni saber desde dónde se usa su cuenta. RF-02, RF-03 y RF-04 piden credenciales de vigencia corta que se
renuevan de forma controlada, sesiones que se consultan y se revocan una por una, un aviso cuando alguien entra desde
un dispositivo desconocido y una recuperación que, al aplicarse, cierra todas las sesiones. El riesgo principal es el
robo de credenciales: una contraseña adivinada por fuerza bruta, un token copiado o una sesión olvidada en otro
equipo. Esta spec entrega el inicio de sesión con esas garantías y la pantalla donde el cliente controla sus sesiones.

## 2. Objetivo

Un cliente verificado inicia sesión con su correo y su contraseña y sigue dentro mientras use ese dispositivo, sin
volver a escribir la contraseña durante hasta 30 días. Puede ver en «Seguridad» cada sesión abierta, cerrar la que no
reconozca o todas las demás, y cambiar su contraseña. Si olvida la contraseña, la restablece con un enlace de un solo
uso y todas sus sesiones se cierran. Recibe un correo cuando alguien entra desde un dispositivo nuevo. Nadie puede
adivinar su contraseña probando ni averiguar por esta vía si un correo tiene cuenta.

## 3. Actores

- **Cliente verificado**: inicia sesión, renueva su sesión, consulta y revoca sesiones, cambia y restablece su contraseña.
- **Cliente no verificado**: no obtiene sesión (D-9 de 001); si su contraseña es correcta, se le lleva a pedir un enlace nuevo.
- **Visitante** (anónimo): pide y aplica la recuperación de contraseña.
- **Administrador / Soporte / Operador**: inician sesión en el mismo formulario y gestionan sus propias sesiones
  (matriz de `product-context.md` §2, «gestionar su propia sesión»). Sus cuentas se crean en 011 (003 D-3); en la
  Fase 1 solo existen en las pruebas.
- **Sistema** (trabajo de correo en el `worker`): envía los correos y reintenta si el servidor de correo falla.

## 4. Historias de usuario

- **HU-1** Como cliente, quiero iniciar sesión con mi correo y mi contraseña y seguir dentro mientras uso mi
  dispositivo, para no escribir la contraseña a cada rato.
- **HU-2** Como cliente que olvidó su contraseña, quiero restablecerla con un enlace que llegue a mi correo, y que al
  hacerlo se cierren todas mis sesiones, por si alguien más la conocía.
- **HU-3** Como cliente, quiero ver dónde tengo la sesión abierta y cerrar la que no reconozca, o todas las demás.
- **HU-4** Como cliente, quiero enterarme cuando alguien entra a mi cuenta desde un dispositivo nuevo.
- **HU-5** Como cliente, quiero cambiar mi contraseña estando dentro.
- **HU-6** Como dueño de una cuenta, quiero que nadie pueda adivinar mi contraseña probando muchas veces ni averiguar si
  mi correo tiene cuenta.
- **HU-7** Como cliente, quiero cerrar sesión en este dispositivo.
- **HU-8** Como operador, quiero bitácoras de inicio de sesión, renovación y recuperación con `correlationId` y sin
  datos sensibles, para investigar un incidente sin exponer a nadie.

## 5. Restricciones y decisiones

### 5.1 Restricciones ya fijadas

| # | Restricción | Fuente |
|---|---|---|
| R-1 | Passport JWT con tokens de acceso de vida corta y un refresco rotativo por dispositivo; cada dispositivo tiene su propia sesión y se revoca por separado. | Propuesta §5 y pila, `product-context.md` §5 |
| R-2 | Contraseñas con Argon2id (RN-3 de 001) y política D-6 de 001 al restablecer y al cambiar. | RNF-04, spec 001 D-6 |
| R-3 | Tokens, identificadores de dispositivo y enlaces se guardan **solo como hash**. | Art. IX.6, `CLAUDE.md` (prohibiciones) |
| R-4 | Una cuenta no verificada no obtiene sesión; `IDENTITY_EMAIL_NOT_VERIFIED` solo con la contraseña correcta. | Spec 001 D-9, CA-16 |
| R-5 | Abrir un enlace de verificación válido inicia una sesión normal de esta spec; sus pruebas se escriben aquí. | Spec 001 D-20, CA-26, CA-29 |
| R-6 | Errores con la forma `{ code, message, correlationId }`, `code` con prefijo de módulo y mensaje con acción correctiva. | Spec 000 RN-1 |
| R-7 | Los correos salen por `IMailer` y la cola `mail` (5 reintentos, idempotente); en local, Mailpit. | Spec 001 R-4, R-5, R-9 |
| R-8 | Bitácoras sin contraseñas, tokens, valores de cookies, identificadores de dispositivo ni correos; `correlationId` en cada línea. | RNF-17, spec 001 D-18 |
| R-9 | Los guards, el `Actor` y `@Roles` son de 003. Esta spec emite y verifica los tokens e implementa el puerto de verificación que define `shared`. | Spec 003 D-2 |
| R-10 | Todo en español, usable desde 360 px, contraste AA, tokens de Cielo Sereno. | RNF-13, Art. XIII |

### 5.2 Decisiones del dueño

Todas las tomó Adrián el 2026-09-26. La numeración D-n sigue a la pregunta P-n que resuelve.

| # | Decisión | Pregunta |
|---|---|---|
| D-1 | **Dónde viven las credenciales.** El token de acceso vive **en memoria** de la aplicación web (nunca en `localStorage` ni `sessionStorage`) y viaja en `Authorization: Bearer`. El token de refresco vive en una cookie `httpOnly`, `Secure` (salvo en `localhost`), `SameSite=Strict` y limitada a las rutas de renovación y cierre de sesión. Al recargar la página, la web pide un token de acceso nuevo con la cookie. Socket.IO (015) manda el token de acceso en el handshake. | P-1 |
| D-2 | **Duraciones.** Token de acceso: **15 min**. Sesión (token de refresco): vence tras **7 días sin uso** y, como máximo, **30 días** después de iniciada, aunque se use a diario. Después hay que iniciar sesión otra vez. | P-2 |
| D-3 | **Rotación y reúso.** Cada renovación entrega un token de refresco nuevo y el anterior deja de servir. Si alguien presenta un token de refresco ya rotado, se **revoca toda esa sesión** y se avisa al dueño por correo (señal de robo). Para no castigar dos pestañas que renuevan a la vez, dentro de la **gracia de rotación** (RN-4) un token recién rotado se rechaza sin revocar. | P-3 |
| D-4 | **Dispositivo.** Cada navegador recibe un identificador aleatorio (≥ 128 bits) en una cookie `httpOnly` de 1 año, que se guarda como hash en `dispositivo.huella_hash`, junto con `agente_usuario`, `ultima_ip` y `ultimo_acceso` (**resuelve DF-11**; se agrega la clase `Device` a M1). Un dispositivo es **nuevo** si esa cuenta nunca lo ha visto. El dispositivo donde se verificó el correo (D-20 de 001) queda como conocido, sin aviso. Si la persona borra sus cookies, su navegador cuenta como nuevo. | P-4 |
| D-5 | **Fuerza bruta.** **5** intentos fallidos para un mismo correo normalizado en **15 min** bloquean el inicio de sesión de ese correo durante **15 min**. Se cuentan exista o no la cuenta, para no permitir enumeración. Restablecer la contraseña quita el bloqueo. Además, **20** intentos por IP cada 15 min con el `ThrottlerModule`. | P-5 |
| D-6 | **Recuperación.** Enlace con token opaco (≥ 128 bits), guardado como hash en `token_cuenta` con tipo recuperación, de **un solo uso** con consumo atómico y válido **1 hora**. Pedir otro invalida los anteriores. La respuesta es neutra. Al restablecer: la contraseña cambia (política D-6 de 001), se cierran **todas** las sesiones (RF-02), se quita el bloqueo de D-5, se envía «Tu contraseña cambió» y **no** se inicia sesión: la persona entra con su contraseña nueva. Límites por correo iguales a D-8 de 001 (60 s entre solicitudes y 5 por hora). | P-6 |
| D-7 | **Cambiar la contraseña estando dentro** entra en esta spec, en «Seguridad». Pide la contraseña actual, la nueva (política D-6 de 001) y su confirmación, que se valida en el cliente antes de enviar. Al cambiarla se cierran las **demás** sesiones, la actual sigue abierta y se envía «Tu contraseña cambió». Tras **5** contraseñas actuales incorrectas en 15 min, el cambio queda bloqueado 15 min sin cerrar la sesión: los intentos siguientes responden `IDENTITY_PASSWORD_CHANGE_LOCKED` con los minutos que faltan, como `IDENTITY_LOGIN_LOCKED` en el inicio de sesión (CA-5). | P-7 |
| D-8 | **Revocación.** Cada sesión se cierra **individualmente** desde la lista (la actual equivale a cerrar sesión y, desde la lista, pide confirmación), y además existe «Cerrar las demás sesiones». Lo atiende `SessionsController` (**resuelve la parte de sesiones de DF-15**). | P-8 |
| D-9 | **Lista de sesiones.** Muestra navegador y sistema (leídos del agente de usuario), inicio, última actividad y la marca «Este dispositivo», primero la actual y después por última actividad. **No** muestra IP ni ubicación. | P-9 |
| D-10 | **Cuenta suspendida** (`usuario.estado`, D-3 de 001). Con la contraseña correcta se responde `IDENTITY_ACCOUNT_SUSPENDED`; con la incorrecta, la respuesta genérica. La renovación de una cuenta suspendida falla y revoca la sesión. Quien suspende (011) revoca además todas sus sesiones; un token de acceso ya emitido dura como máximo 15 min. | P-10 |
| D-11 | **`ThrottlerModule`** entra con la **001**, que lo usa primero (D-15 de 001), y esta spec lo reutiliza. La D-9 de la spec 000 se actualiza en el plan de 001. | P-11 |
| D-12 | **Pantallas.** Solo «Seguridad» necesita mockup nuevo. Inicio de sesión ya existe (propuesta p. 07) y sus estados, la recuperación y los correos reutilizan patrones de 001 como decisión explícita (§11). | P-12 |
| D-13 | **Contenido del token de acceso**: solo `sub` (id de la cuenta), `rol`, `sid` (id de la sesión), `iat` y `exp`. Sin correo ni nombre. Se firma con una clave del backend que vive en variables de entorno. | — (derivada de D-1 y R-9) |
| D-14 | `identity` implementa el **puerto de verificación del token de acceso** que declara `shared` (003 D-2). La raíz de composición (`AppModule`) enlaza esa implementación al puerto; el guard global de 003 y el handshake de `realtime` (015) dependen solo del puerto de `shared`, nunca de `identity` (ADR-0010). | — (derivada de R-9) |
| D-15 | **Recuperación de una cuenta no verificada.** La respuesta es la misma neutra de siempre, pero en lugar del enlace de recuperación se envía un **enlace de verificación nuevo** de 001 (con su vigencia de 24 h). Lo acota solo el límite de recuperación por correo (60 s y 5 por hora), que se aplica antes de buscar la cuenta; el límite de registro y reenvío de 001 (D-8) no se consulta ni se gasta, porque un `429` posterior en `resend-verification` delataría a las cuentas no verificadas (RN-2). La persona verifica, entra (D-20 de 001) y, si quiere, cambia la contraseña en «Seguridad». | P-13 |
| D-16 | **Decisiones de UX de «Seguridad»** aprobadas (2026-09-26): se llega desde el menú de la cuenta (sin entrada en la barra lateral); sin medidor de fuerza (se reutilizan los requisitos en vivo del registro); los botones que abren una confirmación son `outline` y solo el de confirmar es `destructive`; fechas relativas para la última actividad y absolutas para el inicio, en hora de Guatemala. Detalle en el README del mockup (§11). | Revisión del mockup |

## 6. Parámetros

| Parámetro | Significado | Valor | Origen |
|---|---|---|---|
| Vida del token de acceso | Validez desde su emisión | 15 min | D-2 |
| Inactividad máxima de la sesión | Tiempo sin renovar tras el cual la sesión vence | 7 días | D-2 |
| Vida máxima de la sesión | Desde el inicio de sesión, aunque se renueve | 30 días | D-2 |
| Gracia de rotación | Tiempo tras una rotación en que el token anterior se rechaza sin revocar | 10 s | D-3 |
| Fallos de inicio de sesión | Por correo normalizado, en 15 min, antes del bloqueo | 5 | D-5 |
| Bloqueo de inicio de sesión | Duración del bloqueo de un correo | 15 min | D-5 |
| Intentos por IP | Solicitudes de inicio de sesión por IP en 15 min | 20 | D-5 |
| Vigencia del enlace de recuperación | Desde su emisión | 1 h | D-6 |
| Solicitudes de recuperación por correo | Espera entre dos y máximo por hora | 60 s; 5 por hora | D-6 (= D-8 de 001) |
| Contraseña actual incorrecta | Intentos en 15 min antes de bloquear el cambio 15 min | 5 | D-7 |
| Vida de la cookie de dispositivo | Desde la última vez que se emitió | 1 año | D-4 |

## 7. Criterios de aceptación

> Formato Dado/Cuando/Entonces. Cada criterio es verificable por una prueba automatizada o por un procedimiento
> reproducible (los marcados «manual» dejan evidencia en `verification.md`). Los códigos de error son la propuesta de
> esta spec; el `status` HTTP lo fija el plan con las clases de `DomainError` de `shared`. «Respuesta neutra» = mismo
> `status`, mismo cuerpo y mismas cabeceras (salvo `x-correlation-id`). Los tiempos se prueban con `FixedClock`.

### Inicio de sesión (HU-1, HU-6, RF-03)

- **CA-1** (HU-1, RF-03, D-1, D-2) — inicio de sesión correcto
  - **Dado** un cliente verificado y activo,
  - **Cuando** inicia sesión con su correo y su contraseña,
  - **Entonces** recibe un token de acceso que vence a los 15 min, una cookie de refresco con `httpOnly`,
    `SameSite=Strict`, `Secure` (fuera de `localhost`) y ruta limitada, y una cookie de dispositivo si no la tenía;
    queda una sesión nueva ligada a ese dispositivo, y la web lo lleva a Mis archivos.
- **CA-2** (HU-6, RN-2) — credenciales inválidas sin enumeración
  - **Dado** un correo sin cuenta, o una cuenta con otra contraseña,
  - **Cuando** se intenta iniciar sesión,
  - **Entonces** en ambos casos la respuesta es neutra, `IDENTITY_INVALID_CREDENTIALS`, y no se emite ninguna
    credencial. Cuando el correo no existe se calcula igual un hash de Argon2id, para no delatarlo por el tiempo de
    respuesta (revisión manual del `security-auditor` con una muestra de peticiones, como en 001).
- **CA-3** (HU-6, R-4; **cierra CA-16 de 001**) — cuenta no verificada
  - **Dado** una cuenta no verificada,
  - **Cuando** inicia sesión con la contraseña correcta,
  - **Entonces** no recibe credenciales y se responde `IDENTITY_EMAIL_NOT_VERIFIED` con la acción que lleva a pedir
    un enlace nuevo; con la contraseña incorrecta se aplica CA-2.
- **CA-4** (HU-6, D-10) — cuenta suspendida
  - **Dado** una cuenta suspendida,
  - **Cuando** inicia sesión con la contraseña correcta,
  - **Entonces** no recibe credenciales y se responde `IDENTITY_ACCOUNT_SUSPENDED`; con la incorrecta, CA-2.
- **CA-5** (HU-6, D-5, RNF-07) — bloqueo por correo
  - **Dado** un correo normalizado, con o sin cuenta, con 5 intentos fallidos en los últimos 15 min,
  - **Cuando** se intenta iniciar sesión otra vez, incluso con la contraseña correcta,
  - **Entonces** se responde `IDENTITY_LOGIN_LOCKED` con los minutos que faltan, igual exista o no la cuenta;
  - **Y** pasados 15 min vuelve a permitirse, y restablecer la contraseña (CA-19) quita el bloqueo al momento.
- **CA-6** (HU-6, D-5, RNF-07) — límite por IP
  - **Dado** 20 intentos de inicio de sesión desde una misma IP en 15 min, con correos cualesquiera,
  - **Cuando** llega el siguiente,
  - **Entonces** se responde `IDENTITY_TOO_MANY_REQUESTS` sin evaluar las credenciales.

### Renovación (HU-1, RF-03)

- **CA-7** (HU-1, RF-03, D-3) — renovación correcta
  - **Dado** una sesión vigente,
  - **Cuando** la web presenta la cookie de refresco,
  - **Entonces** recibe un token de acceso nuevo y una cookie de refresco nueva; el token de refresco anterior deja de
    servir y la última actividad de la sesión se actualiza.
- **CA-8** (HU-1, D-2) — vencimiento
  - **Dado** una sesión sin renovar durante más de 7 días, u otra iniciada hace más de 30 días aunque se renueve a diario,
  - **Cuando** se intenta renovar,
  - **Entonces** se responde `IDENTITY_SESSION_EXPIRED`, se borra la cookie de refresco y la web muestra «Tu sesión
    terminó. Inicia sesión de nuevo.»
- **CA-9** (HU-6, D-3, RN-4) — reúso de un token rotado
  - **Dado** un token de refresco que ya se rotó hace más de la gracia de rotación,
  - **Cuando** alguien lo presenta,
  - **Entonces** se revoca toda la sesión (ningún token de refresco de ella vuelve a servir), se responde
    `IDENTITY_SESSION_REVOKED` y el dueño recibe el correo «Cerramos una sesión por seguridad»;
  - **Y** si lo presenta dentro de la gracia, se responde `IDENTITY_REFRESH_INVALID` sin revocar la sesión.
- **CA-10** (D-10) — renovación de una cuenta suspendida o de una sesión revocada
  - **Dado** una sesión revocada, o una cuenta que se suspendió después de iniciar sesión,
  - **Cuando** se intenta renovar,
  - **Entonces** falla con `IDENTITY_SESSION_REVOKED` y, si la cuenta está suspendida, la sesión queda revocada.

### Sesiones (HU-3, HU-7, RF-04, RNF-05)

- **CA-11** (HU-3, RF-04, D-9) — lista de sesiones
  - **Dado** un cliente con sesiones abiertas en tres navegadores y otra cuenta con sus propias sesiones,
  - **Cuando** consulta sus sesiones,
  - **Entonces** ve solo las suyas vigentes (no las revocadas ni las vencidas), cada una con navegador y sistema,
    inicio y última actividad, con la actual primero y marcada «Este dispositivo»;
  - **Y** la respuesta no contiene IP, tokens, hashes ni identificadores de dispositivo, ni sesiones de otra cuenta.
- **CA-12** (HU-3, RF-04, D-8) — cerrar una sesión
  - **Dado** un cliente con una sesión en otro navegador,
  - **Cuando** la cierra desde la lista,
  - **Entonces** el token de refresco de esa sesión deja de servir al momento y su token de acceso deja de servir a
    más tardar cuando vence (15 min);
  - **Y** si intenta cerrar una sesión de otra cuenta, se responde como si no existiera (003 D-6) y nada cambia.
- **CA-13** (HU-3, D-8) — cerrar las demás sesiones
  - **Dado** un cliente con cuatro sesiones abiertas,
  - **Cuando** elige «Cerrar las demás sesiones»,
  - **Entonces** quedan revocadas todas salvo la actual, y la pantalla lo confirma con el número de sesiones cerradas.
- **CA-14** (HU-7) — cerrar sesión
  - **Dado** un cliente con sesión,
  - **Cuando** cierra sesión,
  - **Entonces** su sesión queda revocada, la cookie de refresco se borra y la de dispositivo se conserva;
  - **Y** si la cierra desde la lista de «Seguridad» o desde el menú de la cuenta, antes se pide confirmación (D-8, Q-3).
- **CA-15** (R-5; **cierra CA-26 y CA-29 de 001**) — sesión al verificar
  - **Dado** un enlace de verificación válido de 001,
  - **Cuando** se abre,
  - **Entonces** ese navegador recibe las credenciales de CA-1, la sesión aparece en la lista (CA-11) y se puede
    cerrar (CA-12), y ese dispositivo queda como conocido sin aviso (D-4);
  - **Y** en los casos (a) a (d) de CA-29 de 001 no se entrega ninguna sesión, salvo a la única apertura que gana en (d).

### Dispositivo nuevo (HU-4, RF-04)

- **CA-16** (HU-4, RF-04, D-4) — aviso de dispositivo nuevo
  - **Dado** un cliente que inicia sesión desde un navegador que su cuenta nunca ha visto,
  - **Cuando** el inicio de sesión es correcto,
  - **Entonces** recibe el correo «Nuevo inicio de sesión en Nimbo» con navegador, sistema, fecha y hora de Guatemala y
    un enlace a «Seguridad»;
  - **Y** desde un navegador ya conocido por su cuenta no recibe aviso.
- **CA-17** (D-4, R-3) — el dispositivo se guarda como hash
  - **Dado** un inicio de sesión,
  - **Cuando** se revisa la base de datos,
  - **Entonces** el identificador del dispositivo solo aparece como hash y la cookie que lo lleva es `httpOnly`.

### Recuperación de contraseña (HU-2, RF-02)

- **CA-18** (HU-2, RF-02, D-6) — pedir el enlace sin enumeración
  - **Dado** un correo de una cuenta verificada, uno de una cuenta no verificada, uno de una cuenta interna y uno sin cuenta,
  - **Cuando** se pide la recuperación para cada uno,
  - **Entonces** las cuatro respuestas son neutras; en Mailpit solo aparece el enlace de 1 hora para la cuenta
    verificada y la interna (la no verificada recibe un enlace de verificación nuevo de 001, D-15);
  - **Y** los límites por correo (60 s y 5 por hora) se aplican exista o no la cuenta, con `IDENTITY_TOO_MANY_REQUESTS`.
- **CA-19** (HU-2, RF-02, D-6) — restablecer
  - **Dado** un enlace de recuperación válido y un cliente con sesiones abiertas en dos navegadores,
  - **Cuando** abre el enlace y elige una contraseña nueva que cumple D-6 de 001,
  - **Entonces** la contraseña cambia, **todas** sus sesiones quedan revocadas, el bloqueo de CA-5 desaparece, recibe
    «Tu contraseña cambió» y la pantalla le pide iniciar sesión; no se crea ninguna sesión.
- **CA-20** (HU-2, D-6) — enlace vencido, usado, reemplazado o inválido
  - **Dado** un enlace con 1 hora o más, ya usado, reemplazado por otro más reciente o alterado,
  - **Cuando** se abre o se envía la contraseña nueva,
  - **Entonces** se responde `IDENTITY_RESET_LINK_EXPIRED` (vencido) o `IDENTITY_RESET_LINK_INVALID` (los demás) con
    la acción de pedir uno nuevo, y la contraseña no cambia;
  - **Y** si se envía dos veces a la vez, solo una lo consume (consumo atómico).
- **CA-21** (HU-2, D-6) — contraseña débil al restablecer
  - **Dado** un enlace válido,
  - **Cuando** se envía una contraseña que no cumple D-6 de 001,
  - **Entonces** se responde `IDENTITY_WEAK_PASSWORD` con los requisitos que faltan y el enlace sigue sirviendo.

### Cambio de contraseña (HU-5)

- **CA-22** (HU-5, D-7) — cambio correcto
  - **Dado** un cliente con sesión en tres navegadores,
  - **Cuando** cambia su contraseña desde uno con la actual correcta y una nueva que cumple D-6 de 001,
  - **Entonces** la contraseña cambia, las otras dos sesiones quedan revocadas, la actual sigue abierta y recibe
    «Tu contraseña cambió».
- **CA-23** (HU-5, D-7) — contraseña actual incorrecta
  - **Dado** un cliente con sesión,
  - **Cuando** envía una contraseña actual incorrecta,
  - **Entonces** se responde `IDENTITY_WRONG_PASSWORD` y nada cambia;
  - **Y** tras 5 fallos en 15 min, el siguiente intento, incluso con la contraseña actual correcta, responde
    `IDENTITY_PASSWORD_CHANGE_LOCKED` con los minutos que faltan; pasados 15 min vuelve a permitirse y la sesión nunca se cierra.

### Privacidad, bitácoras y frontera con 003 y 015 (HU-8)

- **CA-24** (RNF-04, R-3) — nada recuperable en la base de datos
  - **Dado** inicios de sesión, renovaciones, recuperaciones y cambios de contraseña,
  - **Cuando** se revisan las tablas,
  - **Entonces** los tokens de refresco, los tokens de recuperación y los identificadores de dispositivo solo aparecen
    como hash, y las contraseñas con Argon2id (RN-3 de 001).
- **CA-25** (HU-8, RNF-17, R-8) — bitácoras
  - **Dado** los flujos de esta spec, incluidos los fallos,
  - **Cuando** se revisan las bitácoras de `api` y `worker`,
  - **Entonces** cada línea lleva `correlationId`; los eventos (inicio de sesión correcto o fallido con su categoría,
    bloqueo, renovación, reúso detectado, revocación, recuperación pedida y aplicada, dispositivo nuevo, cambio de
    contraseña) identifican la cuenta solo por su `id`; y no aparecen contraseñas, tokens, valores de cookies,
    identificadores de dispositivo ni correos.
- **CA-26** (D-14) — puerto de verificación del token
  - **Dado** un token de acceso válido, uno vencido, uno alterado y uno firmado con otra clave,
  - **Cuando** se verifican con el puerto que implementa `identity`,
  - **Entonces** el válido devuelve `id`, `rol` y `sid`, y los otros tres se rechazan. Es lo que usan el guard de 003
    y el handshake de 015.

### Interfaz (HU-1 a HU-5)

- **CA-27** (RNF-13, RNF-14, §11) — pantallas y estados
  - **Dado** las pantallas y estados de §11,
  - **Cuando** se recorren a 360 y 1440 px,
  - **Entonces** coinciden con su mockup o con la decisión explícita de §11, están en español con los mensajes clave,
    los errores aparecen junto al campo o en una alerta con acción correctiva, y axe no reporta violaciones serias.
- **CA-28** (D-1) — el token de acceso no se guarda en el navegador
  - **Dado** un cliente con sesión en la web,
  - **Cuando** se inspeccionan `localStorage`, `sessionStorage` y las cookies legibles por JavaScript,
  - **Entonces** ninguna contiene un token; al recargar la página, la sesión se recupera con la cookie de refresco.

## 8. Reglas de negocio

- **RN-1** Solo obtienen credenciales las cuentas verificadas y activas, de cliente o internas.
- **RN-2** Las respuestas a quien no ha demostrado conocer la contraseña nunca revelan si un correo tiene cuenta, si
  está verificada, si es interna o si está suspendida (CA-2, CA-5, CA-18). `IDENTITY_EMAIL_NOT_VERIFIED` e
  `IDENTITY_ACCOUNT_SUSPENDED` solo aparecen con la contraseña correcta.
- **RN-3** Cada inicio de sesión crea una sesión propia con su token de refresco; revocar una no afecta a las demás.
- **RN-4** El token de refresco rota en cada uso. Presentar uno ya rotado revoca la sesión, salvo dentro de la gracia
  de rotación (10 s), en la que se rechaza sin revocar (D-3). La web renueva desde una sola pestaña a la vez.
- **RN-5** Las duraciones de D-2 no se pueden extender desde el cliente.
- **RN-6** Restablecer la contraseña revoca todas las sesiones y no inicia sesión (RF-02, D-6). Cambiarla estando dentro
  revoca las demás (D-7).
- **RN-7** El aviso de dispositivo nuevo se envía en cada inicio de sesión correcto desde un dispositivo que la cuenta
  no conoce (D-4). No se envía al verificar el correo.
- **RN-8** Los tokens y los identificadores de dispositivo se generan con un generador criptográficamente seguro, con al
  menos 128 bits de entropía; se guardan como hash y se comparan en tiempo constante.
- **RN-9** Los correos de esta spec están en español, con tuteo, y dicen qué hacer si la persona no reconoce la actividad.
- **RN-10** El token de acceso solo lleva `sub`, `rol`, `sid`, `iat` y `exp` (D-13).

## 9. Requisitos no funcionales aplicables

| RNF | Cómo aplica aquí | Cómo se verifica |
|---|---|---|
| RNF-04 | Argon2id; tokens y dispositivos como hash; cookies `Secure` y todo sobre TLS en staging | CA-17, CA-24 (revisión del `security-auditor`) |
| RNF-05 | Cada cuenta solo lista y revoca sus propias sesiones | CA-11, CA-12 (suite de aislamiento) |
| RNF-07 | Límite de tasa en inicio de sesión, recuperación y cambio de contraseña | CA-5, CA-6, CA-18, CA-23 |
| RNF-10 | Migraciones de `sesion` y `dispositivo` reversibles | Job `migrations` de CI (000 CA-11) |
| RNF-13 | Inicio de sesión, recuperación y «Seguridad» a 360 px, en español, AA | CA-27 |
| RNF-14 | Errores con acción correctiva; estado de carga en cada envío | CA-27 |
| RNF-17 | `correlationId` en toda línea; sin datos sensibles | CA-25 |

## 10. Seguridad y privacidad

- **¿Toca contenido de archivos?** No. Solo datos de cuenta, sesiones y dispositivos.
- **Operaciones públicas sin `Actor`**: iniciar sesión, renovar, pedir y aplicar la recuperación. Las demás (listar y
  revocar sesiones, cerrar sesión, cambiar contraseña) reciben el `Actor` de 003 y solo actúan sobre su cuenta.
- **Robo de credenciales**: token de acceso corto y fuera del almacenamiento del navegador (D-1); refresco `httpOnly`
  rotativo con detección de reúso (D-3); aviso de dispositivo nuevo (D-4); sesiones visibles y revocables (D-8).
- **CSRF**: solo las rutas de renovación y cierre de sesión usan la cookie, y `SameSite=Strict` impide que otro sitio
  la envíe. El resto de la API usa el token de acceso en la cabecera, que otro sitio no puede leer. La web y la API
  deben ser del mismo sitio (en local, `localhost`; en staging, el mismo dominio registrable).
- **XSS**: un script inyectado podría usar el token en memoria mientras la página esté abierta, pero no llevárselo
  guardado ni leer el refresco. La política de contenido y la ausencia de HTML sin sanitizar son de 000/000b.
- **Enumeración**: RN-2, con el mismo cuidado de tiempos que 001 (CA-2).
- **Auditoría (RF-07)**: no aplica. Aquí solo actúa el dueño sobre su cuenta. Revocar sesiones ajenas es de 011 y se
  audita allí.
- **Límite de tasa**: inicio de sesión (D-5), recuperación (D-6) y cambio de contraseña (D-7).
- **Nunca en bitácoras**: R-8 y CA-25.
- **Secretos**: la clave que firma los tokens vive en variables de entorno del backend (en staging, GitHub
  Environments y el `.env` del Droplet); `.env.example` lleva un valor de desarrollo. Nunca en `NEXT_PUBLIC_*`.
- **Datos personales**: `dispositivo.ultima_ip` y el agente de usuario se guardan para seguridad y no se muestran (D-9).
  La Política de privacidad (001) ya informa el uso de datos técnicos para la seguridad de la cuenta.

## 11. Experiencia de usuario

> Rutas relativas a `docs/design/`. «Decisión explícita» = la pantalla no tiene mockup propio porque reutiliza un
> patrón ya dibujado; basta para `Aclarada` (`workflow.md` §2). La tabla la revisa el `ui-designer`.

| Pantalla | Mockup | Estados | Estado del mockup |
|---|---|---|---|
| Inicio de sesión | `mockups/identity/inicio-sesion/inicio-sesion.html` (propuesta p. 07) | default (existente). **Decisión explícita** para error (credenciales inválidas), enviando, bloqueado, no-verificado (lleva a pedir-enlace de 001) y suspendida: alerta de 000b encima del formulario y botón en carga, como `registro--error-servidor` y `registro--enviando` | Borrador |
| Recuperar contraseña: pedir el enlace | **Decisión explícita**: mismo esquema que `mockups/identity/registro/registro--pedir-enlace.html` | default, enviando, error, límite | — |
| Recuperar contraseña: revisa tu correo | **Decisión explícita**: como `registro--exito.html`, sin «Cambiar correo» | default | — |
| Restablecer contraseña: contraseña nueva | **Decisión explícita**: campo de contraseña con requisitos en vivo del registro (`registro.html`) | default, error-campos, enviando | — |
| Restablecer contraseña: enlace vencido o inválido | **Decisión explícita**: como `verificar-correo--enlace-expirado.html` y `--enlace-invalido.html` | enlace-expirado, enlace-invalido | — |
| Restablecer contraseña: listo | **Decisión explícita**: como `verificar-correo--ya-verificado.html`, con «Iniciar sesión» y sin sesión | exito | — |
| **Seguridad** (sesiones y contraseña) | [`mockups/identity/seguridad/seguridad.html`](../../docs/design/mockups/identity/seguridad/seguridad.html) y sus estados ([README](../../docs/design/mockups/identity/seguridad/README.md), capturas en `capturas/identity/seguridad/`) — **único mockup nuevo requerido**; dentro del marco de la aplicación (se llega desde el menú de la cuenta) | default (este dispositivo y otros), cargando, error-sesiones, sin-otras-sesiones, confirmar-cierre, confirmar-cierre-actual, sesion-cerrada, cerrar-demas (confirmación) y cerrar-demas-exito (resultado), cambiar contraseña: default (formulario), contrasena-enviando, contrasena-incorrecta, contrasena-debil y contrasena-no-coincide (error), contrasena-bloqueada (bloqueo) y contrasena-cambiada (éxito) | Aprobado (2026-09-26) |
| Correos: recuperación, dispositivo nuevo, contraseña cambiada, sesión cerrada por seguridad | **Decisión explícita**: misma plantilla de 600 px de `mockups/identity/correos/correos--registro.html`, con los textos de abajo | — | — |

- Mensajes clave (español, tuteo, con acción correctiva):
  - Credenciales inválidas: «El correo o la contraseña no son correctos. Revísalos o restablece tu contraseña.»
  - No verificada: el de CA-16 de 001 («Verifica tu correo con el enlace que te enviamos; si venció, pide uno nuevo»).
  - Suspendida: «Tu cuenta está suspendida. Si crees que es un error, escríbenos a {correo de contacto}.»
  - Bloqueo: «Hubo demasiados intentos fallidos. Espera {N} minutos o restablece tu contraseña.»
  - Límite por IP: «Hiciste demasiados intentos. Espera unos minutos y vuelve a intentarlo.»
  - Sesión vencida: «Tu sesión terminó. Inicia sesión de nuevo.»
  - Recuperación pedida (neutra): «Si hay una cuenta con {correo}, te enviamos un enlace para restablecer tu
    contraseña. Vence en 1 hora.»
  - Enlace de recuperación vencido: «Este enlace venció. Pide uno nuevo y úsalo en la próxima hora.»
  - Enlace de recuperación inválido: «Este enlace no es válido. Usa el enlace del correo más reciente o pide uno nuevo.»
  - Restablecida: «Listo. Cambiamos tu contraseña y cerramos todas tus sesiones. Inicia sesión con la nueva.»
  - Contraseña actual incorrecta: «La contraseña actual no es correcta.»
  - Contraseña nueva débil: «La contraseña no cumple todos los requisitos.» (con los requisitos que faltan marcados)
  - Confirmación distinta: «Las contraseñas no coinciden. Escribe la misma en los dos campos.»
  - Cambio bloqueado: «Hiciste demasiados intentos con una contraseña incorrecta. Espera {N} minutos o restablece tu contraseña.»
  - Contraseña cambiada (pantalla): «Cambiamos tu contraseña y cerramos tus otras sesiones.»
  - Cerrar una sesión: «¿Cerrar la sesión en {navegador} · {sistema}? Ese dispositivo tendrá que iniciar sesión de nuevo.»
  - Cerrar la sesión actual: «¿Cerrar la sesión en este dispositivo?» / «Tendrás que iniciar sesión de nuevo para volver a entrar.» / «Cerrar sesión»
  - Sesión cerrada: «Cerramos la sesión en {navegador} · {sistema}.»
  - Confirmar «Cerrar las demás»: «¿Cerrar las demás sesiones?» / «Cerraremos {n} sesiones. Esos dispositivos tendrán que iniciar sesión de nuevo; la de este dispositivo seguirá abierta.» / «Cerrar {n} sesiones» (con n = 1: «Cerraremos 1 sesión. Ese dispositivo tendrá que iniciar sesión de nuevo; la de este dispositivo seguirá abierta.» / «Cerrar 1 sesión»)
  - Sin otras sesiones: «No tienes otras sesiones abiertas. Si inicias sesión en otro navegador o dispositivo, aparecerá aquí.»
  - Lista sin cargar: «No pudimos cargar tus sesiones.» más el mensaje genérico de 000 y «Reintentar»
  - Cerrar las demás: «Cerramos {n} sesiones. Solo queda abierta la de este dispositivo.» (con n = 1: «Cerramos 1 sesión. …»)
  - Correo de recuperación: «Abre este enlace para elegir una contraseña nueva: {enlace}. Vence en 1 hora y solo
    funciona una vez. Al cambiarla cerraremos todas tus sesiones. Si no lo pediste, ignora este mensaje: tu contraseña
    no cambia.»
  - Correo de dispositivo nuevo (asunto «Nuevo inicio de sesión en Nimbo»): «Alguien inició sesión en tu cuenta el
    {fecha} a las {hora} desde {navegador} en {sistema}. Si fuiste tú, no tienes que hacer nada. Si no, cambia tu
    contraseña y cierra esa sesión desde Seguridad.»
  - Correo de contraseña cambiada: «Tu contraseña de Nimbo cambió el {fecha} a las {hora}. Si no fuiste tú,
    restablécela ahora: {enlace a recuperar}.»
  - Correo de sesión cerrada por seguridad: «Cerramos una sesión de tu cuenta ({navegador} · {sistema}) porque sus
    credenciales se usaron de forma sospechosa. Si no reconoces la actividad, cambia tu contraseña.»
- Diferencias aceptadas respecto al mockup de inicio de sesión: el botón principal usa el token corregido de DF-41.

## 12. Fuera de alcance

- Segundo factor de autenticación, inicio de sesión con Google u otros proveedores y acceso sin contraseña.
- Opción «Recordarme»: las duraciones de D-2 son fijas.
- IP, ubicación o mapa en la lista de sesiones (D-9).
- Revocar al instante un token de acceso ya emitido: vive como máximo 15 min (D-10, §13).
- Límite de sesiones simultáneas por cuenta.
- Cambiar el correo de una cuenta verificada, y eliminar la cuenta (por correo, según los Términos de 001).
- Que Administrador o Soporte vean o cierren sesiones de otra cuenta: 011.
- Guards, `Actor`, `@Roles` y respuestas 401/403: 003. Handshake de Socket.IO: 015.

## 13. Riesgos

| Riesgo | Impacto | Mitigación |
|---|---|---|
| El token de acceso de una sesión revocada o de una cuenta suspendida sigue sirviendo hasta 15 min | Acceso breve después de cerrar una sesión robada | Vida corta (D-2); el refresco se corta al momento (CA-12). Si hiciera falta, una lista de `sid` revocados en Redis con TTL de 15 min, fuera de alcance |
| El bloqueo por correo (D-5) permite a un tercero bloquear a la víctima 15 min | Molestia para el dueño | Restablecer la contraseña quita el bloqueo (CA-5); el límite por IP frena al atacante |
| Dos pestañas renuevan a la vez y la segunda parece reúso | Sesiones cerradas sin motivo | Gracia de rotación (RN-4) y renovación desde una sola pestaña en la web; 10 s confirmados (P-14) |
| Cookies entre `web` y `api` en sitios distintos | La cookie de refresco no llega | Mismo sitio en local y en staging (§10); el plan fija dominios y rutas |
| Leer navegador y sistema del agente de usuario puede pedir una librería | Dependencia nueva | ADR menor en el plan si se agrega; si no, un analizador mínimo propio con pruebas |
| **Plazo**: 002 depende de 001 sin atajos y el Avance 1 es el 30/09/2026 | Entrega del 30 % incompleta | Planificar 002 en paralelo con la implementación de 001; «Seguridad» es el único mockup pendiente |

## 14. Dependencias y documentos a actualizar

- **DF decididos por esta spec**: DF-11 (D-4) y la parte de sesiones de DF-15 (D-8). El `architect` actualiza en el
  PR del plan: `design-findings.md`, `Diagramas_ER.pdf` (`dispositivo` con `huella_hash`, `agente_usuario`,
  `ultima_ip`, `ultimo_acceso`; `sesion` con su token de refresco como hash, fechas de inicio, último uso, vencimiento
  y revocación), `Diagramas_de_Clases.pdf` (M1: `Device`, `SessionsController`) y `design-model.md` §3 M1 y §4.
- **ADR**: uno menor en `/plan` para `@nestjs/passport`, `passport-jwt` y `@nestjs/jwt` (y la librería del agente de
  usuario, si se agrega). ADR-0010 debe estar `Aceptado` antes del plan, como en 001.
- **Specs relacionadas**:
  - **001**: usa `usuario`, `token_cuenta`, `IPasswordHasher`, `IUserRepository`, `IMailer` y el `ThrottlerModule`
    (D-11); esta spec escribe las pruebas de CA-16, CA-26 y CA-29 de 001 (CA-3 y CA-15).
  - **003**: su guard verifica el token con el puerto de D-14 y responde 401/403; la regla de «como si no existiera»
    para sesiones ajenas es su D-6.
  - **015**: el handshake de Socket.IO usa el puerto de D-14.
  - **011**: al suspender una cuenta revoca sus sesiones (D-10) y audita las acciones internas.
  - **000**: D-9 (el `ThrottlerModule` entra con 001).
- **Documentos**:
  - `ui-guidelines.md` §7: filas de inicio de sesión, recuperación (decisión explícita) y «Seguridad» (antes «Sesiones
    y dispositivos»).
  - `.env.example`: clave de firma del token de acceso (valor de desarrollo) y URL pública de `web` para los enlaces.
  - Manual de Usuario: secciones «Iniciar sesión», «Recuperar tu contraseña» y «Seguridad», entregable del curso.

## 15. Preguntas

### Abiertas

Ninguna.

### Resueltas

- [RESUELTA] P-1 → D-1: A, token de acceso en memoria y refresco en cookie `httpOnly` `SameSite=Strict` (2026-09-26, Adrián)
- [RESUELTA] P-2 → D-2: A, 15 min; 7 días sin uso; máximo 30 días (2026-09-26, Adrián)
- [RESUELTA] P-3 → D-3: A, el reúso revoca la sesión y avisa por correo (2026-09-26, Adrián)
- [RESUELTA] P-4 → D-4: A, identificador aleatorio en cookie, guardado como hash (2026-09-26, Adrián)
- [RESUELTA] P-5 → D-5: A, 5 fallos por correo en 15 min bloquean 15 min; 20 por IP (2026-09-26, Adrián)
- [RESUELTA] P-6 → D-6: A, enlace de 1 h; al restablecer se cierran todas las sesiones y no se inicia sesión (2026-09-26, Adrián)
- [RESUELTA] P-7 → D-7: B, cambiar la contraseña estando dentro entra en «Seguridad» (2026-09-26, Adrián)
- [RESUELTA] P-8 → D-8: A, revocación individual y «Cerrar las demás sesiones» (2026-09-26, Adrián)
- [RESUELTA] P-9 → D-9: A, navegador, sistema, inicio, última actividad y «Este dispositivo»; sin IP (2026-09-26, Adrián)
- [RESUELTA] P-10 → D-10: A, suspendida solo con la contraseña correcta; el refresco falla (2026-09-26, Adrián)
- [RESUELTA] P-11 → D-11: A, el `ThrottlerModule` entra con 001 (2026-09-26, Adrián)
- [RESUELTA] P-12 → D-12: lista de pantallas; mockup solo donde hace falta («Seguridad») (2026-09-26, Adrián)
- [RESUELTA] P-13 → D-15: A, se envía un enlace de verificación nuevo en lugar del de recuperación (2026-09-26, Adrián)
- [RESUELTA] P-14 → D-3: A, 10 s de gracia de rotación (2026-09-26, Adrián)

## 16. Registro de cambios

| Fecha | Cambio | Motivo | Aprobó |
|---|---|---|---|
| 2026-09-26 | Creación en `Borrador` con las decisiones D-1 a D-14 (respuestas a P-1–P-12) y dos preguntas abiertas no bloqueantes (P-13, P-14). Falta el mockup de «Seguridad» para pasar a `Aclarada` | Spec de Fase 1; el dueño respondió las preguntas antes de redactar | Adrián |
| 2026-09-26 | P-13 → D-15 (recuperación de cuenta no verificada: enlace de verificación nuevo) y P-14 → 10 s confirmados; CA-18, §6 y §13 al día. §11: mockup de «Seguridad» en `mockups/identity/seguridad/` (13 estados, capturas a 360 y 1440) y singular de «Cerramos {n} sesiones». Sin preguntas abiertas; sigue en `Borrador` hasta que el dueño apruebe las decisiones de UX del mockup | Respuestas del dueño y mockup de «Seguridad» | Adrián |
| 2026-09-26 | **Aclarada.** El dueño aprueba las decisiones de UX del mockup de «Seguridad» (D-16) con un cambio: cerrar la sesión actual desde la lista pide confirmación (D-8, CA-14, estado `confirmar-cierre-actual`). D-7 incluye la confirmación de la contraseña nueva (estado `contrasena-no-coincide`). El bloqueo del cambio de contraseña tiene código propio, `IDENTITY_PASSWORD_CHANGE_LOCKED`, con los minutos que faltan, y cae en el intento siguiente al quinto fallo, igual que CA-5 (D-7, CA-23). §11 fija los textos aprobados | Revisión del mockup por el dueño | Adrián |
| 2026-09-26 | D-14 alineada con ADR-0010 (aceptado): `realtime` y el guard usan el puerto de `shared` y la raíz de composición enlaza la implementación de `identity` | Aceptación de ADR-0010 | Adrián |
| 2026-09-29 | D-15: la recuperación de una cuenta no verificada deja de consultar y de gastar el límite de 001 (D-8); solo la acota el límite de recuperación, previo a la búsqueda (SEC-1). CA-20: el enlace vence a la hora, «con 1 hora o más», como ya hace el código (SEC-4) | Auditoría de seguridad T-67, SEC-1 | — (orquestador; pendiente de Adrián en el PR) |
| 2026-10-04 | Q-3 resuelta: «Cerrar sesión» desde el menú de la cuenta también pide confirmación, como en el mockup del layout; CA-14 cubre los dos lugares (PD-28) | Decisión del dueño | Adrián |
