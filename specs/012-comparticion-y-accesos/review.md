# Revisión 012 — Compartición y accesos (API)

> Una página. La escribe `reviewer` (con `security-auditor` solo si aplica, `workflow.md` §4) y la aprueba Adrián.

| Campo | Valor |
|---|---|
| Fecha | 2026-10-30 |
| Rango revisado | `8676659..181325a` (rama `claude/fervent-shannon-bey1ow`, 25 commits; código en `apps/api`, `packages/contracts`, `packages/config`) |
| CI | Sin PR todavía; suites corridas en local (abajo) |
| Veredicto | 🔁 Cambios requeridos (B-1); T-12 (recorrido humano) sigue pendiente a propósito |

## Verificación
| CA | Prueba (`apps/api/…` salvo que se indique) | Estado |
|---|---|---|
| CA-1 | `test/int/sharing/shares.int-spec.ts` › «CA-1, CA-19: 201 con la entrada directa…»; `sharing.service.spec.ts` | ✅ |
| CA-2 | `shares.int-spec.ts` › «CA-2: `OWNER` o un nivel desconocido…»; `sharing/domain/user-share.spec.ts`; `packages/contracts/src/sharing.spec.ts` | ✅ |
| CA-3 | `shares.int-spec.ts` › «CA-3: inexistente, interna, sin verificar y suspendida…»; `test/isolation/sharing.iso-spec.ts` ISO-13/14; `test/int/identity/sharee-directory.int-spec.ts` | ✅ |
| CA-4 | `shares.int-spec.ts` › «CA-4: ajeno, inexistente, en la papelera, de otro tipo o donde es Editora…» | ✅ |
| CA-5 | `shares.int-spec.ts` › «CA-5: compartir otra vez cambia el nivel…»; `user-share.spec.ts` | ✅ |
| CA-6 | `shares.int-spec.ts` › «CA-6: en solo lectura…» y «CA-6: … revocar se permite» | ✅ |
| CA-7 | `shares.int-spec.ts` › «CA-7: superado el límite, 429…» | ✅ |
| CA-8 | `shares.int-spec.ts` › «CA-8: cada persona con nombre, correo…»; `sharing/domain/access-list.spec.ts` | ✅ |
| CA-9 | `shares.int-spec.ts` › «CA-9: Lector, Editora, ajeno…» y «CA-9: una consulta mal formada…» | ✅ |
| CA-10 | `shares.int-spec.ts` › «CA-10, CA-19: 204…»; `test/int/storage/shared-access.int-spec.ts` › «CA-10, CA-12» | ✅ |
| CA-11 | `shares.int-spec.ts` › «CA-11: ajeno, del que es destinatario, inexistente…» | ✅ |
| CA-12 | `shared-access.int-spec.ts` › «CA-12: …» (ficha, descarga 5 min, raíz, espacio y cuota, 404) | ✅ |
| CA-13 | `shared-access.int-spec.ts` › «CA-13: …»; `test/int/access/accessible-nodes-shared.int-spec.ts` › «CA-13: …» | ✅ |
| CA-14 | `test/isolation/storage-shared-writes.iso-spec.ts`; `sharing.iso-spec.ts` ISO-6/7; `sharing-rls.iso-spec.ts` ISO-25 a ISO-31; `shared-access.int-spec.ts` › «CA-14» | ✅ (S-5) |
| CA-15 | `test/int/editing/shared-editing.int-spec.ts` › «CA-15: …» (Editor, Lector, cierre, revocación) | ✅ |
| CA-16 | `test/isolation/agent.iso-spec.ts` ISO-16 a ISO-19 | ✅ |
| CA-17 | `accessible-nodes-shared.int-spec.ts` › «CA-17: con Ana suspendida…»; `sharing.iso-spec.ts` ISO-8 | ✅ |
| CA-18 | `shares.int-spec.ts` › «CA-18: en la papelera la compartición se conserva…» | ✅ |
| CA-19 | `shares.int-spec.ts` (CA-1 y CA-10: evento, `correlation_id`, logs sin correo ni nombre); `shares-received.int-spec.ts` › «CA-23, CA-19» | ✅ |
| CA-20 | `shares.int-spec.ts` › «CA-20: …»; `sharing.iso-spec.ts` ISO-9/10 (5 rutas y la ficha) | ✅ |
| CA-21 | `sharing.iso-spec.ts` ISO-1 a ISO-5; `sharing-rls.iso-spec.ts` ISO-15 a ISO-24; `accessible-nodes-shared.int-spec.ts` › «CA-21» | ✅ |
| CA-22 | `test/int/sharing/shares-received.int-spec.ts` › «CA-22: …» (3); `received-shares.service.spec.ts` | ✅ |
| CA-23 | `shares-received.int-spec.ts` › «CA-23: …» (4); `test/int/sharing/audit-leave-policy.int-spec.ts`; `sharing.iso-spec.ts` ISO-11/12 | ✅ |

