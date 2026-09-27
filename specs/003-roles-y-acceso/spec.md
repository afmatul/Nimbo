# Spec 003 — Roles y acceso

| Campo | Valor |
|---|---|
| Estado | Aclarada (2026-09-26, Adrián) |
| Dueño | Adrián (1) |
| Fase | 1 |
| Requisitos | RF-05, RNF-05 (principales); aplican también RNF-13, RNF-17 |
| Depende de | **002** (token de acceso y el puerto que lo verifica, D-14 de 002); 001 (`usuario.rol`, D-1 de 001); 000 (bloques 1 y 2: `Actor`, `DomainError`, `DataSource`). **Hacia adelante** (D-1): la consulta de `accessibleNodes` y las políticas RLS se completan con 005 (propiedad) y 012 (comparticiones) |
| Módulo | T1 `shared` (guards, decoradores, `Actor`) + M3a `access` (`PermissionResolver`, políticas, `accessibleNodes`) |
| DF | DF-01 aceptado como regla (D-9) · DF-32 decidido por D-1 · DF-02 por ADR-0010 · **DF-50** nuevo (ubicación de `RolesGuard`, D-2). Falta que el `architect` actualice `design-findings.md` y los diagramas |
| ADR | ADR-0005 (autorización en la consulta + RLS) y ADR-0010, ambos `Aceptado` (2026-09-26) |
| Última actualización | 2026-09-26 |

## 1. Contexto y problema

Nimbo guarda archivos de muchas personas en la misma base de datos, y cuatro roles usan la plataforma: Cliente,
Administrador, Soporte y Operador. La propuesta promete que **ningún rol interno ve el contenido de los archivos** y
que la autorización se resuelve **dentro de la consulta**, no escondiendo botones ni filtrando resultados después
(RF-05, RNF-05, Art. IX). Si cada módulo decidiera por su cuenta quién puede qué, bastaría un olvido en un
controlador para que una cuenta vea datos de otra. Esta spec entrega un solo mecanismo, compartido por todas las
specs siguientes: nadie entra a una ruta sin identificarse salvo que la ruta sea pública a propósito, el rol se
comprueba en el servidor, y el acceso a los recursos se decide con un único modelo que los repositorios aplican en SQL.

## 2. Objetivo

Toda ruta de la API es pública de forma explícita o exige una sesión válida y un rol permitido; el servidor construye
el `Actor` desde el token y lo entrega a los servicios. Existen el modelo de niveles de acceso (propietario, editor,
lector) con sus acciones, el contrato de `accessibleNodes(actor)` y la segunda barrera en la base de datos, listos para
que 005 y 012 los usen, y una suite de aislamiento que falla si una cuenta alcanza datos de otra.

## 3. Actores

- **Cliente**: accede a sus recursos y a los compartidos con él.
- **Administrador, Soporte, Operador**: acceden solo a lo que su rol permite según la matriz de `product-context.md`
  §2, **nunca** al contenido ni a las vistas previas de archivos.
- **Visitante** (anónimo): solo alcanza las rutas públicas (registro, inicio de sesión, renovación, recuperación,
  verificación, catálogo, salud).
- **Dueños de otras specs**: declaran qué rol exige cada ruta y reciben el `Actor`; no escriben su propia autorización.

## 4. Historias de usuario

- **HU-1** Como cliente, quiero que nadie más vea mis archivos, ni siquiera el personal de Nimbo, salvo que yo los comparta.
- **HU-2** Como integrante del personal interno, quiero poder hacer lo que mi rol permite y nada más.
- **HU-3** Como dueño de una spec, quiero marcar qué rol exige cada ruta y recibir el `Actor` ya validado, sin reescribir
  la autorización en cada módulo.
- **HU-4** Como equipo, queremos una suite que falle en cuanto una cuenta alcance datos de otra.

## 5. Restricciones y decisiones

### 5.1 Restricciones ya fijadas

