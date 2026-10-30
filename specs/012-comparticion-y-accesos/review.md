# Revisión 012 — Compartición y accesos (API)

> Una página. La escribe `reviewer` (con `security-auditor` solo si aplica, `workflow.md` §4) y la aprueba Adrián.
> Por ahora solo trae la sección «Seguridad» (`security-auditor`, T-10); el `reviewer` completa el resto.

## Seguridad

**Veredicto: ❌ Bloqueado** por SEC-2 (escritura entre cuentas que esta spec introduce en `sesion_edicion`). Ninguna prueba encontró
**acceso a contenido** de otra cuenta: lectura, descarga, migas, agente y roles internos están bien aislados.

- Datos de cliente: sí. `actor` + `accessibleNodes`/`ownedNodes` + RLS: ✅ en lectura; ❌ en dos escrituras por SQL (SEC-1, SEC-2).
- Bitácoras y auditoría sin nombres, correos ni claves: ✅ (cubierto en `test/int/sharing/shares.int-spec.ts`, CA-19; no se repite aquí).

**Pruebas ISO agregadas** (bloqueantes en CI; `pnpm test:isolation` en verde, con 6 `it.failing` que documentan SEC-1 a SEC-4).
Son dos archivos: el plan §6 pedía uno, pero la parte SQL necesita su propio Postgres con dueño `NOSUPERUSER`.
- `apps/api/test/isolation/sharing.iso-spec.ts` (HTTP, 16): ISO-1 a ISO-5 A/B/C (C y A no alcanzan nada ajeno por ficha, descarga,
  historial, contenido, migas, fijado ni `/shares`; B alcanza solo lo compartido y su subárbol, las migas empiezan en la carpeta
  compartida y la raíz de B no lo mezcla). Cada intento es **igual** al 404 de un id inexistente. ISO-6/7 CA-14 (Lector y Editor no
  comparten, ni listan ni revocan). ISO-8 CA-17 (propietaria suspendida → 404 y `received` vacío; al reactivarla vuelve). ISO-9/10
  CA-20 (ADMIN, SUPPORT y OPERATOR: 403 en las 5 rutas y en la ficha; sin token: 401). ISO-11/12 CA-22/23 (C no sale del acceso de B,
  A no usa Salir sobre lo suyo). ISO-13 CA-3/RN-8 (los cuatro motivos dan status, cuerpo y cabeceras idénticos byte a byte, con el
  mismo `X-Correlation-Id`). ISO-14 R-5 (mediana de 15 muestras intercaladas por motivo; la diferencia entre medianas queda por debajo
  de 25 ms).
- `apps/api/test/isolation/sharing-rls.iso-spec.ts` (SQL con dueño `NOSUPERUSER`, 46): ISO-15 a ISO-19 hacen `SELECT` sin `WHERE`
  como `nimbo_app` sobre `archivo`, `carpeta`, `version_archivo`, `comparticion`, `fragmento`, `indexacion`, `sesion_edicion` y
  `participacion` para B, C y A: B ve exactamente lo suyo más lo compartido vigente (sin versiones antiguas), C y A nada ajeno, y nada
  de A con A suspendida. ISO-20 a ISO-24: roles internos y `nodos_compartidos()`. ISO-25 a ISO-28: escrituras por SQL del destinatario
  (renombrar, borrar, versiones, índices, fragmentos, subir de nivel, recompartir, sesión como Lector) rechazadas. ISO-29 a ISO-37:
  riesgos de los developers (abajo).

**Revisión de `nodos_compartidos()`** (`apps/api/src/migrations/20261101100000-crear-comparticion.ts:79-85`): ✅. `SECURITY DEFINER`,
`STABLE` y **sin parámetros**: pedirla con un argumento falla (ISO-22). `SET search_path = pg_catalog, pg_temp` pone `pg_temp` al final
y el cuerpo nombra todo con `public.` (no se puede sombrear). `REVOKE ALL … FROM PUBLIC` deja `EXECUTE` solo al dueño y a `nimbo_app`,
y `nimbo_app` no tiene `CREATE` en `public` (ISO-23). Las tres políticas `*_nodos_compartidos` son `FOR SELECT TO CURRENT_USER`, quedan
atadas al dueño restringido y se acotan a `nimbo_actor_id()` (ISO-24). Devuelve vacío sin actor, con un rol interno, para quien no
recibió nada y para la propia propietaria (ISO-20, ISO-21). El actor no se puede elegir por parámetro; sí por la GUC (SEC-5).