**Suites** (tras `pnpm --filter @nimbo/contracts build`): `pnpm lint` ✅ · `pnpm typecheck` ✅ · `pnpm env:check` ✅ ·
`pnpm test` ✅ (api 298 suites/2874, web 218/1925, contracts 30/573, config 7/247, raíz 3/34) · `pnpm test:isolation` ✅
(30 suites, 581 pruebas) · `pnpm test:int`, dos corridas completas: 1.ª ❌ 173/176 suites (1732 pruebas), 2.ª 174/176 (1733 pruebas).
`test/int/shared/dotenv-bootstrap.int-spec.ts` falla en las dos y es **no verificable en este entorno** (necesita `.env` y
`docker compose`); `test/int/storage/node-tree.repository.int-spec.ts` R-2 falla solo en la 1.ª (intermitente, B-1).
Sin `deadlock`. **Cobertura** de `sharing` (unitarias): `domain` y `application` 100 % de líneas (`sharing.service.ts` 80,95 %
de ramas); `infrastructure` y `presentation` las cubren las suites de integración.

## Seguridad

**Veredicto: ✅ Sin bloqueantes** tras T-FIX-1 a T-FIX-3 (SEC-1 a SEC-4 resueltos; SEC-5 y SEC-6 quedan aceptados en PD-141).
Antes: ❌ Bloqueado por SEC-2 (escritura entre cuentas que esta spec introducía en `sesion_edicion`). Ninguna prueba encontró
**acceso a contenido** de otra cuenta: lectura, descarga, migas, agente y roles internos están bien aislados.

- Datos de cliente: sí. `actor` + `accessibleNodes`/`ownedNodes` + RLS: ✅ en lectura y, tras T-FIX-1 y T-FIX-2, en escritura por SQL.
- Bitácoras y auditoría sin nombres, correos ni claves: ✅ (cubierto en `test/int/sharing/shares.int-spec.ts`, CA-19; no se repite aquí).

**Pruebas ISO agregadas** (bloqueantes en CI; `pnpm test:isolation` en verde; los 6 `it.failing` de SEC-1 a SEC-4 pasaron a pruebas normales en T-FIX-1 a T-FIX-3, y T-FIX-1 sumó ISO-38).
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
  **Resuelto** (T-FIX-1, `35617f5`): bastó (a), sin trigger. En la migración C, `sesion_edicion_cambio_de_la_propietaria`
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
  **Resuelto** (T-FIX-2, `8f83020`): FK compuestas en la migración nueva `20261101100400-carpeta-del-mismo-propietario.ts` (las FK son de
  005/006), con `uq_carpeta_id_propietario` y `ON DELETE SET NULL (columna)` para no anular `propietario_id`. Se eligieron frente
  a un `WITH CHECK` porque la integridad referencial no pasa por RLS (vale para todo rol, también el dueño) y no recurre sobre
  `carpeta`. `nodos_compartidos()` compara el propietario al unir los archivos de cada carpeta. ISO-29/30/31 esperan el error de
  la FK; ISO-4 de `agent.iso-spec.ts` (020), que forzaba esa fila como dueño, ahora comprueba que ya no se puede.
- **[SEC-4] media, importante** · `apps/api/src/migrations/20261018100000-crear-sesion-edicion-y-participacion.ts:52,81-84`. Riesgo:
  `sesion_edicion_cliente` solo exige `propietario_id = actor`, y `archivo_id` no tiene FK. Un Lector, o cualquier cliente que conozca
  el id, inserta una sesión `activa` a su nombre sobre un archivo ajeno (ISO-34). Como `uq_sesion_edicion_abierta` es global por
  archivo, la propietaria ya no puede abrir el editor (denegación de servicio). Viene de la 016; la 012 entrega los ids. Corrección: la
  misma política restrictiva de SEC-2 y una FK a `archivo`.
  **Resuelto** (T-FIX-1, `35617f5`): `sesion_edicion_alta_de_la_propietaria` (`AS RESTRICTIVE FOR INSERT`) exige que
  `propietario_id` sea el dueño de un archivo que el actor ve, para la propietaria y para el Editor. Sin FK a `archivo`: DF-70 la
  descarta a propósito (la purga no borra la evidencia de una sesión `fallida`) y la política ya niega un id ajeno o inexistente.