| # | Restricción | Fuente |
|---|---|---|
| R-1 | Los cuatro roles y la matriz de permisos de `product-context.md` §2. El rol nunca otorga acceso al contenido. | RF-05, propuesta §7 |
| R-2 | Un rol por cuenta, en `usuario.rol` con `CHECK`; las cuentas internas son distintas de las de cliente y nadie acumula roles. | Spec 001 D-1, propuesta §7.4 |
| R-3 | No existe la suplantación, ni siquiera para diagnosticar. | Propuesta §7.4, `CLAUDE.md` |
| R-4 | `Actor` = `{ id, role, canReadContent }` en `shared`. | Spec 000, `architecture.md` §6 |
| R-5 | La autorización se resuelve dentro de la consulta de datos; los repositorios de datos de cliente solo exponen `findAccessible(actor, …)`. | RNF-05, Art. IX, `architecture.md` §6 |
| R-6 | `accessibleNodes(actor)` es la **única** implementación de «qué puede ver este actor»: la usan listados, búsqueda, descargas, vista previa, edición y el agente. | DF-32, `architecture.md` §6 |
| R-7 | RLS como segunda barrera en `archivo`, `version_archivo` y `fragmento`, con el actor fijado por transacción: `set_config('app.actor_id', $1, true)` y `app.actor_role` dentro de `withActor()` (ADR-0005). | `architecture.md` §6 |
| R-8 | `access` lee `archivo`, `carpeta` y `comparticion` con SQL de solo lectura (excepción documentada a «cada módulo es dueño de sus tablas»). | `architecture.md` §3, ADR-0010 |
| R-9 | Toda acción de un rol interno sobre una cuenta ajena queda en la auditoría visible para el cliente (RF-07). | Propuesta §7.4; specs 004 y 011 |

### 5.2 Decisiones del dueño

Todas las tomó Adrián el 2026-09-26. La numeración D-n sigue a la pregunta P-n que resuelve.

