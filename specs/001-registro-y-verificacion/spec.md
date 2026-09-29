# Spec 001 — Registro de cuenta de cliente y verificación de correo

| Campo | Valor |
|---|---|
| Estado | Planificada (2026-09-27, Adrián) |
| Dueño | Adrián (1) |
| Fase | 1 |
| Requisitos | RF-01, RNF-04 (principales); aplican también RNF-07 (parcial: límite de tasa del registro y del reenvío), RNF-13, RNF-14, RNF-17 |
| Depende de | 000 (bloques 1 y 2 en `main`); 000b para la interfaz con Cielo Sereno; **006a** (consume el evento de cuenta verificada, D-4, y expone por API el catálogo de planes que muestra el registro); 002 para las pruebas de CA-16, CA-26 y CA-29 (ver §13) |
| Módulo | M1 `identity` (+ `notifications` como implementador de `IMailer`) |
| DF | DF-13 decidido por D-1 · DF-35 decidido por D-2 · DF-33 (solo `usuario`) decidido por D-3. Los tres ya están `Aceptado` en `design-findings.md` (PD-09, 2026-09-27); falta redibujar el E-R y las clases M1 (PD-06) |
| Última actualización | 2026-09-28 |

## 1. Contexto y problema

Nimbo todavía no tiene cuentas. Sin registro nadie puede guardar, compartir, editar ni consultar archivos, y todas
las specs de la Fase 1 que siguen (sesiones, roles, auditoría, carga) necesitan un usuario real sobre el cual actuar.
El registro es además la primera puerta de ataque: si revela qué correos existen, si guarda contraseñas o enlaces de
forma recuperable, o si deja que cualquiera use el correo de otra persona, el resto de la privacidad por diseño
(Art. IX) ya nace comprometida. RF-01 pide que el correo se valide con un enlace con vigencia y RNF-04 pide un hash
resistente a hardware y todo sobre TLS. Esta spec entrega el alta de clientes con esas garantías.

## 2. Objetivo

Una persona sin cuenta ve los planes, elige uno, se registra con su nombre, su correo y una contraseña, y acepta los
términos y la política de privacidad. Después abre el enlace de verificación que recibe por correo, válido por 24
horas, y queda con una cuenta de **Cliente** verificada que nace en el plan gratuito (Personal) y con la sesión
iniciada en ese dispositivo. Nadie puede saber por esta vía si un correo ya está registrado, y ni la contraseña ni el
enlace se pueden recuperar desde la base de datos ni desde las bitácoras.

## 3. Actores

- **Visitante** (sin cuenta, anónimo): consulta los planes, se registra, abre el enlace de verificación y pide reenvíos.
- **Cliente no verificado**: tiene una cuenta creada pero todavía no confirma su correo.
- **Sistema** (trabajo de correo en el `worker`): envía los correos y reintenta si el servidor de correo falla.
- **Administrador / Soporte / Operador**: **no participan** en este flujo. El registro solo crea cuentas de Cliente;
  las cuentas internas se crean por otra vía (011, según la 003 D-3). Si una persona con cuenta interna intenta registrarse con el
  mismo correo, recibe la misma respuesta neutra que cualquier correo existente (CA-2) y su cuenta interna no cambia.
  Ningún rol interno puede ver el enlace ni la contraseña, porque ambos se guardan solo como hash (CA-17, CA-19).

## 4. Historias de usuario

- **HU-1** Como visitante, quiero ver los planes, elegir uno y crear mi cuenta con mi correo y una contraseña, para
  empezar a usar Nimbo.
- **HU-2** Como visitante, quiero confirmar que el correo es mío abriendo un enlace, para que nadie use mi correo en
  mi nombre y para poder recuperar mi cuenta después.
- **HU-3** Como cliente no verificado, quiero pedir un enlace nuevo si el anterior venció o no llegó, o corregir mi
  correo si lo escribí mal, sin quedar bloqueado.
- **HU-4** Como dueño de un correo, quiero que nadie pueda averiguar con el registro si tengo cuenta en Nimbo, ni
  apropiarse de mi correo registrándolo antes que yo.
- **HU-5** Como operador, quiero bitácoras de registro y verificación con `correlationId` y sin datos sensibles, para
  diagnosticar fallos de correo sin exponer a los usuarios.

## 5. Restricciones y decisiones

### 5.1 Restricciones ya fijadas

Vienen de la constitución, los diagramas o specs anteriores. Cambiarlas requiere ADR o acuerdo del equipo.

| # | Restricción | Fuente |
|---|---|---|
| R-1 | Contraseñas con **Argon2id**. | RNF-04, Art. IX, diagrama M1 (`IPasswordHasher` → `Argon2idHasher`) |
| R-2 | Tokens de verificación guardados **solo como hash**; el token en claro solo existe en el enlace enviado. | Art. IX.6, E-R (`token_cuenta.token_hash`), diagrama M1 (`VerificationToken.tokenHash`) |
| R-3 | El token de verificación es de **un solo uso** y tiene **fecha de vencimiento**. | RF-01, E-R (`token_cuenta.expira_en`, `usado_en`), `VerificationToken.consume()`/`isValid()` |
| R-4 | El correo sale por el puerto `IMailer`, que implementa el módulo `notifications`. `identity` no conoce SMTP. | `architecture.md` §3 y §5, DF-34 |
| R-5 | En local el correo se entrega a **Mailpit** (`http://localhost:8025`). | Spec 000 §14 (resuelta) |
| R-6 | Bitácoras sin contraseñas, tokens, contenido ni nombres de archivo; con `correlationId` en cada línea, incluido el trabajo de correo en el `worker`. | RNF-17, spec 000 CA-13/14/15 |
| R-7 | Errores al cliente con la forma `{ code, message, correlationId }`, `code` con prefijo de módulo y mensaje en español con acción correctiva. | Spec 000 RN-1, `conventions.md` |
| R-8 | Identificadores `uuid`; fechas `timestamptz`; migración con `down` funcional. | `design-model.md` §5, RNF-10 |
| R-9 | La cola `mail` reintenta **5** veces y es idempotente. | `architecture.md` §8 |
| R-10 | `ThrottlerModule` lo introduce **esta spec**, que lo usa primero para el límite por IP (D-15), y la 002 lo reutiliza. El ADR menor de `@nestjs/throttler` se redacta en el plan. | Spec 000 D-9, 002 D-11 |
| R-11 | Todo en español, usable desde 360 px, contraste AA; tokens de Cielo Sereno, sin colores a mano. Límites y precios de planes vienen de la API, nunca escritos en el frontend. | RNF-13, Art. XIII, `ui-guidelines.md` §4 y §6 |

### 5.2 Decisiones del dueño

Todas las tomó Adrián. La numeración D-n sigue a la pregunta P-n que resuelve. Las marcadas **(revisada)** se
reescribieron después de revisar los mockups (2026-09-22) o al volver al enlace (2026-09-23); el registro de cambios
(§16) deja constancia de cada revisión.