- **[SEC-3] media, sugerencia** · `apps/api/src/migrations/20261101100300-auditoria-al-salir-de-comparticion.ts:16-25`. Riesgo: mientras
  existe su acceso, el destinatario puede escribir en «Mi actividad» de la propietaria cuantos `share.revoked` quiera, con `atributos`
  libres (texto de phishing) y `ocurrido_en` arbitrario (ISO-37). Lo demás se rechaza: otras acciones, nodos heredados, otro afectado,
  un tercero, y leer, cambiar o borrar la actividad ajena (ISO-35, ISO-36). Corrección: en el `WITH CHECK`, exigir
  `atributos = jsonb_build_object('nodeType', …, 'level', c.nivel)` y que `ocurrido_en` caiga en una ventana corta alrededor de `now()`.
  **Resuelto** (T-FIX-3, `b599cb8`): la política exige `atributos = jsonb_build_object('nodeType', tipo_recurso, 'level', c.nivel)` de esa
  compartición y `ocurrido_en` dentro de `now() ± 5 minutos` (holgura entre el reloj de la API y el de Postgres). ISO-37 prueba
  atributos de más, nivel falso y fecha antigua; `audit-leave-policy.int-spec.ts` escribe el evento exacto y suma los falsos.
- **[SEC-5] baja, informativa** (abierto, aceptado: PD-141) · `apps/api/src/shared/infrastructure/persistence/typeorm-transaction-runner.ts:15`. `app.actor_id` es
  una GUC que cualquier SQL de `nimbo_app` puede fijar, así que la base no ata el actor a una identidad (riesgo aceptado en ADR-0005).
  Lo mitigan `withActor`, que es el único que la fija y valida UUID y rol, y la regla de lint `rls.js`. No se agregó una prueba que
  fije la GUC a mano: el lint lo prohíbe.
- **[SEC-6] baja, sugerencia** (abierto: PD-141) · `apps/api/src/migrations/20261101100000-crear-comparticion.ts:9-12,143-152`. `archivo/carpeta_nodos_compartidos`
  dejan al dueño ver **todos** los nodos vivos de quien compartió algo con el actor, no solo el subárbol compartido. Hoy solo se
  alcanza dentro del cuerpo de la función (la app no corre como dueño); si otro `SECURITY DEFINER` reutiliza al dueño, conviene acotarlas.

**Checklist**
- [x] `actor` en los casos de uso; lecturas con `accessibleNodes`, escrituras con `ownedNodes` (ISO-1 a ISO-7 y `storage-shared-writes.iso-spec.ts`).
- [x] RLS como segunda barrera en escrituras: SEC-1, SEC-2, SEC-4 resueltos (T-FIX-1, T-FIX-2).
- [x] `nodos_compartidos()`: `SECURITY DEFINER`, `search_path`, sin `PUBLIC`, políticas `TO CURRENT_USER` (ISO-22 a ISO-24).
- [x] Roles internos sin filas ni rutas (ISO-9, ISO-20); sin token, 401 (ISO-10).
- [x] CA-3 sin diferencia de cuerpo, cabeceras ni tiempo observable (ISO-13, ISO-14); límite de CA-7 en `shares.int-spec.ts`.
- [x] Destinatario sin versiones antiguas, sin escribir versiones, índices ni fragmentos (ISO-18, ISO-26); el agente cita lo compartido y nada más (`agent.iso-spec.ts`, T-09).
- [x] Auditoría de Salir sin eventos falsificables (SEC-3 resuelto, T-FIX-3).
- [x] Sin dependencias nuevas en T-10.

> **Nota del reviewer sobre la sección «Seguridad»** (se conserva tal cual): los «Resuelto» se cumplen en el código (sin
> `it.failing` en `test/isolation` ni en `test/int/sharing`; ISO-29 a ISO-38 en verde), pero los commits citados `35617f5`,
> `8f83020` y `b599cb8` no están en la rama (son anteriores a un rebase). Los equivalentes, con el mismo `patch-id`, son
> `63970a8` (T-FIX-1), `bbb681f` (T-FIX-2) y `6814ee6` (T-FIX-3). Ver S-1.