| # | Decisión | Pregunta |
|---|---|---|
| D-1 | **Alcance en Fase 1.** Esta spec entrega los guards, el `Actor`, los decoradores, los contratos de `access` (`PermissionResolver.levelFor` y `can`, `IAccessPolicy` con `OwnerPolicy`, `EditorPolicy` y `ViewerPolicy`, `AccessLevel`, `Action` y la firma de `accessibleNodes`), el ayudante de transacción que fija el actor para RLS y el arnés de la suite de aislamiento. La **consulta** de `accessibleNodes` y las **políticas RLS** se escriben cuando existan las tablas: la parte de propiedad junto con 005 y la de comparticiones con 012. Las escribe el dueño de `access` (Adrián) en esos PR. **Resuelve DF-32.** | P-1 |
| D-2 | **Guards globales en `shared`**, que **niegan por defecto**: una ruta sin `@Public()` exige un token válido. `JwtAuthGuard` verifica el token con un puerto que define `shared` y que implementa `identity` (D-14 de 002), y `RolesGuard` comprueba `@Roles(...)`. `RolesGuard` sale de `backoffice`: ahí obligaría a todos los módulos a depender de M8. Se registra **DF-50** y se actualizan `architecture.md` §3 y §6 y `design-model.md` (M8, T1). | P-2 |
| D-3 | **Las cuentas internas se crean solo en 011** (Fase 2), con su administración. En la Fase 1 solo existen en las pruebas, que las insertan directamente. `codigo_empleado` (D-3 de 001) llega con la migración de 011. | P-3 |
| D-4 | **El «Limitado» de Soporte** al restaurar la papelera de un cliente: solo **restaurar**, nunca ver ni descargar; siempre con un **motivo escrito**, y siempre en la auditoría visible para el cliente (RF-07). Se implementa en 011; aquí se fija la regla y se actualiza la nota ¹ de `product-context.md` §2. | P-4 |
| D-5 | **Mismo formulario de inicio de sesión para todos los roles** (002). Después, la web redirige según el rol: el Cliente a Mis archivos; las cuentas internas a su área, que hasta 011 es una página de marcador con su nombre, su rol y «Cerrar sesión». Esa redirección es solo experiencia de usuario: la barrera es que las rutas de cliente exigen `CLIENT` en el servidor. | P-5 |
| D-6 | **Respuestas.** Recurso de otra cuenta o inexistente: **404**, idéntico en los dos casos (mismo `status` y cuerpo, con el `code` del módulo, p. ej. `STORAGE_NODE_NOT_FOUND`). Rol insuficiente: **403** `SHARED_FORBIDDEN`. Sin token, o con un token vencido o inválido: **401** `SHARED_UNAUTHENTICATED`; la web intenta una renovación (002) antes de mandar a iniciar sesión. | P-6 |
| D-7 | **RLS desde la Fase 1** en `archivo` y `version_archivo`, desde las migraciones que las crean (005), con `FORCE ROW LEVEL SECURITY`. La API se conecta con un **rol de base de datos que no es dueño** de las tablas; las migraciones corren con el rol dueño. Esta spec entrega los dos roles en compose y staging, sus variables de entorno y el ayudante `withActor()`, que fija `app.actor_id` y `app.actor_role` en cada transacción con `set_config(…, true)` y parámetros (equivale a `SET LOCAL` sin concatenar valores; ADR-0005). Los roles internos solo ven metadatos de `archivo` y no reciben ninguna fila de `version_archivo`, donde está `clave_objeto` (ADR-0005); las columnas visibles las acota `INodeMetadataReader`, no RLS. Las políticas se escriben en las migraciones de 005. `fragmento` entra con 019. | P-7 |
| D-8 | **Sin mockups nuevos.** Los estados «sin permiso» (403) y «no encontrado» (404) de la web se construyen con los componentes de 000b; es la decisión explícita que pide `Aclarada`. | P-8 |
| D-9 | Todo método de servicio que actúa sobre datos de un usuario recibe `actor: Actor` como primer parámetro (**DF-01 aceptado como regla**; el `architect` actualiza las firmas de los diagramas). `canReadContent` es `true` solo para `CLIENT`. | — (restricciones R-4, R-5) |
| D-10 | **Toda ruta se declara.** Cada ruta de la API lleva `@Public()` o `@Roles(...)`. Una prueba recorre todas las rutas registradas y falla si alguna no declara ninguna de las dos, aunque la negación por defecto ya la proteja. | — (derivada de D-2) |
| D-11 | El `Actor` sale **solo** del token verificado. Ningún parámetro, cuerpo ni cabecera cambia el `id` o el rol con que se autoriza (R-3). | — (restricción R-3) |

## 6. Parámetros

No hay parámetros numéricos propios. La vida del token de acceso (15 min) es de 002 (D-2).

## 7. Criterios de aceptación

> Formato Dado/Cuando/Entonces. Las rutas «de prueba» son controladores que solo existen en las pruebas y cubren cada
> combinación de `@Public` y `@Roles`. Los criterios marcados **[con 005]** se verifican cuando existan esas tablas,
> en el PR de 005, y se enlazan desde el `verification.md` de ambas specs (D-1).

### Autenticación y roles en el servidor (HU-2, HU-3, RF-05)

- **CA-1** (HU-3, D-2) — negación por defecto
  - **Dado** una ruta sin `@Public()`,
  - **Cuando** se llama sin token,
  - **Entonces** se responde `401` `SHARED_UNAUTHENTICATED` con la forma `{ code, message, correlationId }` y el
    controlador no se ejecuta.
- **CA-2** (HU-3, D-2, D-6) — token vencido, alterado o de otra clave
  - **Dado** un token de acceso vencido, uno alterado y uno firmado con otra clave,
  - **Cuando** se usan en una ruta protegida,
  - **Entonces** los tres reciben `401` `SHARED_UNAUTHENTICATED`.
- **CA-3** (HU-3, D-2) — rutas públicas
  - **Dado** las rutas marcadas con `@Public()` (salud, registro, verificación, inicio de sesión, renovación,
    recuperación y catálogo),
  - **Cuando** se llaman sin token,
  - **Entonces** responden normalmente.