| # | Decisión | Pregunta | Fecha · Decide |
|---|---|---|---|
| D-1 | El rol se guarda en la columna `usuario.rol` con `CHECK` sobre `CLIENT`, `ADMIN`, `SUPPORT` y `OPERATOR`. **Se elimina la tabla `rol`** del E-R. **Resuelve DF-13**. | P-1 | 2026-09-22 · Adrián |
| D-2 | Se quita `ClientUser.subscriptionId`. La única relación entre cuenta y suscripción es `suscripcion.usuario_id` y la suscripción vigente se consulta en `billing`. **Resuelve DF-35**. | P-2 | 2026-09-22 · Adrián |
| D-3 | Parte `usuario` de DF-33: (a) `correo_verificado boolean not null default false`; (b) `codigo_empleado` se agrega en la migración de la spec que crea cuentas internas (011, según la 003 D-3), aunque el E-R lo muestra desde ya; (c) `usuario.estado` solo toma `activa`/`suspendida`, y la verificación vive únicamente en `correo_verificado`. **Resuelve la parte `usuario` de DF-33**; el resto de DF-33 (almacenamiento) sigue abierto para 005–007. | P-3 | 2026-09-22 · Adrián |
| D-4 | **(revisada)** El registro **muestra los planes del catálogo y el visitante elige uno**. Los planes y sus precios se leen por API del catálogo de **006a**, nunca escritos en la pantalla. Sin importar lo que elija, la cuenta **siempre nace en el plan gratuito (Personal)**: al verificar, `identity` publica un evento de cuenta de cliente verificada que solo lleva el `id`, y `billing` (006a) lo consume y crea la suscripción Personal. El registro nunca asigna un plan de pago. Si el visitante eligió un plan de pago, al terminar la verificación se le lleva a contratarlo (**009**, Fase 2); en Fase 1 aplica D-24. **Dependencias: 006a consume el evento y expone el catálogo.** | P-4 | 2026-09-22 · Adrián |
| D-5 | El registro pide nombre completo (1 a 100 caracteres), correo, contraseña y la aceptación de D-14. | P-5 | 2026-09-22 · Adrián |
| D-6 | Política de contraseña: **mínimo 12 y máximo 128 caracteres, al menos una mayúscula, un número y un símbolo**, con requisitos en vivo en el formulario. Se rechazan las contraseñas comunes (lista local) y las iguales al correo o a su parte local. «Mayúscula» incluye letras acentuadas (`Á`); «símbolo» es cualquier carácter que no sea letra ni dígito, sin contar el espacio. La misma política aplica al restablecer en 002. | P-6 | 2026-09-22 · Adrián (confirmada completa 2026-09-23) |
| D-7 | **(revisada)** El **enlace** de verificación vale **24 horas** desde que se emite. | P-7, P-23 | 2026-09-23 · Adrián |
| D-8 | **(ampliada)** Límites: **60 s** entre dos solicitudes de registro o reenvío para un mismo correo; **5** solicitudes por correo y por hora; **10** solicitudes de registro por IP y por hora, y **10** solicitudes de reenvío por IP y por hora, con contadores separados. Los límites por correo se aplican igual exista o no la cuenta. | P-8 | 2026-09-22 · Adrián (reenvío por IP: 2026-09-28, SEC-1) |
| D-9 | Una cuenta no verificada **no** inicia sesión. Si la contraseña es correcta, se responde `IDENTITY_EMAIL_NOT_VERIFIED` con la opción de pedir un enlace nuevo. Si es incorrecta, se da la respuesta genérica de 002. Antes de verificar no hay sesión en ninguna pantalla. | P-9 | 2026-09-22 · Adrián |
| D-10 | **(revisada, solo redacción)** Si se registra un correo que pertenece a una cuenta no verificada: respuesta neutra, se reemplazan el nombre, la contraseña y la aceptación de D-14 por los nuevos, se invalidan los **enlaces** anteriores y se envía uno nuevo, dentro de los límites de D-8. | P-10 | 2026-09-23 · Adrián |
| D-11 | `identity` envía el correo a través de `IMailer`. `notifications` lo implementa con `SmtpMailer` sobre **nodemailer**, con envío por la cola `mail` del `worker`. El **ADR menor** se redacta en `/plan`. | P-11 | 2026-09-22 · Adrián |
| D-12 | Staging envía correo real por **SMTP de Resend** (el protocolo SMTP, **no** su SDK), con el dominio `nimbo.me` verificado (SPF y DKIM). La decisión queda fijada ahora, pero la configuración se hace **al montar staging (inicio de Fase 2)**. **Nota:** verificar la cuota vigente del plan gratuito de Resend al configurarlo; esta spec no afirma sus límites. En local sigue Mailpit (R-5). | P-12 | 2026-09-22 · Adrián |
| D-13 | **(revisada)** Las pantallas tienen mockup (`/mockup`). Existen `registro.html` (default), `registro--exito.html` («Revisa tu correo»; hoy con casillas de código que se quitan, §11) y `verificar-correo--exito.html` («Correo verificado»), con capturas a 360 y 1440 px. Los demás estados, las dos páginas estáticas y las plantillas de correo se producen con `/mockup` (§11). | P-13 | 2026-09-23 · Adrián |
| D-14 | **(revisada)** El formulario tiene una **casilla obligatoria** «Acepto los [Términos] y la [Política de privacidad]», con un enlace a cada una de dos **páginas estáticas**. El servidor guarda la **fecha y la versión** aceptadas. Queda rastro en `product-context.md` §5. | P-14 | 2026-09-22 · Adrián |
| D-15 | El límite **por correo** usa el puerto `IRateLimiter` → `RedisRateLimiter`, que declara e implementa `shared` (`identity` no puede depender de `sharing`, ADR-0010). El límite **por IP** usa el `ThrottlerModule`, que entra con esta spec (002 D-11, 000 D-9). | P-15 | 2026-09-22 · Adrián (límite por IP confirmado con 002 D-11, 2026-09-26) |
| D-16 | El correo se normaliza recortando espacios y pasándolo a minúsculas, y la unicidad se comprueba sobre el valor normalizado. No hay reglas por proveedor: los puntos y la `+etiqueta` se respetan. | P-16 | 2026-09-22 · Adrián |
| D-17 | Cuando alguien intenta registrar un correo ya verificado (o de una cuenta interna), su dueño recibe un aviso de intento de registro. El aviso se limita por **número de intentos de registro sobre ese correo**: `MAX_AVISOS_INTENTO_24H = 1` (confirmado) para que no sirva para inundar el buzón. | P-17 | 2026-09-22 · Adrián |
| D-18 | El correo **no** aparece en las bitácoras: la cuenta se identifica solo por su `id`, y `email` y `correo` se agregan a `REDACTED_FIELDS` de `shared`. | P-18 | 2026-09-22 · Adrián |
| D-19 | **(revisada)** «Enlace firmado» (RF-01) significa «no falsificable»: un **token opaco** aleatorio (al menos 128 bits de entropía), de **un solo uso**, guardado **solo como hash** en `token_cuenta`. Se busca por su hash y cualquier comparación de secretos se hace en tiempo constante. Un enlace nuevo para la misma cuenta invalida los anteriores. | P-19, P-23 | 2026-09-23 · Adrián |
| D-20 | **(revisada)** Verificar **inicia sesión**: al abrir un enlace válido, ese dispositivo queda con sesión y la pantalla final ofrece «Ir a Mis archivos», como el mockup. Por eso el enlace funciona como una **credencial de un solo uso válida por 24 h**; la mitigación está en D-19 (un solo uso, hash, invalidación al reemplazarse) y en CA-29. La sesión es de 002, así que la regla se fija aquí y **su prueba se escribe en 002** (mismo patrón que CA-16). Mientras 002 no exista, el botón lleva a iniciar sesión. | P-20 | 2026-09-22 · Adrián (reafirmada con enlace 2026-09-23) |
| D-21 | 001 no elimina las cuentas que nunca se verifican. Si llegan a crecer, se revisa en 011/022. | P-21 | 2026-09-22 · Adrián |
| D-22 | El planner propone en el plan textos breves para **las dos páginas** (Términos y Política de privacidad) y el dueño los revisa. | P-22 | 2026-09-22 · Adrián |
| D-23 | **Revertida el 2026-09-23 por P-23 → A.** La verificación es por **enlace**, como dicen la propuesta (RF-01) y `product-context.md` §5 (D-7, D-19). La versión anterior (código de 6 dígitos con tope de intentos y HMAC) queda descrita en el registro de cambios del 2026-09-22. | P-23 | 2026-09-23 · Adrián |
| D-24 | En Fase 1, mientras 009 no existe, se **permite elegir un plan de pago**. La cuenta queda en Personal y la pantalla final dice que puede activarlo desde «Plan y facturación» cuando esté disponible. La elección **solo vive en el navegador** y no se guarda en el servidor. Si el enlace se abre en **otro dispositivo**, la elección se pierde y la cuenta queda en Personal **sin mensaje**. Es aceptable en Fase 1; lo retoma 009. | P-24 | 2026-09-23 · Adrián |

## 6. Parámetros

| Parámetro | Significado | Valor | Origen |
|---|---|---|---|
| Vigencia del enlace | Validez del enlace de verificación desde su emisión | 24 h | D-7 |
| Longitud del nombre | Longitud permitida del nombre completo | 1 a 100 caracteres | D-5 |
| Contraseña | Longitud y composición | 12 a 128 caracteres; ≥ 1 mayúscula, ≥ 1 número, ≥ 1 símbolo; no común; distinta del correo | D-6 |
| Espera entre solicitudes | Tiempo mínimo entre dos solicitudes de registro o reenvío para un mismo correo | 60 s | D-8 |
| Solicitudes por correo | Solicitudes de registro o reenvío por correo y por hora | 5 | D-8 |
| Registros por IP | Solicitudes de registro por dirección IP y por hora | 10 | D-8 |
| Reenvíos por IP | Solicitudes de reenvío por dirección IP y por hora, contadas aparte de las de registro | 10 | D-8 |
| `MAX_AVISOS_INTENTO_24H` | Intentos de registro sobre un correo ya verificado que generan aviso a su dueño en 24 h | 1 | D-17 |

## 7. Criterios de aceptación

> Formato Dado/Cuando/Entonces. Cada criterio es verificable por una prueba automatizada o por un procedimiento
> reproducible (los marcados «manual» dejan evidencia en `verification.md`). Los códigos de error son la propuesta
> de esta spec; el `status` HTTP de cada uno lo fija el plan según las clases de `DomainError` de `shared`.
> «Respuesta neutra» = mismo `status`, mismo cuerpo y mismas cabeceras (salvo `x-correlation-id`) en todos los casos
> que la usan. CA-24 y CA-25 se eliminaron el 2026-09-23 (eran del código); los números no se reutilizan.

### Registro (HU-1, HU-4)

- **CA-1** (HU-1, RF-01, RNF-04, D-4, D-14) — registro válido
  - **Dado** un correo que no pertenece a ninguna cuenta, un nombre de 1 a 100 caracteres, una contraseña que cumple
    D-6, la casilla de términos marcada y cualquier plan elegido en la pantalla,
  - **Cuando** el visitante envía el formulario de registro,
  - **Entonces** la API responde `202` con la respuesta neutra de registro, y existe exactamente una cuenta nueva con:
    - rol **Cliente**, correo normalizado (D-16), `correo_verificado = false` y `estado = activa`;
    - **ninguna** suscripción (D-4);
    - contraseña guardada con Argon2id (CA-19);
    - la fecha de aceptación y la **versión vigente** de Términos y Política de privacidad (la que publica el servidor,
      no la que diga el navegador);
    - un token de verificación vigente que vence 24 h después de emitido (reloj controlado con `FixedClock`).
  - **Y** en Mailpit hay **un** correo para esa dirección, en español, con un enlace `https://` (en staging) o
    `http://localhost` (en local) a la página de verificación de `web`, que indica la vigencia de 24 horas, advierte
    que el enlace abre la sesión y no debe reenviarse, dice qué hacer si la persona no pidió el registro, y **no**
    contiene la contraseña.

