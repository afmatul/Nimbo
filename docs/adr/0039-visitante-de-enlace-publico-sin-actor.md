# ADR-0039 — El visitante de un enlace público llega a su archivo por una función `SECURITY DEFINER` de identificadores y después actúa como el propietario

| Campo | Valor |
|---|---|
| Estado | Aceptado (2026-10-31). Propuesto por el `architect` (2026-10-30); aceptado en el PR #87 con el acuerdo de los cuatro integrantes que exige la constitución, transmitido por Adrián en el PR, con la condición de que el actor derivado del dueño solo exista dentro de `PublicLinkAccessService` y que las acciones del visitante se sigan distinguiendo como tales (`trigger: 'public_link'`, CA-18). **Delimita** el alcance de la constitución Art. IX.2 y de la regla de CLAUDE.md «todo servicio que toca datos de un usuario recibe `actor: Actor`» (excepción: el visitante de un enlace público); **amplía** ADR-0021 |
| Fecha | 2026-10-30 |
| Decisores | `architect`, Fátima (dueña de la 013), Adrián (tech lead) |
| Specs relacionadas | 013 (RF-17, RNF-08; CA-9 a CA-14, CA-17), 012 (`nodos_compartidos()`), 005 y 006 (patrón de mantenimiento); ADR-0005, ADR-0021, ADR-0035; DF-09, DF-86; PD-141 |

**Amplía ADR-0021** (un segundo uso del patrón «función mínima + `withActor` del dueño», ahora en una ruta HTTP) y
**delimita** la regla «todo servicio que toca datos de un usuario recibe `actor: Actor`» (constitución Art. IX.2,
`CLAUDE.md` y `architecture.md` §6 punto 2) con una excepción nombrada: `PublicLinkAccessService`.

## Contexto

La 013 deja que alguien **sin cuenta** abra la ficha de un archivo y lo descargue con un token de 256 bits que solo
viaja en la URL entregada al propietario. Todo lo demás en Nimbo supone un `Actor`:

- `api` usa `nimbo_app` (`NOBYPASSRLS`, no dueño) y `archivo`, `version_archivo` y las tablas de `sharing` tienen
  `ENABLE` + `FORCE ROW LEVEL SECURITY`; sin `app.actor_id` no hay filas (ADR-0005).
- Los servicios reciben `actor` y los repositorios de datos de cliente piden `requireActorScope(actor)`.
- La auditoría inserta con `actor_id = nimbo_actor_id()` (`evento_auditoria_alta`, 004).

El visitante no tiene actor y no debe tenerlo: no es una cuenta. Hay que llevarlo desde un hash de token hasta **un**
archivo vivo de un propietario activo, sin abrir la base a una consulta sin actor y sin que un error del código
convierta el token en acceso a otro archivo (CA-17). Restricciones: equipo de 4, Fase 2 casi cerrada, un servidor de
8 GB, suite de aislamiento bloqueante y la revisión del `security-auditor` (013).

## Opciones consideradas

1. **A. Función `SECURITY DEFINER` que traduce el hash a identificadores + `withActor` del propietario** (elegida)
   - Pros: es el patrón de ADR-0021 que ya revisó el equipo (`carga_expiradas`, `papelera_vencida`, las funciones de
     009 y 011b). La única capacidad sin actor es `enlace_por_token(hash)`: lee solo `enlace_publico`, devuelve 0 o 1
     fila con tres UUID y exige conocer el hash de un token de 256 bits (no enumera, a diferencia de `carga_expiradas`).
     Todo lo demás (clave, vencimiento, archivo, versión, auditoría) corre con RLS normal como el
     propietario, con las mismas políticas que ya protegen su cuenta. No cambia `withActor`, `Role`, los guards ni
     ninguna política de `archivo`, `version_archivo` o `evento_auditoria`.
   - Contras: el servicio del visitante fabrica un actor (`createActor(propietario_id, CLIENT)`), así que «el actor
     es quien hace la petición» deja de valer dentro de ese servicio; la auditoría del visitante queda con
     `actor_id` = propietario. Otra función y otra política `TO CURRENT_USER` del dueño de las tablas (PD-141 pide
     revisar SEC-6 al sumar una).