## UI
- No aplica: la spec no tiene pantalla (la 012b). La web solo suma `accessLevel: 'OWNER'` a fixtures de pruebas.

## Bloqueantes
- **[B-1]** `apps/api/test/int/storage/node-tree.repository.int-spec.ts:36,244` — la prueba R-2 (006) falla en la corrida
  completa de `pnpm test:int` y pasa sola y en par con `accessible-nodes-shared.int-spec.ts` (falló en 1 de las 2 corridas completas de esta revisión, y
  también en una corrida del developer durante la 012).
  Desde la 012, la política `carpeta_compartida` (`20261101100100-politicas-rls-nodos-compartidos.ts:48-51`) suma subplanes de
  `nodos_compartidos()` a cada lectura de `carpeta`, y con las estadísticas que dejan las suites anteriores (contenedores
  compartidos por corrida, `jest.int.config.cjs`) el planificador elige `idx_carpeta_hijas`, que es un índice de propietario y no
  usa `Seq Scan`, pero no está en `ROOT_INDEXES`. El arreglo de T-04 (`accessible-nodes-shared.int-spec.ts:255-257`) no alcanza. —
  viola: suite en rojo y prueba que depende del orden (Art. VII; `review-template`). — corrección: que R-2 mida su propio
  estado (`ANALYZE archivo, carpeta` dentro de la prueba, antes del `EXPLAIN`) y que `ROOT_INDEXES` acepte los índices de
  propietario de 006 (`idx_carpeta_hijas`); la aserción que importa es «sin `Seq Scan`».

## Importantes y sugerencias
- **[I-1]** `specs/012-comparticion-y-accesos/spec.md:120`, `plan.md:107` — la ruta nueva `GET /files/:fileId` (CA-12) figura
  como «aprobación de Adrián pendiente». Sin spec aprobada no hay código: Adrián la ratifica en el PR (y se anota «Aprobó») o se
  retira de `files.controller.ts` y `FileService.getDetail`.
- **[I-2]** `plan.md:118-119` (§5), `plan.md:27-28` y `plan.md:96` (§2, §3) — el plan no muestra lo construido: el orden real de
  `share` es destinatario → solo lectura (`sharing.service.ts:152-172`); hay migraciones C, D y E (`20261101100200`, `…300`,
  `…400`) y `ReceivedSharesService`/`ReceivedSharesController`, que el plan no nombra. Las desviaciones solo están en las «Notas
  del developer» de `tasks.md`. Corrección: una fila por desviación en el «Registro de cambios» de la spec (o en el plan §7)
  para que Adrián las ratifique junto con I-1. La del orden cambia la respuesta: en solo lectura, un correo sin cuenta da `422`
  y no `403`.
- **[I-3]** `docs/sdd/design-model.md:121-133` (M3a, M3b), `:55-81` (M1), `:207-212` (T2), `:255` (§4) — el plan §7
  (`plan.md:168`) pide actualizarlos en este PR y solo cambió una línea de M2. Faltan: `ownedNodes` y `nodos_compartidos()` en
  M3a; `SharingController` + `ReceivedSharesController`, `SharingService` + `ReceivedSharesService`, `IShareRepository`,
  `IShareeDirectory` y `AccessGrant`/`PublicLinkService` diferidos en M3b; `ShareeDirectoryAdapter` en M1; `SHARE_GRANTED`,
  `SHARE_LEVEL_CHANGED`, `SHARE_REVOKED` y la política de Salir en T2; columnas, índices y RLS de `comparticion` en §4.
- **[I-4]** `docs/sdd/architecture.md:118` (§3 regla 3) y `:215` (§6 punto 3) — no dicen que `access` lee `usuario.estado` en
  `nodos_compartidos()` (la excepción que DF-85 declara «documentada» en §3 regla 3) ni que las escrituras y los destinos usan
  `ownedNodes`. Agregar una línea en cada uno.
- **[I-5]** `docs/sdd/design-findings.md:42,111,112` — DF-31 sigue «Abierto (… pasa a `Aceptado` con la aprobación de
  Adrián)» y DF-84/DF-85 «Abierto (propuesto; pide al `architect`)», aunque el plan está aprobado y el §8 recoge la aceptación
  de Adrián. Pasarlos a `Aceptado (plan 012, 2026-10-30)`, con lo aplicado.