- **CA-4** (HU-3, R-4, D-9, D-11) — el `Actor` sale del token
  - **Dado** un token válido de cada rol,
  - **Cuando** se llama una ruta de prueba que devuelve el `Actor` recibido,
  - **Entonces** llega `{ id, role, canReadContent }` con `canReadContent` en `true` solo para `CLIENT`;
  - **Y** mandar otro `id`, `userId`, `role` o `actor` en la ruta, el cuerpo, la consulta o las cabeceras no cambia el `Actor`.
- **CA-5** (HU-1, HU-2, RF-05, D-6) — rutas de cliente
  - **Dado** una ruta de prueba con `@Roles(CLIENT)`,
  - **Cuando** la llaman un Administrador, un Soporte y un Operador,
  - **Entonces** los tres reciben `403` `SHARED_FORBIDDEN`, y un Cliente recibe la respuesta normal.
- **CA-6** (HU-2, RF-05) — rutas internas
  - **Dado** rutas de prueba con `@Roles(ADMIN)`, `@Roles(SUPPORT)`, `@Roles(OPERATOR)` y `@Roles(ADMIN, SUPPORT)`,
  - **Cuando** las llama cada uno de los cuatro roles,
  - **Entonces** solo los roles listados obtienen la respuesta normal; los demás, `403` `SHARED_FORBIDDEN`.
- **CA-7** (HU-3, D-10) — toda ruta declarada
  - **Dado** la API completa,
  - **Cuando** corre la prueba que recorre sus rutas,
  - **Entonces** cada ruta tiene `@Public()` o `@Roles(...)`, y la prueba nombra las que no.

### Modelo de acceso a recursos (HU-1, RF-05, RNF-05)

- **CA-8** (HU-1, R-1, D-1) — niveles y acciones
  - **Dado** las políticas de propietario, editor y lector,
  - **Cuando** se evalúa cada acción,
  - **Entonces** el propietario puede todas; el editor puede ver, descargar, editar, generar versiones y consultar al
    agente, pero no compartir, crear enlaces, eliminar el original ni ver quién más tiene acceso; y el lector puede ver,
    descargar y consultar al agente, y nada más (tabla de niveles de `product-context.md` §2).
- **CA-9** (HU-1, RF-05, R-1) — roles internos sin contenido
  - **Dado** un `Actor` de cada rol interno,
  - **Cuando** `PermissionResolver.can` evalúa ver contenido, descargar, previsualizar, editar o consultar al agente
    sobre cualquier recurso,
  - **Entonces** responde `false` siempre, sin consultar a quién pertenece el recurso.
- **CA-10** (HU-1, RNF-05, R-5, R-6) **[con 005]** — `accessibleNodes` filtra dentro de la consulta
  - **Dado** dos clientes con archivos casi idénticos (mismos nombres, tamaños y carpetas),
  - **Cuando** cada uno lista, busca o pide descargar,
  - **Entonces** nunca aparece un recurso del otro, y el filtro está en el SQL generado, no después de consultar
    (revisión del plan y de la consulta).
- **CA-11** (HU-1, D-6) — lo ajeno responde como inexistente
  - **Dado** un recurso de otra cuenta y un identificador que no existe,
  - **Cuando** un cliente pide cualquiera de los dos,
  - **Entonces** las dos respuestas son `404` idénticas salvo el `correlationId`. Se prueba en 003 con un recurso de
    prueba y se repite **[con 005]** con archivos reales.

### Segunda barrera en la base de datos (HU-1, RNF-05)

- **CA-12** (D-7) — el actor por transacción
  - **Dado** dos transacciones seguidas sobre la **misma** conexión del pool, con actores distintos,
  - **Cuando** cada una consulta `current_setting('app.actor_id')`,
  - **Entonces** cada una ve el suyo, y fuera de una transacción `current_setting('app.actor_id', true)` vuelve vacío
    (`''` o `NULL`; las políticas usan `nullif(…, '')` y sin actor no devuelven filas).