- **CA-2** (HU-4, RF-01, D-17) — correo ya registrado y verificado, sin enumeración
  - **Dado** una cuenta verificada con el correo `ana@ejemplo.com` (o una cuenta interna con ese correo),
  - **Cuando** alguien envía el registro con ese correo y datos válidos,
  - **Entonces** recibe la **misma** respuesta neutra que en CA-1 y la pantalla pasa igual a «Revisa tu correo»; no se
    crea ninguna cuenta; el nombre, la contraseña, la aceptación y el estado de la cuenta existente no cambian; no se
    envía enlace de verificación; y el dueño recibe **un** aviso de intento de registro que no incluye datos de quien
    lo intentó más allá de la fecha y que le sugiere iniciar sesión o recuperar la contraseña si fue él.
  - **Y cuando** se repite el intento dentro de las 24 h, la respuesta sigue siendo la neutra (o el `429` uniforme
    de CA-15), pero no llegan más avisos (`MAX_AVISOS_INTENTO_24H = 1`).

- **CA-3** (HU-4, RF-01, D-16) — variantes del mismo correo
  - **Dado** una cuenta con `ana@ejemplo.com`,
  - **Cuando** se registra `  Ana@Ejemplo.COM ` (mayúsculas y espacios),
  - **Entonces** se trata como el mismo correo (comportamiento de CA-2 o CA-4 según el estado de la cuenta) y la base
    de datos rechaza una segunda cuenta aunque dos peticiones lleguen a la vez.
  - **Y** `ana.b@ejemplo.com` y `ana+nimbo@ejemplo.com` son correos **distintos** de `ana@ejemplo.com` (sin reglas por proveedor).

- **CA-4** (HU-4, RF-01, D-10) — correo registrado pero no verificado
  - **Dado** una cuenta **no verificada** con `ana@ejemplo.com`, nombre «Ana Uno», contraseña X y un enlace vigente
    enviado hace más de 60 s,
  - **Cuando** alguien envía de nuevo el registro con ese correo, nombre «Ana Dos» y contraseña Y,
  - **Entonces** recibe la misma respuesta neutra de CA-1; no se crea una segunda cuenta; la cuenta pasa a tener nombre
    «Ana Dos», contraseña Y (X deja de verificar contra el hash) y la nueva fecha de aceptación; el enlace anterior
    responde como en CA-11 (a); y en Mailpit llega un enlace nuevo con vigencia de 24 h. Si no han pasado 60 s, aplica
    CA-15 y la cuenta no cambia.

- **CA-5** (HU-1, RF-01, RNF-04, D-6) — contraseña débil
  - **Dado** un correo nuevo y una contraseña que incumple D-6, un caso por regla (menos de 12 caracteres, más de 128,
    sin mayúscula, sin número, sin símbolo, presente en la lista de contraseñas comunes, igual al correo o a su parte local),
  - **Cuando** se envía el registro,
  - **Entonces** se responde `IDENTITY_WEAK_PASSWORD` con un mensaje que nombra cada regla incumplida y cómo corregirla;
    no se crea cuenta ni token y no se envía correo.
  - **Y** si el correo ya pertenece a una cuenta, la respuesta es **idéntica** (la validación ocurre antes de consultar
    si el correo existe, así el error no revela la existencia de la cuenta).
  - **Y** `Nimbo-Seguro-2026` (17 caracteres, con mayúscula, número y símbolo, no común) es aceptada; `Ñandú-Azul-2026`
    también, porque `Ñ` cuenta como mayúscula; y una contraseña cuyo único carácter especial es un espacio se rechaza
    por falta de símbolo.

- **CA-6** (HU-1, RF-01, D-14) — datos inválidos
  - **Dado** un registro con correo mal formado, nombre vacío o de más de 100 caracteres, la casilla de términos **sin**
    marcar, un campo obligatorio ausente, o un cuerpo que no es JSON (un
    `Content-Type` que no es JSON; un cuerpo JSON **mal formado** lo rechaza antes el analizador con el
    `400 VALIDATION_FAILED` genérico de la spec 000),
  - **Cuando** se envía,
  - **Entonces** se responde `IDENTITY_INVALID_INPUT` indicando **cada** campo inválido y el motivo en español (para la
    casilla: «Para crear tu cuenta, acepta los Términos y la Política de privacidad.»), sin crear cuenta ni token ni
    enviar correo. Igual que en CA-5, la respuesta no depende de si el correo existe.

- **CA-7** (HU-1, RF-05 como restricción, Art. IX.5, D-4, D-24) — el registro solo crea Clientes en el plan gratuito
  - **Dado** una petición de registro que además incluye campos como `rol: "ADMIN"`, `role`, `correoVerificado: true`,
    `estado`, `version` de términos, `plan` o `planId`,
  - **Cuando** se envía (con o sin un token de sesión de cualquier rol en la cabecera),
  - **Entonces** o se rechaza con `IDENTITY_INVALID_INPUT` o esos campos se ignoran (lo fija el plan), y en ningún caso:
    - se crea una cuenta con rol distinto de Cliente, ya verificada, con un plan de pago o con una versión de términos
      distinta de la vigente;
    - se modifica la cuenta del que envía el token;
    - el servidor guarda el plan elegido (D-24).

### Verificación por enlace (HU-2)

- **CA-8** (HU-2, RF-01, D-4, D-20) — verificación exitosa
  - **Dado** una cuenta no verificada y el enlace más reciente enviado, dentro de las 24 h,
  - **Cuando** el visitante abre el enlace y la página de verificación lo confirma con la API,
  - **Entonces** `correo_verificado = true`; ese token queda marcado como usado (`usado_en`); cualquier otro token de
    verificación de esa cuenta deja de servir; se publica **una vez** el evento de cuenta de cliente verificada, que
    lleva solo el `id` (sin correo ni nombre); y la página muestra el estado **exito** («Correo verificado») con la
    acción «Ir a Mis archivos» (mientras 002 no exista, «Iniciar sesión»; la sesión se prueba en CA-26).
  - **Y** (verificado en 006a) al consumir el evento, `billing` crea para esa cuenta una suscripción del plan
    **Personal**, cualquiera que haya sido el plan elegido.

- **CA-9** (HU-2, HU-3, RF-01, D-7) — enlace expirado
  - **Dado** un enlace emitido hace más de 24 h (reloj avanzado con `FixedClock`) de una cuenta no verificada,
  - **Cuando** se abre,
  - **Entonces** se responde `IDENTITY_VERIFICATION_LINK_EXPIRED`; la cuenta sigue no verificada; no se publica el
    evento ni se crea sesión; y la página muestra el estado **enlace-expirado** con la acción «Pedir un enlace nuevo»,
    que lleva a **pedir-enlace** (CA-13).

- **CA-10** (HU-2, RF-01, D-20) — enlace ya usado
  - **Dado** un enlace que ya verificó la cuenta (o un enlace anterior de una cuenta que ya se verificó con otro),
  - **Cuando** se abre de nuevo,
  - **Entonces** la cuenta no cambia; el evento **no** se publica otra vez; **no** se crea sesión (CA-29); y la página
    muestra **ya-verificado** («Tu correo ya está verificado. Inicia sesión.»), sin error rojo. Repetirlo N veces deja
    el mismo estado.

- **CA-11** (HU-2, RF-01) — enlace reemplazado o inválido
  - **Dado** (a) un enlace anterior de una cuenta **no verificada** a la que después se le envió uno nuevo, o (b) un
    token inexistente, alterado en un carácter, vacío o con formato incorrecto,
  - **Cuando** se abre,
  - **Entonces** se responde `IDENTITY_VERIFICATION_LINK_INVALID` con la acción «Usa el enlace del correo más reciente
    o pide uno nuevo»; ninguna cuenta cambia; no se crea sesión; la respuesta no incluye el correo ni ningún dato de la
    cuenta; y la página muestra el estado **enlace-invalido**.

- **CA-12** (HU-2, RF-01, Art. IX.6) — el enlace solo verifica
  - **Dado** un token de verificación válido,
  - **Cuando** se usa en cualquier otra operación (p. ej. como credencial en una petición a la API o, cuando exista,
    para restablecer la contraseña en 002),
  - **Entonces** es rechazado. Un token de verificación solo sirve para verificar el correo de su propia cuenta
    mediante la operación de verificación.

### Reenvío y cambio de correo (HU-3)

- **CA-13** (HU-3, RF-01, D-8) — reenvío válido
  - **Dado** una cuenta no verificada sin solicitudes de registro o reenvío en los últimos 60 s,
  - **Cuando** el visitante pulsa «Reenviar enlace» en «Revisa tu correo», o escribe su correo en **pedir-enlace**,
  - **Entonces** recibe la respuesta neutra de reenvío; en Mailpit aparece un correo nuevo con un enlace de vigencia
    completa (24 h desde ahora); todos los enlaces anteriores de esa cuenta responden como en CA-11 (a); y «Reenviar
    enlace» vuelve a mostrar la cuenta regresiva de 60 s.