2. **B. Política RLS «anónima» por una GUC (`app.link_token_hash`)**
   - Pros: sin actor fabricado; la base filtra por el token en cada tabla.
   - Contras: hay que cambiar `withActor` de `shared` (otra variable, otro validador y otra excepción a la regla de
     lint `rls.js`) y sumar políticas para el visitante en `enlace_publico`, `archivo` y `version_archivo`, que hoy
     son de las más revisadas. Una GUC la puede fijar cualquier SQL de `nimbo_app` (PD-141 SEC-5): el riesgo pasa de
     una función de una fila a tres tablas de contenido.
3. **C. Rol `VISITOR` en `Actor`/`Role`**
   - Pros: el servicio recibiría un `actor` como todos.
   - Contras: `Role` es la matriz de roles de toda la API (`RolesGuard`, `@Roles`, `isolation-world`, políticas que
     comparan `nimbo_actor_role()`); un rol sin `id` de usuario rompe `actor_id = nimbo_actor_id()` en auditoría y
     obliga a revisar cada política existente. Es un cambio transversal para dos rutas.
4. **D. `enlace_publico` sin RLS**
   - Contras: la tabla guarda `clave_hash` y qué archivos de cada cliente están publicados; un `WHERE` olvidado en
     las consultas del propietario mostraría enlaces ajenos, y CA-17 exige que la base lo niegue aunque la consulta
     olvide filtrar. Contradice ADR-0005. Descartada.
5. **E. Posponer**
   - Contras: RF-17 es de la Fase 2 y la 013 no tiene otra forma de servir a un visitante; 013b y la demo dependen de
     ella.

## Decisión

Opción A, con estas reglas (las verifica la suite `test/isolation/public-links.iso-spec.ts` con un dueño
`NOSUPERUSER`):

1. **Función**: `enlace_por_token(p_token_hash char(64))`, `LANGUAGE sql STABLE SECURITY DEFINER SET search_path =
   pg_catalog, pg_temp`, tablas con esquema (`public.enlace_publico`). Devuelve **solo** `(enlace_id, archivo_id,
   propietario_id)` con el filtro completo en su cuerpo: `WHERE token_hash = p_token_hash AND revocado_en IS NULL AND
   vence_en > now()` (el llamador no controla el reloj). Sin `clave_hash`, nombre ni fechas: la lista de ADR-0021 («solo identificadores») se cumple sin enmienda.
   El parámetro es `char(64)` como la columna, para que `uq_enlace_publico_token_hash` sirva la búsqueda.
   `REVOKE ALL … FROM PUBLIC` y `EXECUTE` solo para `nimbo_app`. Su política propia, `enlace_publico_por_token`,
   `FOR SELECT TO CURRENT_USER USING (revocado_en IS NULL AND vence_en > now())`, es la segunda barrera.
2. **No lee otras tablas.** Papelera, purga y suspensión no se resuelven dentro de la función: las resuelven la
   fachada de `storage` (`LinkedFileGateway`, propiedad viva por `ownedNodes`) y `IShareeDirectory.activeDisplayName`.
   Así no nace otra excepción a «cada módulo es dueño de sus tablas» y SEC-6 (PD-141) no se amplía: la función no toca
   `archivo`, `carpeta` ni `comparticion`.