- **CA-13** (D-7) — la API no es dueña de las tablas
  - **Dado** los roles de base de datos de compose,
  - **Cuando** se revisa quién es dueño de las tablas y con qué rol se conecta la API,
  - **Entonces** la API usa un rol que no es dueño ni superusuario, y las migraciones usan el rol dueño.
- **CA-14** (D-7, R-7) **[con 005]** — RLS en `archivo` y `version_archivo`
  - **Dado** las políticas RLS con `FORCE ROW LEVEL SECURITY`,
  - **Cuando** la API consulta sin actor fijado, o con el actor de un cliente,
  - **Entonces** sin actor no obtiene filas, y con el actor de un cliente solo obtiene las suyas, aunque la consulta
    olvide filtrar.

### Suite de aislamiento, bitácoras e interfaz (HU-4)

- **CA-15** (HU-4, RNF-05, D-3) — arnés de aislamiento
  - **Dado** el comando `pnpm test:isolation`,
  - **Cuando** corre,
  - **Entonces** crea dos clientes con datos casi idénticos y una cuenta de cada rol interno (insertadas directamente,
    D-3), ejecuta las pruebas de aislamiento de las specs integradas (en 003: CA-4, CA-5, CA-6 y CA-9) y falla ante
    cualquier fuga. En la Fase 1 corre en local (`workflow.md` §7.2) y bloquea el CI en cuanto exista.
- **CA-16** (RNF-17) — bitácoras de accesos denegados
  - **Dado** respuestas 401 y 403,
  - **Cuando** se revisan las bitácoras,
  - **Entonces** cada una tiene `correlationId`, ruta, `id` y rol del actor (si lo hay) y el motivo, sin tokens,
    contenido, nombres de archivo ni correos.
- **CA-17** (RNF-13, D-5, D-8) — interfaz
  - **Dado** la web,
  - **Cuando** inicia sesión un Cliente y una cuenta interna, y cuando una respuesta es 403 o 404,
  - **Entonces** el Cliente llega a Mis archivos y la cuenta interna a su área de marcador; una ruta de cliente abierta
    por una cuenta interna redirige a su área; y los estados «sin permiso» y «no encontrado» se ven con los componentes
    de 000b, en español, a 360 y 1440 px, sin violaciones serias de axe.

## 8. Reglas de negocio

- **RN-1** Se niega por defecto: solo las rutas con `@Public()` se atienden sin sesión (D-2).
- **RN-2** El rol se toma del token verificado; cada cuenta tiene un solo rol, y las cuentas internas nunca son de
  cliente (R-2, D-11).
- **RN-3** Los roles internos nunca obtienen contenido, vistas previas ni descargas de archivos de clientes (R-1, CA-9).
- **RN-4** La autorización ocurre dentro de la consulta. Los repositorios de datos de cliente no ofrecen métodos que
  consulten sin actor, y ningún servicio filtra después de consultar (R-5).
- **RN-5** Lo ajeno responde igual que lo inexistente (404); la falta de rol, 403 (D-6).
- **RN-6** No existe la suplantación: ninguna ruta, cabecera ni parámetro permite actuar como otra cuenta (R-3, D-11).
- **RN-7** Soporte solo restaura desde la papelera de un cliente, con motivo escrito y registro visible para el cliente
  (D-4, RF-07).
- **RN-8** La base de datos aplica RLS en las tablas de contenido aunque la aplicación olvide filtrar (D-7).

## 9. Requisitos no funcionales aplicables

| RNF | Cómo aplica aquí | Cómo se verifica |
|---|---|---|
| RNF-05 | Autorización dentro de la consulta y RLS; suite de aislamiento bloqueante | CA-10, CA-11, CA-14, CA-15 |
| RNF-13 | Estados «sin permiso» y «no encontrado» a 360 px, en español, AA | CA-17 |
| RNF-17 | `correlationId` y sin datos sensibles en los accesos denegados | CA-16 |