- **CA-14** (HU-3, HU-4, RF-01) — reenvío sin enumeración
  - **Dado** un correo que no existe, o que pertenece a una cuenta ya verificada, o a una cuenta interna,
  - **Cuando** se pide un reenvío para ese correo,
  - **Entonces** la respuesta es **idéntica** a la de CA-13 y no se envía ningún enlace de verificación.

- **CA-15** (HU-3, HU-4, RNF-07, D-8) — límites de reenvío y de registro
  - **Dado** un correo normalizado con una solicitud de registro o reenvío hace menos de 60 s, o con 5 solicitudes en
    la última hora, o una IP con 10 solicitudes de registro en la última hora, o una IP con 10 solicitudes de reenvío
    en la última hora (cada ruta con su propio contador por IP),
  - **Cuando** se pide otro reenvío o registro,
  - **Entonces** se responde `429` con `IDENTITY_TOO_MANY_REQUESTS`, cabecera `Retry-After` en segundos y el mensaje
    «Ya te enviamos un enlace hace poco. Revisa tu bandeja y la carpeta de spam, o inténtalo de nuevo en N minutos.»;
    no se envía correo ni se modifica ninguna cuenta.
  - **Y** los contadores por correo cuentan **solicitudes**, no correos enviados, y se aplican igual si el correo no
    existe, pertenece a una cuenta verificada, no verificada o interna. La secuencia de respuestas (`202`/`429`) para
    un mismo patrón de peticiones es idéntica en los cuatro casos. Al cumplirse el tiempo, la siguiente petición
    funciona como CA-13.

- **CA-27** (HU-3, D-10) — cambiar correo
  - **Dado** la pantalla «Revisa tu correo» después de registrar `ana@ejmplo.com` (mal escrito),
  - **Cuando** el visitante pulsa «Cambiar correo»,
  - **Entonces** vuelve al formulario de registro con el nombre y el plan elegido conservados, y con la contraseña
    vacía y la casilla desmarcada.
  - **Y** enviar con `ana@ejemplo.com` se comporta exactamente como un registro nuevo (CA-1 a CA-4). La cuenta
    pendiente de `ana@ejmplo.com` queda sin verificar (D-21) y no bloquea nada.

### Sesión, plan elegido y frontera con 002 / 009

- **CA-16** (HU-2, RF-01, D-9; se verifica junto con 002) — sin credenciales antes de verificar
  - **Dado** una cuenta no verificada con contraseña correcta,
  - **Cuando** intenta iniciar sesión (operación que construye la spec 002),
  - **Entonces** no recibe credenciales y se responde `IDENTITY_EMAIL_NOT_VERIFIED` con la acción «Verifica tu correo
    con el enlace que te enviamos; si venció, pide uno nuevo», que lleva a **pedir-enlace** con el correo ya escrito.
  - **Y** esto ocurre **solo** cuando la contraseña es correcta; con contraseña incorrecta la respuesta es la de
    credenciales inválidas de 002. Esta spec fija la regla (RN-6); la prueba automatizada se escribe en 002.

- **CA-26** (HU-2, RF-01, D-20; se verifica junto con 002) — verificar inicia sesión
  - **Dado** la spec 002 implementada,
  - **Cuando** el visitante abre un enlace válido (CA-8),
  - **Entonces** ese navegador recibe las credenciales de sesión de 002 y «Ir a Mis archivos» lo lleva directo a sus
    archivos. Esta spec fija la regla (RN-11); la prueba automatizada se escribe en 002 y se enlaza desde el
    `verification.md` de ambas. Mientras 002 no exista, verificar no entrega credenciales y el botón lleva a iniciar sesión.

- **CA-29** (HU-4, RF-01, D-19, D-20; se verifica junto con 002) — el enlace es una credencial de un solo uso
  - **Dado** la spec 002 implementada y un enlace de verificación,
  - **Cuando** se abre (a) por segunda vez, en el mismo dispositivo o en otro; (b) después de haber sido reemplazado
    por un enlace nuevo; (c) después de 24 h; o (d) en dos dispositivos casi a la vez,
  - **Entonces**:
    - en (a), (b) y (c) **no** se entrega ninguna sesión (se aplican CA-10, CA-11 y CA-9);
    - en (d) solo **una** de las dos aperturas entrega sesión y verifica; la otra recibe **ya-verificado** sin sesión
      (el consumo del token es atómico).
  - **Y** la sesión creada al verificar es una sesión normal de 002: aparece en la lista de sesiones del usuario (RF-04)
    y se puede revocar.

- **CA-28** (HU-1, D-4, D-24) — plan de pago elegido
  - **Dado** un visitante que eligió un plan de pago (Pro, Equipo o Institucional) en el registro,
  - **Cuando** abre el enlace en **el mismo navegador** donde se registró,
  - **Entonces** su cuenta queda en Personal (CA-8) y la pantalla final muestra, además de «Ir a Mis archivos»: «Tu
    cuenta empieza en el plan Personal. Podrás activar {plan elegido} desde Plan y facturación cuando esté disponible.»
  - **Y cuando** abre el enlace en **otro dispositivo**, la cuenta queda en Personal y la pantalla final **no** muestra
    ese mensaje. El servidor en ningún caso guarda la elección (D-24). Con 009 disponible, en lugar del mensaje se le
    lleva a contratarlo.

### Prohibiciones duras (HU-4, HU-5)

- **CA-17** (HU-4, RF-01, Art. IX.6, D-19) — el token solo existe como hash
  - **Dado** un registro completado y el token en claro extraído del correo en Mailpit,
  - **Cuando** se busca ese valor en todas las columnas de texto de `usuario` y `token_cuenta` y en las bitácoras de
    `api` y `worker` producidas durante el flujo,
  - **Entonces** no aparece en ningún lado; `token_cuenta.token_hash` es distinto del token; y dos registros generan
    tokens distintos e impredecibles (RN-4).

- **CA-18** (HU-5, RNF-17, D-18) — bitácoras sin datos sensibles
  - **Dado** los flujos de CA-1, CA-2, CA-4, CA-5, CA-8, CA-9, CA-10, CA-11, CA-13 y CA-15 ejecutados con el logger capturado,
  - **Cuando** se inspeccionan todas las líneas de `api` y `worker`,
  - **Entonces**:
    - ninguna contiene la contraseña, su hash, el token en claro o su hash, la URL completa del enlace, el nombre de la
      persona ni el correo;
    - un campo llamado `email` o `correo` sale como `[REDACTED]` (prueba unitaria de `REDACTED_FIELDS`);
    - cada línea lleva `correlationId`, y el trabajo de envío de correo en el `worker` lleva el **mismo**
      `correlationId` que la petición que lo originó;
    - hay eventos de bitácora identificables para registro aceptado, verificación exitosa, verificación rechazada (con
      motivo: expirado, inválido, ya usado), reenvío, aviso de intento y límite alcanzado, y todos identifican a la
      cuenta solo por su `id`.

- **CA-19** (HU-4, RNF-04) — Argon2id
  - **Dado** dos cuentas registradas con la **misma** contraseña,
  - **Cuando** se leen sus `hash_clave`,
  - **Entonces** ambos tienen formato PHC `$argon2id$v=19$m=…,t=…,p=…$…`, son distintos entre sí (sal aleatoria), sus
    parámetros son iguales o mayores que el mínimo de RN-3, y la verificación de la contraseña original contra cada hash
    es exitosa. Ninguna respuesta de la API incluye la contraseña ni el hash.

- **CA-20** (RNF-04, D-12) — todo sobre TLS (manual en staging, al montarlo al inicio de Fase 2)
  - **Dado** el ambiente de staging con el SMTP de Resend configurado,
  - **Cuando** se envía el registro por `http://` o se abre el enlace de verificación,
  - **Entonces** `http://` redirige a `https://` antes de procesar datos (cubierto por 000 CA-32); el enlace del correo
    usa siempre `https://staging.nimbo.me/…`; y el correo llega a un buzón real con SPF y DKIM válidos para `nimbo.me`
    (evidencia: cabeceras `Authentication-Results` del correo recibido).

### Degradación del correo (HU-5)

- **CA-21** (HU-1, HU-5, Art. XII, R-9, D-11) — el servidor de correo falla
  - **Dado** el servidor de correo detenido (Mailpit parado en la prueba),
  - **Cuando** se registra un correo nuevo,
  - **Entonces** la respuesta es la misma que en CA-1 y la cuenta queda creada; el envío se reintenta según R-9; si el
    servidor vuelve antes de agotar los reintentos, llega **un solo** correo (idempotencia); si se agotan, queda una
    bitácora de error con `correlationId` y el `id` de la cuenta, y el visitante puede pedir otro enlace (CA-13).

### Interfaz (HU-1, HU-2, HU-3)