- **[S-1]** `review.md`, sección «Seguridad»: que el `security-auditor` cambie los hashes por `63970a8`, `bbb681f` y `6814ee6` (o
  los quite, porque el squash merge los cambia de nuevo).
- **[S-2]** `apps/api/src/modules/sharing/infrastructure/persistence/typeorm-share.repository.ts:122` — el comentario «su
  propietario (revocar, CA-10)» no cubre `recipient` (Salir, CA-23): «Quién borra la fila: el propietario (revocar) o el
  destinatario (Salir)».
- **[S-3]** `test/int/sharing/shares.int-spec.ts:101,311`, `shares-received.int-spec.ts:121,130` — todas las cuentas de prueba
  se llaman «Ana López», así que estas pruebas HTTP pasarían aunque el nombre del destinatario y el del propietario se
  cruzaran (las unitarias sí lo distinguen). Usar nombres distintos en `newClient`.
- **[S-4]** `test/isolation/sharing.iso-spec.ts:453` (ISO-14) mide tiempo real, con una tolerancia de 25 ms, en una suite que
  bloquea. Si falla en CI, subir las muestras o pasarlo a un job que no bloquee; no relajar ISO-13.
- **[S-5]** `test/isolation/storage-shared-writes.iso-spec.ts:51-139` — CA-14 nombra «restaurar» y «reemplazar» y la lista no los
  tiene: hoy los cubren `ownedTrashedNodes` y el destino de `POST /uploads`. Agregar `POST /trash/files/:id/restore` y
  `POST /uploads` con `onConflict: 'replace'` cuesta dos filas.

## DF y pendientes
- DF-31, DF-84, DF-85: existen y describen lo hecho; el estado está desactualizado (I-5).
- PD-108 cerrado (T-09) ✅ · PD-134 parcial (queda la 017) ✅ · PD-137 a PD-141 abiertos y coherentes con la spec y la
  sección «Seguridad» ✅.
- PD-109 (`pendientes.md:103`) dice «Resuelto (012 T-09)» y sigue en la tabla de abiertos: moverlo a «Cerrados».
- PD-121 (`pendientes.md:127`): anotar que la parte de la 012 está hecha (T-03 exporta la política, T-06 la aplica) y quitar
  «aceptar (012)», porque no existe; quedan 013 y 021.

## Documentos del plan §7
`architecture.md` §3 (fila `identity`) ✅, §5 (`IShareeDirectory`) ✅, §6 punto 10 ✅, §3 regla 3 y §6 punto 3 ❌ (I-4) ·
`design-model.md` M3a, M3b, M1, T2 y §4 ❌ (I-3) · READMEs de `sharing`, `access`, `storage` e `identity` ✅ · `.env.example`
(`SHARING_RATE_LIMIT_PER_MINUTE`) ✅. **Pendiente humano:** T-12 (recorrido de la demo); no es bloqueante de código.

## Lo que está bien hecho
- La regla «qué se comparte conmigo» vive una sola vez, en `nodos_compartidos()`, y la usan el fragmento de `access`, las
  políticas RLS y `listReceived`. Las escrituras pasaron a `ownedNodes` (T-03) **antes** de abrir las lecturas (T-04).
- La autorización está dentro de la consulta: el alta es `INSERT … SELECT … WHERE nodo IN ownedNodes`, y revocar y Salir borran
  con la parte en el `WHERE`. Lo ajeno da un 404 uniforme y los cuatro motivos de CA-3 dan respuestas idénticas byte a byte.
- Las FK compuestas de T-FIX-2 resuelven SEC-1 sin una política recursiva y valen para todo rol.
- SRP (`ReceivedSharesService` aparte), DRY (`share-records.ts`) y funciones cortas con ≤ 3 parámetros. Las pruebas nombran su
  CA y cubren errores y límites.

## Veredicto
🔁 **Cambios requeridos.** Hay un solo bloqueante, B-1, y es de pruebas: la funcionalidad está completa y los 23 CA tienen
prueba. Con B-1 corregido y `pnpm test:int` en verde en una corrida completa, el veredicto pasa a ✅. Antes del merge conviene
cerrar I-1 e I-2 (Adrián las ratifica) e I-3 a I-5 (documentos). Las sugerencias quedan a criterio del equipo.