## 10. Seguridad y privacidad

- **¿Toca contenido de archivos?** No directamente: define quién puede tocarlo. Ningún rol interno puede (RN-3).
- **Auditoría (RF-07)**: las respuestas 401 y 403 van a la bitácora técnica (CA-16), no a la auditoría del cliente. Las
  acciones de roles internos sobre cuentas ajenas se auditan en 011 con el módulo de 004.
- **Límite de tasa**: ninguno propio. Los de inicio de sesión son de 002.
- **Nunca en bitácoras**: tokens, contenido, nombres de archivo y correos.
- **Secretos**: las credenciales de los dos roles de base de datos viven en variables de entorno (en staging, GitHub
  Environments); `.env.example` lleva valores de desarrollo.
- **Riesgo de configuración**: si la API se conectara con el rol dueño, RLS no la frenaría; CA-13 lo comprueba.

## 11. Experiencia de usuario

- **Sin mockups nuevos** (D-8). «Sin permiso» y «no encontrado» usan los componentes de estado de 000b, con estos
  mensajes:
  - Sin permiso: «No tienes permiso para ver esta página. Si crees que es un error, escríbenos a {correo de contacto}.»
  - No encontrado: «No encontramos lo que buscas. Puede que no exista o que no tengas acceso.»
  - Área interna (marcador hasta 011): «Hola, {nombre}. Tu área de {rol} estará disponible pronto.» con «Cerrar sesión».
- La redirección por rol (D-5) es solo experiencia de usuario; la barrera real es CA-5.

## 12. Fuera de alcance

- Crear, suspender y administrar cuentas internas, y su `codigo_empleado`: 011.
- La auditoría (004) y las acciones internas sobre cuentas ajenas, incluida la restauración de Soporte (011).
- La consulta completa de `accessibleNodes` y las políticas RLS: 005 (propiedad) y 012 (comparticiones), según D-1.
  RLS en `fragmento`: 019.
- Enlaces públicos y su acceso por contraseña: 013.
- Roles o permisos configurables, organizaciones y administración delegada (`product-context.md` §3 y §9).
- Segundo factor para cuentas internas.

## 13. Riesgos

| Riesgo | Impacto | Mitigación |
|---|---|---|
| **Dependencia hacia adelante**: `accessibleNodes` y RLS necesitan las tablas de 005, y 005 necesita esta spec | 005 no puede autorizar descargas; o 003 se retrasa esperando tablas | D-1: 003 entrega contratos y guards; la consulta y RLS se escriben en el PR de 005 por el dueño de `access`. Coordinar el plan de 005 con Abel |
| **Demo de roles en la Fase 1 sin cuentas internas** (D-3) | En el Avance 1 no se puede iniciar sesión como Administrador | Se demuestra con la suite de roles y aislamiento (CA-5, CA-6, CA-15); la administración llega con 011 |
| RLS con pool de conexiones: un `SET` sin `LOCAL` o fuera de transacción se filtraría a otra petición | Fuga entre cuentas | Solo `set_config(…, true)` dentro de la transacción de `withActor()` (CA-12), con un lint que lo prohíbe fuera de él; prueba con la misma conexión |
| TypeORM y RLS: toda consulta de datos de cliente debe ir dentro de la transacción con actor | Consultas que no ven filas, o que las ven todas si alguien usa el rol dueño | Ayudante único de transacción; CA-13 y CA-14; revisión del `security-auditor` |
| El rol del token dura hasta 15 min tras una suspensión | Acceso breve de una cuenta recién suspendida | Aceptado en D-10 de 002; los roles no cambian (R-2) |
| Mover `RolesGuard` a `shared` contradice el diagrama de M8 | Diagramas y código se contradicen | DF-50 y actualización de `architecture.md` y del diagrama en el PR del plan |

## 14. Dependencias y documentos a actualizar