- **CA-22** (HU-1, HU-3, RNF-13, RNF-14, D-4, D-6, D-14) — pantallas de registro y «Revisa tu correo»
  - **Dado** la pantalla de registro de `web` a 360 px y a 1440 px,
  - **Cuando** se recorre con teclado, con datos inválidos, con un error del servidor y con éxito,
  - **Entonces**:
    - muestra los estados de §11 según su mockup;
    - lista los planes con nombre y precio **leídos de la API del catálogo** (006a), sin valores escritos en el frontend,
      con Personal preseleccionado. Si el catálogo no responde, el registro sigue disponible con Personal y un aviso
      «No pudimos cargar los planes; tu cuenta empezará en Personal.»;
    - muestra los requisitos de D-6 en vivo, cada uno marcado como cumplido o pendiente con ícono y texto, no solo con color;
    - tiene la casilla obligatoria con enlaces separados a Términos y a Política de privacidad, que abren las páginas de CA-23;
    - valida en el cliente con las **mismas** reglas que la API (un solo esquema en `packages/contracts`);
    - muestra los errores de la API desde el catálogo por `code`, junto al campo que corresponde;
    - el botón indica progreso y no permite doble envío.
  - **Y** tras enviar, «Revisa tu correo» muestra:
    - el correo escrito y que el enlace vence en 24 horas;
    - «Reenviar enlace», habilitado tras 60 s con cuenta regresiva;
    - «Cambiar correo» (CA-27);
    - **ninguna** casilla de código;
    - una cabecera **sin** sesión (D-9).
  - **Y** axe no reporta violaciones `serious` ni `critical`.

- **CA-23** (HU-2, RNF-13, RNF-14, D-14, D-20, D-22) — página de verificación, pantalla final y páginas estáticas
  - **Dado** la página de verificación abierta desde el enlace, la pantalla «Correo verificado» y las páginas de
    Términos y de Política de privacidad, a 360 y 1440 px,
  - **Cuando** el token es válido, expirado, ya usado o inválido, y cuando se abren las páginas estáticas,
  - **Entonces**:
    - la página de verificación muestra **verificando** mientras espera y después **exito**, **enlace-expirado**,
      **ya-verificado** o **enlace-invalido**; desde los estados de error se llega a **pedir-enlace**;
    - «Correo verificado» ofrece «Ir a Mis archivos» (o «Iniciar sesión» sin 002) y, si corresponde, el mensaje de CA-28;
    - el token no queda en bitácoras de `web`, del proxy ni se envía a terceros (RN-8);
    - cada página estática está en español, es accesible sin sesión, muestra su **versión** y fecha de vigencia (la
      misma versión que se guarda en CA-1) y no carga recursos de terceros;
    - axe no reporta violaciones `serious` ni `critical`.

## 8. Reglas de negocio

- **RN-1** El registro público solo crea cuentas de rol **Cliente**. No existe forma de elegir rol, estado ni
  verificación desde el registro, y la cuenta siempre nace en el plan Personal (D-4).
- **RN-2** Un correo pertenece como máximo a una cuenta (de cliente o interna). Para compararlos se recortan espacios
  y se pasan a minúsculas, sin reglas por proveedor (D-16).
- **RN-3** Las contraseñas cumplen D-6 y se guardan con Argon2id con parámetros **iguales o mayores** que la
  recomendación mínima vigente de OWASP (Password Storage Cheat Sheet: `m = 19 MiB, t = 2, p = 1` o una combinación
  equivalente de la misma tabla). Los parámetros exactos los fija el plan midiendo el servidor de staging (§13).
- **RN-4** El token de verificación es aleatorio, generado con un generador criptográficamente seguro, con al menos
  128 bits de entropía. Se guarda solo su hash, vence a las 24 h y es de un solo uso, con consumo atómico. Al emitir
  uno nuevo para la misma cuenta, los anteriores dejan de servir (D-7, D-19).
- **RN-5** Registro, reenvío y verificación nunca revelan si un correo tiene cuenta, si está verificada o si es interna:
  las respuestas a terceros son neutras (CA-2, CA-4, CA-5, CA-6, CA-11, CA-14, CA-15).
- **RN-6** Una cuenta no verificada no obtiene credenciales de sesión (D-9).
- **RN-7** Un Cliente recibe plan solo al verificar su correo, y ese plan es siempre el gratuito (Personal). Lo crea
  `billing` al consumir el evento de cuenta verificada (D-4). Planes, precios y límites se leen del catálogo (tabla
  `plan`, spec 006a) y nunca se escriben en esta spec ni en el código de `identity` ni de `web`. En Fase 1 el plan
  elegido solo vive en el navegador (D-24).
- **RN-8** El token nunca aparece en bitácoras de ningún componente (`api`, `worker`, `web`, Traefik) ni se envía a
  terceros desde la página de verificación (sin recursos externos; `Referrer-Policy` de 000 CA-32).
- **RN-9** Los correos del flujo están en español, con tuteo, e incluyen qué hacer si la persona no pidió el registro.
  El correo de verificación advierte que el enlace abre la sesión y no debe reenviarse.
- **RN-10** El aviso de intento de registro (D-17) se envía como máximo una vez por correo en 24 h. Superarlo nunca
  cambia la respuesta al solicitante.
- **RN-11** Abrir un enlace de verificación válido inicia sesión en ese dispositivo, una sola vez por enlace (D-20, CA-29).
- **RN-12** El registro exige aceptar Términos y Política de privacidad. El servidor guarda la fecha y la versión
  vigente aceptadas. Una nueva versión de los textos no invalida las cuentas existentes (volver a pedir la aceptación
  queda fuera de alcance).

## 9. Requisitos no funcionales aplicables

| RNF | Cómo aplica aquí | Cómo se verifica |
|---|---|---|
| RNF-04 | Argon2id para contraseñas; hash del token del enlace, que además es una credencial de un solo uso (D-20); todo sobre TLS en staging | CA-17, CA-19, CA-20, CA-29 (revisión de `security-auditor`) |
| RNF-07 (parcial) | Límite de tasa en registro y reenvío (operaciones que envían correo) | CA-15 |
| RNF-10 | Migración de `usuario` y `token_cuenta` reversible | Job `migrations` de CI (000 CA-11) |
| RNF-13 | Registro, «Revisa tu correo», verificación, pantalla final y páginas estáticas a 360 px, español, AA | CA-22, CA-23 (axe + revisión del `ui-designer`) |
| RNF-14 | Progreso en el envío; errores con acción correctiva | CA-5, CA-6, CA-9, CA-11, CA-15, CA-22 |
| RNF-17 | `correlationId` en toda línea, también en el trabajo de correo; sin contraseñas, tokens ni correos | CA-17, CA-18, CA-21 |
| RNF-18 | Métricas de registro/verificación: aquí se **declaran** los eventos de bitácora; los contadores Prometheus llegan con 022 | CA-18 |

## 10. Seguridad y privacidad

- **¿Toca contenido de archivos?** No. Solo datos de cuenta: nombre, correo, hash de contraseña, estado, aceptación de
  términos y tokens.
- **Operaciones públicas sin `Actor`**: registro, verificación, reenvío y consulta del catálogo son anónimos, por eso
  no reciben `actor` (DF-01 aplica a servicios que actúan sobre datos de un usuario autenticado). No devuelven datos de
  ninguna cuenta.
- **El enlace como credencial (D-20)**: como abrir el enlace inicia sesión, quien tenga el enlace durante sus 24 h
  obtiene una sesión en el dispositivo donde lo abra. Esto incluye a quien reciba un correo reenviado o a un filtro de
  correo que abra enlaces automáticamente.
  - Mitigaciones: un solo uso con consumo atómico; solo el hash queda guardado; se invalida al reemplazarse (D-19,
    RN-4, CA-29).
  - El correo advierte que no se reenvíe (RN-9).
  - La sesión resultante es una sesión normal de 002: visible en la lista de sesiones y revocable, con aviso por
    dispositivo no reconocido (RF-04).
  - No se agrega un paso de confirmación en la página; ver riesgo en §13.
- **Enumeración de cuentas**: prohibida (RN-5). Incluye el orden de validación (CA-5, CA-6), los límites contados por
  solicitud y no por correo enviado (CA-15), y el tope silencioso de avisos (RN-10). Las diferencias de **tiempo** de
  respuesta entre correo nuevo y existente las revisa el `security-auditor` a mano, con una muestra de peticiones,
  porque una prueba automática de tiempos sería inestable en CI.
- **Pre-apropiación del correo**: D-10 y CA-4. Quien registra un correo ajeno pierde su contraseña cuando el dueño se
  registra, y la cuenta solo se activa desde el buzón del dueño.
- **Asignación masiva**: CA-7 (incluye plan y versión de términos).
- **Auditoría (RF-07)**: no aplica. RF-07 cubre acciones de roles internos sobre cuentas ajenas; aquí solo actúa el
  propio visitante. El módulo `audit` llega en 004.
- **Límite de tasa**: registro y reenvío, por correo y por IP (CA-15, D-8, D-15). La verificación no envía correo y su fuerza bruta es
  inviable por la entropía del token (RN-4); el plan puede limitarla también.
- **Nunca en bitácoras**: contraseña, hash de contraseña, token en claro o su hash, URL completa del enlace, nombre de
  la persona y correo (D-18: `email` y `correo` se agregan a `REDACTED_FIELDS` de `shared`, la única lista, 000 CA-15).
- **Secretos**: las credenciales SMTP de Resend (D-12) viven solo en GitHub Environments y en el `.env` del Droplet,
  nunca en `NEXT_PUBLIC_*` (000 CA-19). `.env.example` solo lleva los valores de Mailpit.
- **Roles internos**: no pueden crear, verificar ni reenviar por este flujo; no pueden leer tokens ni contraseñas
  porque no existen en claro. Que Soporte/Administrador vean si una cuenta está verificada es metadato de 011.
- **Privacidad**: la casilla y las páginas de Términos y Política de privacidad (D-14) informan qué datos se piden y
  para qué. Se guarda la fecha y la versión aceptadas como evidencia. El plan elegido no se guarda en el servidor (D-24).

## 11. Experiencia de usuario