**Hallazgos**
- **[SEC-2] alta, bloqueante** · `apps/api/src/migrations/20261101100200-politicas-rls-edicion-y-agente-compartidos.ts:43-46` junto con
  `apps/api/src/migrations/20261018100000-crear-sesion-edicion-y-participacion.ts:81-84`. Riesgo: el Editor cambia por SQL `estado`,
  `motivo_fallo`, `finalizada_en` o `version_base_id` de la sesión de la propietaria (ISO-32). Además **se queda con ella**: un
  `UPDATE … SET propietario_id = <Editor>` pasa porque `USING` lo cumple `sesion_edicion_compartida_bloqueo` y `WITH CHECK` lo cumple
  `sesion_edicion_cliente`, y las políticas permisivas se combinan con OR (ISO-33). Desde ahí `participacion_cliente` le da escritura
  sobre las participaciones de esa sesión, es decir, sobre la autoría de la versión (diferenciador 2). Contradice spec §5 («riesgo
  central») y CA-21 («la base lo niega»). Corrección: (a) una política `AS RESTRICTIVE` en `sesion_edicion` para `INSERT`/`UPDATE`
  con `SESSION_OF_FILE_OWNER`; (b) un trigger `BEFORE UPDATE` que rechace `NEW IS DISTINCT FROM OLD` cuando
  `nimbo_actor_id() <> OLD.propietario_id` (`SELECT … FOR UPDATE` no dispara triggers, así el bloqueo del Editor sigue funcionando).
  **Resuelto** (T-FIX-1): bastó (a), sin trigger. En la migración C, `sesion_edicion_cambio_de_la_propietaria`
  (`AS RESTRICTIVE FOR UPDATE`, `WITH CHECK`: el actor es la propietaria y ningún archivo que ve es de otra cuenta; no exige que el
  archivo exista, para marcar `fallida` la sesión de uno purgado) y `sesion_edicion_compartida_bloqueo` con `WITH CHECK (false)`. El
  bloqueo `FOR UPDATE` solo evalúa el `USING`, así que el Editor sigue serializando su entrada. Además, el Editor solo da de alta o
  cierra su participación mientras la sesión está abierta (`activa`/`guardando`): no se suma a la autoría de una versión ya guardada
  (ISO-38 nueva). ISO-32 ahora espera el rechazo de RLS (antes, cero filas).
- **[SEC-1] alta, importante** · `apps/api/src/migrations/20260930100300-politicas-rls-archivo-version-carga.ts:24-27`,
  `apps/api/src/migrations/20261001100200-rls-carpeta-y-purga-de-papelera.ts:21-24`, la FK sin `ON DELETE` de
  `apps/api/src/migrations/20261001100100-carpeta-y-papelera-en-archivo-y-carga.ts:23` (y la de `carpeta.eliminado_con_carpeta_id`), y
  `apps/api/src/migrations/20261101100000-crear-comparticion.ts:48`. Riesgo: los `WITH CHECK` no exigen que `carpeta_id`,
  `carpeta_padre_id` o `eliminado_con_carpeta_id` sean del actor. Un Lector cuelga archivos y carpetas propios de la carpeta compartida
  (ISO-29, ISO-30). Con un archivo propio en la papelera atado a esa carpeta, la purga de la propietaria falla con
  `archivo_eliminado_con_carpeta_id_fkey` (ISO-31): un 500 en `DELETE /trash/folders/:id` y en la purga vencida. Además,
  `nodos_compartidos()` une los archivos por `carpeta_id` sin comparar el propietario (línea 48): con un dueño superusuario, otros
  destinatarios verían el archivo colgado dentro de la carpeta de A. El hueco viene de 005/006, pero desde la 012 los ids llegan a los
  destinatarios. Corrección: FK compuestas `(carpeta_id, propietario_id) → carpeta(id, propietario_id)` (y lo mismo para
  `carpeta_padre_id` y `eliminado_con_carpeta_id`, con `UNIQUE (id, propietario_id)`), que evitan la recursión de una política de
  `carpeta` sobre `carpeta`; y `AND a.propietario_id = r.propietario_id` en la línea 48.
  **Resuelto** (T-FIX-2): FK compuestas en la migración nueva `20261101100400-carpeta-del-mismo-propietario.ts` (las FK son de
  005/006), con `uq_carpeta_id_propietario` y `ON DELETE SET NULL (columna)` para no anular `propietario_id`. Se eligieron frente
  a un `WITH CHECK` porque la integridad referencial no pasa por RLS (vale para todo rol, también el dueño) y no recurre sobre
  `carpeta`. `nodos_compartidos()` compara el propietario al unir los archivos de cada carpeta. ISO-29/30/31 esperan el error de
  la FK; ISO-4 de `agent.iso-spec.ts` (020), que forzaba esa fila como dueño, ahora comprueba que ya no se puede.