3. **Actor derivado** (excepción de `architecture.md` §6 punto 11): solo `PublicLinkAccessService` (sus dos métodos
   públicos reciben `{ token, ip }` o `{ token, ip, password }`, sin ningún id, y no `actor`) construye `createActor(propietario_id, Role.CLIENT)`, y solo
   **después** de que `activeDisplayName(propietario_id)` confirme un cliente activo y verificado. El actor no sale
   del servicio, no se devuelve, no se guarda en la petición y se usa únicamente con el `enlace_id` y el
   `archivo_id` de la fila de la función, **nunca** con un id de la petición: los cuerpos públicos son `.strict()` y un campo de más (p. ej. `fileId` u
   `ownerId`) da el mismo `404` de la regla 4. Con ese actor: se relee el enlace por
   `id` con RLS (clave y vencimiento, mismo filtro de disponibilidad), se pide la ficha y la URL a
   `LinkedFileGateway` y se audita (los intentos fallidos solo cuentan en Redis y van a la bitácora técnica). Ningún otro servicio fabrica un actor a partir de
   datos de una petición.
4. **Indistinguible** (CA-11): todos los motivos (token inexistente, mal formado, revocado, reemplazado o vencido,
   archivo en la papelera o purgado, propietario suspendido) y el cuerpo inválido terminan en el mismo
   `PublicLinkUnavailableError`, con el mismo cuerpo.
5. **Auditoría**: `public_link.downloaded` y `public_link.locked` se insertan con el actor derivado, así pasan por
   `evento_auditoria_alta` sin política nueva. `actor_id` = propietario significa «en nombre de», y la acción
   `public_link.*` dice que fue un visitante. Llevan `trigger: 'public_link'` (valor nuevo de `AUDIT_TRIGGERS`, que
   `audit-event-response.ts` ya devuelve por `isTrigger`). El evento sigue en el filtro «Yo» de «Mi actividad»
   (`actor_id = usuario_afectado_id`, `typeorm-audit.repository.ts`), pero el `trigger` lo distingue, como
   `node.purged` con `trigger: 'scheduled'`; la 013b lo muestra como «Alguien con el enlace», nunca «Tú» (spec CA-18).
6. **Pruebas**: `nimbo_app` sin actor ve 0 filas de `enlace_publico`; la función devuelve una fila
   de tres columnas solo para su hash y ninguna para un revocado o vencido; `PUBLIC` no la ejecuta; `pg_proc` y
   `pg_policies` muestran que función y política son del dueño de las tablas; `nimbo_app` no borra `enlace_publico` y solo
   actualiza `revocado_en`; el token de A nunca alcanza otro
   archivo, una carpeta ni una versión anterior, ni con ids de otro archivo en el cuerpo.

## Consecuencias

- Positivas: el visitante no amplía ninguna política de contenido; `withActor`, `Role` y los guards no cambian; el
  mismo patrón que el equipo ya defendió con ADR-0021 se explica en una frase en la exposición («el token solo
  traduce a tres ids; lo demás lo protege la RLS del dueño»).
- Negativas / deuda aceptada: una excepción nombrada a «el servicio recibe `actor`»; la auditoría del visitante
  lleva el id del propietario como actor, distinguida por `trigger`; otra función y otra política `TO CURRENT_USER` del dueño; quien tenga
  `nimbo_app` y un token válido obtiene tres UUID (lo mismo que ya obtiene con el token por la API).
- Cómo sabremos si fue un error: si la función necesita devolver algo más que identificadores o leer otra tabla; si
  otro servicio empieza a fabricar actores a partir de la petición; si `public-links.iso-spec.ts` sigue verde al
  quitar `enlace_publico_por_token` con el dueño `NOSUPERUSER`; o si una spec futura (enlaces a carpetas) pide navegar,
  lo que exigiría revisar esta decisión con un ADR nuevo.
- Actualizados en el mismo PR: constitución Art. IX.2 (excepción: visitante de enlace público, ADR-0039) y la
  prohibición de `CLAUDE.md` («todo servicio … recibe `actor: Actor`»), como hizo ADR-0031 con Art. IX.6; el Estado de
  ADR-0021 anota «ampliado por ADR-0039». Si el PR no se aprueba, esos cambios se retiran con él. PD-141 SEC-6 se evaluó y no aplica: la función no lee `archivo` ni `carpeta`.