> Rutas relativas a `docs/design/`. Estados marcados con * no están en el inventario de `ui-guidelines.md` §7; el
> `ui-designer` debe agregarlos allí (Art. XIII.3).

| Pantalla | Mockup | Capturas | Estados: existentes / pendientes (`/mockup`) | Estado del mockup |
|---|---|---|---|---|
| Registro | `mockups/identity/registro/registro.html` (propuesta p. 03; default: planes, formulario, requisitos de contraseña, casilla) | `capturas/identity/registro/registro--default--{360,1440}.png` | Existentes: default, enviando*, error-campos*, error-servidor*, catalogo-no-disponible* (`registro--<estado>.html`) | Borrador |
| Revisa tu correo | `mockups/identity/registro/registro--exito.html` (propuesta p. 04) | `capturas/identity/registro/registro--exito--{360,1440}.png` | Existentes: exito, limite-reenvio*, pedir-enlace* (formulario de correo para pedir un enlace nuevo; se llega desde enlace-expirado, enlace-invalido e inicio de sesión) | Borrador |
| Verificar correo (página del enlace) | `mockups/identity/verificar-correo/verificar-correo--verificando.html` (propuesta p. 05) | `capturas/identity/verificar-correo/verificar-correo--verificando--{360,1440}.png` | Existentes: verificando*, ya-verificado*, enlace-expirado, enlace-invalido* (`verificar-correo--<estado>.html`) | Borrador |
| Correo verificado | `mockups/identity/verificar-correo/verificar-correo--exito.html` (propuesta p. 06; con sesión, «Ir a Mis archivos») | `capturas/identity/verificar-correo/verificar-correo--exito--{360,1440}.png` | Existentes: exito, plan-de-pago-elegido* (D-24) | Borrador |
| Términos* (página estática, D-14) | `mockups/identity/terminos/terminos.html` (no presentado; borrador de textos, D-22) | `capturas/identity/terminos/terminos--default--{360,1440}.png` | Existente: default | Borrador |
| Política de privacidad* (página estática, D-14) | `mockups/identity/privacidad/privacidad.html` (no presentado; borrador de textos, D-22) | `capturas/identity/privacidad/privacidad--default--{360,1440}.png` | Existente: default | Borrador |
| Correo con enlace de verificación* | `mockups/identity/correos/correos--registro.html` (no presentado; izquierda) | `capturas/identity/correos/correos--registro--{360,1440}.png` | Existente: enlace nuevo | Borrador |
| Correo de aviso de intento de registro* (D-17) | `mockups/identity/correos/correos--registro.html` (no presentado; derecha) | (misma captura) | Existente: aviso | Borrador |

- **Ajustes ya hechos** (hojas del 2026-09-26): el registro pide 12 caracteres y dice «enlace»; «Revisa tu correo» no
  muestra sesión ni casillas de código y ofrece «Reenviar enlace» con cuenta regresiva y «Cambiar correo»; existen la
  página del enlace (verificando) y las dos plantillas de correo.
- **Ajustes del 2026-09-26** (ya no quedan ajustes obligatorios pendientes):
  1. `verificar-correo--plan-de-pago-elegido.html` sigue D-24: la tarjeta muestra el plan Personal, el aviso dice que
     el plan elegido se activa desde «Plan y facturación» cuando esté disponible y la única acción es «Ir a Mis
     archivos» (sin «Pago pendiente» ni «Completar pago»).
  2. Correo de verificación: dice «Abre el enlace para verificar tu correo y entrar a Nimbo», que el enlace vence en 24 h
     y solo funciona una vez, y advierte «No reenvíes este correo: quien abra el enlace entrará a tu cuenta» (D-20,
     RN-9). El dominio de ejemplo es `nimbo.me` (D-12).
- **Se conservan** del mockup:
  - el selector de plan (D-4), con nombres y precios leídos de la API; los valores escritos en el mockup (`Q0.00`,
    `Q450`…) son solo de referencia;
  - la casilla de aceptación, que ya tiene dos enlaces separados, «Términos» y «Política de privacidad» (D-14);
  - el botón «Ir a Mis archivos» de la pantalla final (D-20); mientras 002 no exista, el botón dice «Iniciar sesión»
    y lleva a la ruta reservada (decisión de Adrián del 2026-09-28, T-66);
  - «Cambiar correo» en «Revisa tu correo» (CA-27).
- Nota: los mockups usan colores escritos a mano (`#546983`, `#DDE6F0`…). Es aceptable en un mockup de referencia; la
  implementación usa solo tokens (R-11).
- Mensajes clave (español, tuteo, con acción correctiva):
  - Revisa tu correo: «Te enviamos un enlace a {correo} para verificar tu correo. Ábrelo en las próximas 24 horas. ¿No llegó? Revisa la carpeta de spam o pide otro enlace.»
  - Correo de verificación (cuerpo): «Abre este enlace para verificar tu correo y entrar a Nimbo: {enlace}. Vence en 24 horas y solo funciona una vez. No lo reenvíes: quien lo abra entrará a tu cuenta. Si no creaste una cuenta, ignora este mensaje.»
  - Requisitos de contraseña: «12 caracteres o más» · «Una mayúscula» · «Un número» · «Un símbolo». Cuando se
    cumplen, las reglas de contraseña común y de correo se rotulan en positivo: «No es una contraseña común» · «Es
    distinta de tu correo»; cuando no, muestran los dos mensajes siguientes.
  - Contraseña común: «Esta contraseña es muy común y fácil de adivinar.» (el mensaje de `IDENTITY_WEAK_PASSWORD` ya
    cierra con «Elige otra que los cumpla.»)
  - Contraseña igual al correo: «Tu contraseña no puede ser tu correo.»
  - Correo inválido: «Escribe un correo válido, por ejemplo nombre@dominio.com.»
  - Casilla: «Acepto los [Términos] y la [Política de privacidad].»
  - Casilla sin marcar: «Para crear tu cuenta, acepta los Términos y la Política de privacidad.»
  - Enlace expirado: «Este enlace venció. Pide uno nuevo y ábrelo en las próximas 24 horas.»
  - Enlace inválido: «Este enlace no es válido. Usa el enlace del correo más reciente o pide uno nuevo.»
  - Ya verificado: «Tu correo ya está verificado. Inicia sesión.»
  - Éxito: «¡Listo! Tu correo está verificado.» con «Ir a Mis archivos» (con 002; hasta entonces, «Iniciar sesión»).
  - Plan de pago elegido (mismo navegador): «Tu cuenta empieza en el plan Personal. Podrás activar {plan elegido} desde Plan y facturación cuando esté disponible.»
  - Límite: «Ya te enviamos un enlace hace poco. Revisa tu bandeja y la carpeta de spam, o inténtalo de nuevo en N minutos.»
  - Error inesperado: el genérico de 000 §10 con el `correlationId`.
- Mientras 002 no exista, «Ir a Mis archivos» e «Inicia sesión» llevan a la ruta reservada de inicio de sesión (§13).

## 12. Fuera de alcance

- Inicio de sesión, credenciales, refresh, sesiones, dispositivos, recuperación de contraseña: **002**. Las reglas
  RN-6 y RN-11 se fijan aquí y se implementan y prueban allá (CA-16, CA-26, CA-29).
- Roles internos, `RolesGuard`, construir el `Actor` desde el JWT, creación de cuentas internas y la columna
  `codigo_empleado` (D-3): **011** (003 D-3).
- Auditoría: **004**. Suspender/reactivar cuentas y ver su estado desde el backoffice: **011**.
- Tabla `plan`, `IPlanLimitsProvider`, la API de catálogo y la creación de la suscripción Personal al consumir el
  evento: **006a** (D-4). Contratar un plan de pago y retomar la elección hecha en el registro: **009**; cambiar de
  plan: **010**.
- Guardar en el servidor el plan elegido en el registro (D-24).
- `usuario.espacio_usado`: la agrega la spec que la usa (005/007, DF-38).
- Tabla `dispositivo` y huella del dispositivo: **002** (DF-11).
- Volver a pedir la aceptación cuando cambie la versión de Términos o de la Política de privacidad (RN-12).
- Verificación por código de 6 dígitos (D-23 revertida).
- Cambio de correo de una cuenta ya verificada, cambio de nombre, edición de perfil, eliminación de la cuenta: no
  piden RF; sin spec. («Cambiar correo» de CA-27 es solo volver al formulario antes de verificar.)
- Inicio de sesión con proveedores externos (Google, Microsoft), CAPTCHA, verificación por SMS: no pedidos por la propuesta.
- TOTP y cualquier segundo factor: fuera de alcance (`product-context.md` §9).
- Notificaciones dentro de la aplicación (tabla `notificacion`): solo se usa correo.
- Limpieza automática de cuentas que nunca se verifican (D-21).
- Configuración de Resend en staging: ocurre al montar staging al inicio de Fase 2 (D-12); en Fase 1 se demuestra con Mailpit.

## 13. Riesgos