- **[SEC-4] media, importante** · `apps/api/src/migrations/20261018100000-crear-sesion-edicion-y-participacion.ts:52,81-84`. Riesgo:
  `sesion_edicion_cliente` solo exige `propietario_id = actor`, y `archivo_id` no tiene FK. Un Lector, o cualquier cliente que conozca
  el id, inserta una sesión `activa` a su nombre sobre un archivo ajeno (ISO-34). Como `uq_sesion_edicion_abierta` es global por
  archivo, la propietaria ya no puede abrir el editor (denegación de servicio). Viene de la 016; la 012 entrega los ids. Corrección: la
  misma política restrictiva de SEC-2 y una FK a `archivo`.
  **Resuelto** (T-FIX-1): `sesion_edicion_alta_de_la_propietaria` (`AS RESTRICTIVE FOR INSERT`) exige que
  `propietario_id` sea el dueño de un archivo que el actor ve, para la propietaria y para el Editor. Sin FK a `archivo`: DF-70 la
  descarta a propósito (la purga no borra la evidencia de una sesión `fallida`) y la política ya niega un id ajeno o inexistente.
- **[SEC-3] media, sugerencia** · `apps/api/src/migrations/20261101100300-auditoria-al-salir-de-comparticion.ts:16-25`. Riesgo: mientras
  existe su acceso, el destinatario puede escribir en «Mi actividad» de la propietaria cuantos `share.revoked` quiera, con `atributos`
  libres (texto de phishing) y `ocurrido_en` arbitrario (ISO-37). Lo demás se rechaza: otras acciones, nodos heredados, otro afectado,
  un tercero, y leer, cambiar o borrar la actividad ajena (ISO-35, ISO-36). Corrección: en el `WITH CHECK`, exigir
  `atributos = jsonb_build_object('nodeType', …, 'level', c.nivel)` y que `ocurrido_en` caiga en una ventana corta alrededor de `now()`.
- **[SEC-5] baja, informativa** · `apps/api/src/shared/infrastructure/persistence/typeorm-transaction-runner.ts:15`. `app.actor_id` es
  una GUC que cualquier SQL de `nimbo_app` puede fijar, así que la base no ata el actor a una identidad (riesgo aceptado en ADR-0005).
  Lo mitigan `withActor`, que es el único que la fija y valida UUID y rol, y la regla de lint `rls.js`. No se agregó una prueba que
  fije la GUC a mano: el lint lo prohíbe.
- **[SEC-6] baja, sugerencia** · `apps/api/src/migrations/20261101100000-crear-comparticion.ts:9-12,143-152`. `archivo/carpeta_nodos_compartidos`
  dejan al dueño ver **todos** los nodos vivos de quien compartió algo con el actor, no solo el subárbol compartido. Hoy solo se
  alcanza dentro del cuerpo de la función (la app no corre como dueño); si otro `SECURITY DEFINER` reutiliza al dueño, conviene acotarlas.

**Checklist**
- [x] `actor` en los casos de uso; lecturas con `accessibleNodes`, escrituras con `ownedNodes` (ISO-1 a ISO-7 y `storage-shared-writes.iso-spec.ts`).
- [ ] RLS como segunda barrera en escrituras: SEC-1, SEC-2, SEC-4.
- [x] `nodos_compartidos()`: `SECURITY DEFINER`, `search_path`, sin `PUBLIC`, políticas `TO CURRENT_USER` (ISO-22 a ISO-24).
- [x] Roles internos sin filas ni rutas (ISO-9, ISO-20); sin token, 401 (ISO-10).
- [x] CA-3 sin diferencia de cuerpo, cabeceras ni tiempo observable (ISO-13, ISO-14); límite de CA-7 en `shares.int-spec.ts`.
- [x] Destinatario sin versiones antiguas, sin escribir versiones, índices ni fragmentos (ISO-18, ISO-26); el agente cita lo compartido y nada más (`agent.iso-spec.ts`, T-09).
- [ ] Auditoría de Salir sin eventos falsificables (SEC-3).
- [x] Sin dependencias nuevas en T-10.