- **DF**: DF-01 aceptado como regla (D-9); DF-32 decidido (D-1); DF-02 por ADR-0010; **DF-50 nuevo**: «`RolesGuard`
  en M8 obliga a todos los módulos a depender de `backoffice`; se mueve a `shared`» (D-2). El `architect` actualiza en
  el PR del plan `design-findings.md`, `Diagramas_de_Clases.pdf` (M8, T1, firmas con `actor`) y `design-model.md`.
- **ADR**: **ADR-0005** (autorización en la consulta + RLS: rol de aplicación no dueño, `FORCE ROW LEVEL SECURITY`,
  `set_config(…, true)` por transacción dentro de `withActor()`) y **ADR-0010**, ambos `Aceptado` el 2026-09-26.
- **Specs relacionadas**:
  - **002**: implementa el puerto de verificación que usa `JwtAuthGuard` (D-14 de 002).
  - **005**: su plan incluye la consulta de propiedad de `accessibleNodes`, las políticas RLS de `archivo` y
    `version_archivo` y qué metadatos ven los roles internos; cierra CA-10, CA-11 y CA-14.
  - **012**: agrega las comparticiones a `accessibleNodes`.
  - **011**: crea las cuentas internas (D-3) y aplica la regla de Soporte (D-4).
  - **004**: registra las acciones internas visibles para el cliente.
  - **001**: su D-3 dice que `codigo_empleado` llega con «003/011»; con D-3 de esta spec, llega con 011.
- **Documentos**:
  - `product-context.md` §2, nota ¹: la condición de «Limitado» (D-4). Se actualiza en este mismo PR.
  - `architecture.md` §3 y §6: guards en `shared` y roles de base de datos (D-2, D-7).
  - `docker-compose.yml`, `.env.example` y la documentación de ambientes: rol de aplicación y rol de migraciones (D-7).

## 15. Preguntas

### Abiertas

Ninguna.

### Resueltas

- [RESUELTA] P-1 → D-1: A, guards y contratos ahora; consulta y RLS con 005 y 012 (2026-09-26, Adrián)
- [RESUELTA] P-2 → D-2: A, guards globales en `shared`, negación por defecto y `@Public()` (2026-09-26, Adrián)
- [RESUELTA] P-3 → D-3: B, las cuentas internas se crean en 011 (2026-09-26, Adrián)
- [RESUELTA] P-4 → D-4: A, Soporte solo restaura, con motivo y auditoría visible (2026-09-26, Adrián)
- [RESUELTA] P-5 → D-5: A, mismo formulario y redirección por rol (2026-09-26, Adrián)
- [RESUELTA] P-6 → D-6: A, 404 para lo ajeno y 403 para el rol (2026-09-26, Adrián)
- [RESUELTA] P-7 → D-7: A, RLS desde la Fase 1 con rol de aplicación no dueño (2026-09-26, Adrián)
- [RESUELTA] P-8 → D-8: A, sin mockups nuevos (2026-09-26, Adrián)

## 16. Registro de cambios

| Fecha | Cambio | Motivo | Aprobó |
|---|---|---|---|
| 2026-09-26 | Creación en `Borrador` con las decisiones D-1 a D-11 (respuestas a P-1–P-8), sin preguntas abiertas. Puede pasar a `Aclarada` cuando el dueño lo confirme; el plan espera a ADR-0005 y ADR-0010 | Spec de Fase 1; el dueño respondió las preguntas antes de redactar | Adrián |
| 2026-09-26 | **Aclarada.** Sin preguntas abiertas y sin pantallas nuevas (§11). El plan espera ADR-0005 y ADR-0010 | Compuerta del dueño | Adrián |
| 2026-09-26 | Alineada con ADR-0005 y ADR-0010, ya aceptados: `set_config(…, true)` dentro de `withActor()` en lugar de `SET LOCAL` (R-7, D-7, §13, §14); los roles internos no reciben filas de `version_archivo` (D-7); CA-12 admite el valor vacío fuera de la transacción. El plan ya no espera ADR | Aceptación de ADR-0005 y ADR-0010 (pendientes PD-14 y PD-12) | Adrián |