| Riesgo | Impacto | Mitigación |
|---|---|---|
| **Plazo**: el Avance 1 (30/09/2026) exige 001 `Hecha`; quedan los ajustes de mockups de §11 y la dependencia con 006a | Entrega del 30 % incompleta | Producir con `/mockup` solo los ajustes y estados pendientes; backend y contratos pueden planificarse en paralelo |
| **El enlace es una credencial** (D-20): un correo reenviado, un buzón comprometido o un filtro de correo que abre enlaces obtiene sesión durante 24 h | Acceso a la cuenta recién creada por quien tenga el enlace; o el usuario ve «ya verificado» porque un filtro lo consumió antes y tiene que iniciar sesión | Un solo uso con consumo atómico, hash e invalidación al reemplazarse (D-19, CA-29); advertencia en el correo (RN-9); sesión visible y revocable con aviso por dispositivo no reconocido (002, RF-04). Si en pruebas con Gmail/Outlook se observa consumo automático del enlace, se propone al dueño un clic de confirmación en la página (cambio de spec) |
| **La interfaz depende de 006a** para listar planes y precios por API. El backlog describe 006a como tabla `plan` + `IPlanLimitsProvider`; el listado público de planes se parece más a 008 (catálogo y comparador, Fase 2) | Pantalla de registro sin planes, o 006a con más alcance | Agregar a 006a una lectura pública mínima de planes activos (nombre, precio, límites principales), o aceptar el estado catalogo-no-disponible (CA-22) hasta que exista. Lo decide el dueño de 006a con el `architect` en el plan |
| La elección de plan se pierde si el enlace se abre en otro dispositivo (D-24) | El visitante que eligió un plan de pago no ve el recordatorio | Aceptado en Fase 1; 009 lo retoma |
| La interfaz depende de 000b (tokens Cielo Sereno), que está `Pendiente` | Pantallas sin sistema de diseño o retrabajo | Backend y contratos primero; UI al final de las tareas; coordinar con Fátima |
| Entregabilidad del correo en staging con Resend (spam, SPF/DKIM de `nimbo.me`, cuota del plan gratuito no verificada) | El docente no recibe el enlace en la demo | Verificar la cuota vigente al configurar (D-12); SPF/DKIM desde el primer despliegue; cuenta de demo ya verificada como respaldo |
| Staging se monta al inicio de Fase 2: CA-20 y el correo real no se demuestran en el Avance 1 | Demo del registro solo en local | Demostrar con Mailpit en Fase 1; CA-20 queda como verificación pendiente hasta montar staging |
| Argon2id consume memoria por hash: con 25 usuarios concurrentes (RNF-02) y 4 GB en staging | Latencia o falta de memoria | El plan mide los parámetros en staging; RN-3 fija el piso, no el techo |
| Librería nativa de Argon2 en imágenes Docker (compilación, `musl` en alpine) | Build roto en CI o en el Droplet | El plan elige la librería con binarios precompilados para la imagen base y lo registra en ADR |
| 006a debe consumir el evento de D-4 | Cuentas verificadas sin plan hasta que 006a esté hecha | Anotar la dependencia en 006a; su prueba verifica la segunda parte de CA-8 |
| 002 aún no existe: CA-16, CA-26, CA-29 y «Ir a Mis archivos» dependen de ella | Demo de 001 sin sesión al verificar | Ruta reservada a iniciar sesión; CA-16, CA-26 y CA-29 se cierran con 002 |

## 14. Dependencias y documentos a actualizar

- **DF decididos por esta spec**: DF-13 (D-1), DF-35 (D-2) y la parte `usuario` de DF-33 (D-3). El `architect`
  actualiza en el mismo PR del plan:
  - estado en `design-findings.md` (hecho: los tres están `Aceptado` desde el 2026-09-27, PD-09);
  - `Diagramas_ER.pdf` (usuarios): sin tabla `rol`; `usuario.rol`, `correo_verificado`, `codigo_empleado` y aceptación
    de términos con fecha y versión;
  - `Diagramas_de_Clases.pdf` (M1): sin `subscriptionId`;
  - `design-model.md` §3 M1 y §4 (Art. VIII.6).
- **ADR** (se redactan en `/plan`): uno menor para nodemailer y el SMTP de Resend (D-11, D-12); uno menor para la
  librería de Argon2id. ADR-0010 (módulo `notifications` como implementador de `IMailer`) debe estar `Aceptado` antes del plan.
- **Specs relacionadas**:
  - 002: RN-6/CA-16 y RN-11/CA-26/CA-29 (sesión al verificar, visible y revocable); comparte `IPasswordHasher`,
    `IUserRepository`, `token_cuenta` para la recuperación, la política D-6 al restablecer y el
    `ThrottlerModule`, que entra con esta spec (D-15, 002 D-11).
  - **006a**: consume el evento de cuenta verificada y crea siempre la suscripción Personal (D-4); expone por API el
    catálogo público de planes que muestra el registro (riesgo en §13).
  - 009: lleva a contratar el plan de pago elegido (D-4) y retoma la elección, que en Fase 1 no se guarda (D-24).
  - 010: cambio de plan.
  - 000b: interfaz.
  - 000: D-9 ya dice que el `ThrottlerModule` entra con esta spec.
- **Documentos**:
  - `product-context.md` §5: línea de rastro de D-14, ya agregada. RF-01 no cambia: la verificación es por enlace.
  - `ui-guidelines.md` §7: estados nuevos y estado de los mockups; lo hace el `ui-designer`.
  - `.env.example`: variables SMTP con valores de Mailpit y URL pública de `web`.
  - `docs/operations/ambientes.md`: Resend en staging, al montarlo.
  - Manual de Usuario: sección «Registro», entregable del curso.

## 15. Preguntas

### Abiertas

No quedan preguntas abiertas, ni bloqueantes ni no bloqueantes. La spec sigue en `Borrador` porque faltan los
ajustes y estados de mockups de §11 (Art. XIII.1; compuerta de `Aclarada`, `workflow.md` §2).

### Resueltas

- [RESUELTA] P-1 → D-1: columna `usuario.rol` con `CHECK`; se elimina la tabla `rol`. Resuelve DF-13 (2026-09-22, Adrián)
- [RESUELTA] P-2 → D-2: se quita `subscriptionId`; solo FK en `suscripcion`. Resuelve DF-35 (2026-09-22, Adrián)
- [RESUELTA] P-3 → D-3: A + D + E (2026-09-22, Adrián)
- [RESUELTA] P-4 → D-4 (revisada): el registro muestra los planes y el visitante elige; la cuenta siempre nace en Personal; si eligió uno de pago, se le lleva a 009 (2026-09-22, Adrián)
- [RESUELTA] P-5 → D-5: A (2026-09-22, Adrián)
- [RESUELTA] P-6 → D-6: mínimo 12 con mayúscula, número y símbolo; máximo 128, lista de comunes y distinta del correo; precisiones de «mayúscula» y «símbolo» (2026-09-22, Adrián; confirmada completa 2026-09-23)
- [RESUELTA] P-7 → D-7 (revisada): enlace de 24 h (2026-09-23, Adrián)
- [RESUELTA] P-8 → D-8: A (2026-09-22, Adrián)
- [RESUELTA] P-9 → D-9: A (2026-09-22, Adrián)
- [RESUELTA] P-10 → D-10: A (2026-09-22, Adrián)
- [RESUELTA] P-11 → D-11: A; ADR menor en `/plan` (2026-09-22, Adrián)
- [RESUELTA] P-12 → D-12: A con SMTP de Resend y `nimbo.me` con SPF/DKIM; se configura al montar staging (2026-09-22, Adrián)
- [RESUELTA] P-13 → D-13 (revisada): A; mockups y capturas existentes con ajustes pendientes (2026-09-23, Adrián)
- [RESUELTA] P-14 → D-14 (revisada): A, casilla obligatoria con dos enlaces; se guardan fecha y versión (2026-09-22, Adrián)
- [RESUELTA] P-15 → D-15: B por correo + A por IP, a confirmar por `architect` (2026-09-22, Adrián)
- [RESUELTA] P-16 → D-16: A (2026-09-22, Adrián)
- [RESUELTA] P-17 → D-17: A con límite por intentos de registro; `MAX_AVISOS_INTENTO_24H = 1` (2026-09-22, Adrián)
- [RESUELTA] P-18 → D-18: A (2026-09-22, Adrián)
- [RESUELTA] P-19 → D-19 (revisada): token opaco de un solo uso guardado como hash (2026-09-23, Adrián)
- [RESUELTA] P-20 → D-20 (revisada): B, verificar inicia sesión; prueba en 002; reafirmada con enlace (2026-09-23, Adrián)
- [RESUELTA] P-21 → D-21: A (2026-09-22, Adrián)
- [RESUELTA] P-22 → D-22: A, textos de Términos y Política de privacidad propuestos en el plan (2026-09-22, Adrián)
- [RESUELTA] P-23 → A, enlace (2026-09-23, Adrián). Revierte la respuesta B del 2026-09-22; D-23 queda marcada como revertida
- [RESUELTA] P-24 → D-24: A; la elección vive en el navegador y se pierde si el enlace se abre en otro dispositivo (2026-09-23, Adrián)

## 16. Registro de cambios

| Fecha | Cambio | Motivo | Aprobó |
|---|---|---|---|
| 2026-09-22 | Creación de la spec (Borrador) con 23 criterios y 21 preguntas (14 bloqueantes) | Inicio de 001, Fase 1 | — |
| 2026-09-22 | Incorporadas las respuestas del dueño: decisiones D-1 a D-21 (sin D-6) en §5.2. DF-13, DF-35 y la parte `usuario` de DF-33 quedan decididos. Los valores decididos reemplazan a los parámetros en criterios y mensajes. Se agregan `MAX_AVISOS_INTENTO_24H` (recomendado 1) y RN-10. CA-15 precisa que los límites cuentan solicitudes y no correos enviados (sin enumeración). CA-2, CA-4, CA-7, CA-8, CA-10, CA-18, CA-20, CA-22 y CA-23 se ajustan a las decisiones. §11 se actualiza con los mockups existentes y lista los ajustes que exigen D-4, D-14 y D-20. Se agrega P-22 (texto del aviso de privacidad). Línea de rastro de D-14 en `product-context.md` §5. Sigue en Borrador: P-6 abierta y bloqueante, y faltan mockups de estados | Respuestas del dueño | Adrián |
| 2026-09-22 | §11: capturas reubicadas a la convención (`capturas/identity/<pantalla>/<pantalla>--<estado>--<360|1440>.png`); ajustes 5 y 6 del mockup `registro--exito.html` (código de 6 dígitos y sesión antes de verificar); pregunta bloqueante P-23 (enlace o código) | Revisión de los mockups del dueño | — (pendiente de Adrián) |
| 2026-09-22 | **Revisión de decisiones tras revisar los mockups.** Se reescribieron D-4 (el registro muestra los planes; la cuenta nace en Personal; plan de pago → 009), D-7 (10 min), D-10 (códigos en lugar de enlaces, solo redacción), D-13 (mockups y capturas existentes), D-14 (casilla obligatoria con dos enlaces; se guardan fecha y versión), D-19 (código guardado como HMAC) y D-20 (verificar inicia sesión; prueba en 002). Decisiones nuevas: D-6 (P-6: mínimo 12 con mayúscula, número y símbolo, más agregados compatibles), D-22 (textos de las dos páginas en el plan) y D-23 (P-23: código de 6 dígitos). `MAX_AVISOS_INTENTO_24H = 1` confirmado. Parámetros nuevos, propuestos y pendientes de confirmar: `MAX_INTENTOS_CODIGO = 5` y `MAX_FALLOS_VERIFICACION_HORA = 10`. Se reescriben CA-1, CA-2 y CA-4 a CA-23 para el código, los planes y la casilla. Se agregan CA-24 (tope por código), CA-25 (límite por correo), CA-26 (sesión al verificar, prueba en 002), CA-27 (cambiar correo) y CA-28 (plan de pago elegido). Se agregan RN-11 y RN-12, y se reescriben RN-4, RN-5, RN-7 y RN-8. §11 queda solo con los ajustes vigentes. Nueva P-24 (bloqueante). Riesgos nuevos: dependencia de la interfaz con 006a, fuerza bruta y redacción de RF-01 («enlace»). Se corrige la línea de D-14 en `product-context.md` §5. Sigue en Borrador | Revisión de mockups del dueño | Adrián |
| 2026-09-23 | **Vuelta al enlace (P-23 → A).** D-23 queda marcada como revertida (no se borra). Se reescriben D-7 (enlace de 24 h), D-19 (token opaco de un solo uso guardado como hash, comparación en tiempo constante), D-10 y D-13 (redacción) y D-20 (verificar inicia sesión al abrir el enlace, que funciona como credencial de un solo uso de 24 h). D-9 se ajusta a «pedir un enlace nuevo». D-6 queda confirmada completa: sin marca de agregados. Nueva D-24 (P-24 → A: la elección de plan vive en el navegador y se pierde si el enlace se abre en otro dispositivo). Desaparecen `MAX_INTENTOS_CODIGO` y `MAX_FALLOS_VERIFICACION_HORA`. Se eliminan CA-24 y CA-25, sin reutilizar sus números. Se reescriben CA-1, CA-2, CA-4, CA-5 (ejemplos de «mayúscula» y «símbolo»), CA-7 a CA-13, CA-15 a CA-18, CA-20 a CA-23 y CA-26 a CA-28 para el enlace. Nuevo CA-29 (el enlace es una credencial de un solo uso: sin segunda sesión, consumo atómico; prueba en 002). Se reescriben RN-4, RN-5, RN-7, RN-8, RN-9 y RN-11, y se agrega a §10 y §13 lo que implica el enlace como credencial. Se quitan de §13/§14 el riesgo de fuerza bruta del código y el pendiente de cambiar la redacción de RF-01: RF-01 y `product-context.md` no cambian. §11: el ajuste de `registro--exito.html` ahora es quitar las casillas de código; nueva pantalla «Verificar correo (página del enlace)» y estado pedir-enlace. Sin preguntas abiertas; sigue en Borrador por los mockups | Respuestas del dueño | Adrián |
| 2026-09-26 | §11: mockups nuevos de las hojas 01, 02, 02b, 02c y 02d (registro, «Revisa tu correo», página del enlace en estado verificando, correo verificado y las dos plantillas de correo) con sus capturas. Los ajustes 1–3 y 6 quedan hechos; quedan pendientes los estados que faltan, Términos y Privacidad, y el texto de advertencia del correo | Entrega de las hojas de mockups | Adrián |
| 2026-09-26 | §11: mockups y capturas de los estados que faltaban (registro: enviando, error-campos, error-servidor, catalogo-no-disponible, limite-reenvio y pedir-enlace; página del enlace: enlace-expirado, enlace-invalido y ya-verificado; pantalla final: plan-de-pago-elegido). Quedan pendientes Términos y Privacidad y dos textos | Estados de 001 | Adrián |
| 2026-09-26 | §11: mockups de Términos y Política de privacidad (borrador de textos; el texto final lo cierra el plan según D-22) | Respuestas del dueño sobre privacidad | Adrián |
| 2026-09-26 | §11: se hacen los dos ajustes obligatorios que quedaban (plan de pago elegido según D-24; advertencia y dominio del correo de verificación según D-20 y D-12), con sus capturas. §13: el Avance 1 es el 30/09/2026 | Ajustes pendientes de §11 y cambio de fecha de la Fase 1 | Adrián |
| 2026-09-26 | **Aclarada.** No quedan preguntas abiertas ni ajustes obligatorios, y cada pantalla de §11 tiene mockup. El plan espera ADR-0010 (`notifications` implementa `IMailer`) | Compuerta del dueño | Adrián |
| 2026-09-26 | D-3 y §14: `codigo_empleado` llega con la 011, que es la única que crea cuentas internas (003 D-3); el backlog pasa a «lista para `/plan`» porque ADR-0010 ya está aceptado | Coherencia con la spec 003 y ADR-0010 | Adrián |
| 2026-09-27 | R-10, D-15, §13 y §14: el `ThrottlerModule` entra con esta spec sin condición, como ya decidió la 002 D-11; se quita el riesgo de que el `architect` no lo apruebe. El ADR menor de `@nestjs/throttler` va en el plan (PD-32). D-15: `IRateLimiter` vive en `shared`, no en `sharing` (PD-30). Sin cambio de criterios | Coherencia con 002 D-11, 000 D-9 y ADR-0010 | Adrián |
| 2026-09-27 | Encabezado (fila DF) y §14: DF-13, DF-35 y la parte `usuario` de DF-33 ya están `Aceptado` en `design-findings.md` (PD-09); solo queda redibujar el E-R y las clases M1 (PD-06). Se crea `plan.md` (Propuesto). Sin cambio de criterios | Estado real de `design-findings.md` al planificar | — (planner; pendiente de Adrián) |
| 2026-09-27 | CA-6 precisa que un JSON mal formado responde el `400 VALIDATION_FAILED` de 000 (P-1 del plan). Sin cambio de alcance | Plan 001, P-1 | Adrián |
| 2026-09-28 | §11: el mensaje «Contraseña común» pierde «Elige otra.», que se repetía dentro de `IDENTITY_WEAK_PASSWORD` («… Elige otra. Elige otra que los cumpla.»). Sin cambio de criterios | Revisión del PR-3, hallazgo 4 | — (developer; pendiente de Adrián en el PR) |
| 2026-09-28 | §11: rótulos positivos de la lista de requisitos para contraseña común y correo cuando la regla se cumple («No es una contraseña común», «Es distinta de tu correo»); los mensajes de error no cambian. Sin cambio de criterios | Revisión visual T-67, UI-B2 | — (developer; pendiente de Adrián en el PR) |
| 2026-09-28 | §11: mientras 002 no exista, el botón de la pantalla «Correo verificado» dice «Iniciar sesión» (no «Ir a Mis archivos») y lleva a la ruta reservada; con 002 vuelve a «Ir a Mis archivos» (D-20). Sin cambio de criterios | Revisión visual T-67, UI-B3; el texto de T-66 | Adrián |
| 2026-09-28 | D-8, §6 y CA-15: límite de **10 reenvíos por IP y por hora** (`POST /auth/resend-verification`), con el mismo valor que el de registro pero contado aparte, el mismo guard y la misma respuesta de CA-15 (ámbito `ip`, sin cabeceras `X-RateLimit-*`). Evita que una IP pida reenvíos para miles de correos ajenos (spam a terceros y reputación del remitente). §10 lo menciona | Revisión de seguridad, SEC-1 | Adrián |
| 2026-09-28 | Dependencia con 006a (§13), sin cambiar el texto de §13: mientras 006a no publique en `packages/contracts` la lectura pública del catálogo, `web` usa la ruta provisional `GET {API_INTERNAL_URL}/plans` con un esquema local (`plan-catalog.ts`); cualquier fallo cae en `catalogo-no-disponible`. Se cierra con 006a (PD-40, PD-48). Sin cambio de criterios | Revisión del PR-4, I-2 | Adrián |
