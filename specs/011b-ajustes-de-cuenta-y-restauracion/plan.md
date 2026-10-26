# Plan 011b — Ajustes de cuenta y restauración por Soporte

> Spec: `./spec.md` · Estado del plan: **Propuesto** (2026-10-22, revisado el 2026-10-26)
> Obligatorio y ≤ 250 líneas. Dice qué archivos se tocan y qué se espera de cada uno; no es el código en prosa.
> Lo aprueba Adrián antes de escribir código. **PR-A** (cuota y vigencia) en `feat/011b-ajustes`, desde `main`; **PR-B**
> (restauración) en `feat/011b-restauracion`, rama nueva desde `main` cuando el PR-A esté integrado. No se apilan.
> El **ADR-0035** se acepta antes del código del PR-A (§7).

## 1. Resumen técnico
- **PR-A.** `suscripcion` gana `cuota_extra_bytes` y `cuota_extra_hasta`; la cuota efectiva es la del plan más el extra
  mientras `ahora < cuota_extra_hasta`, calculada al leer (sin job ni evento de expiración, RN-1). `PlanLimitsAdapter`
  la suma, `PlanLimits` y el resumen de espacio exponen base, extra y fecha, y la ficha del Administrador gana el bloque
  «Límites y vigencia» con ajustar/quitar cuota y extender vigencia.
- La escritura del Administrador sobre `suscripcion` **no** abre una política UPDATE a `nimbo_app`: dos funciones
  `SECURITY DEFINER` de escritura (`ajustar_cuota_extra`, `extender_vigencia`) comprueban el rol `ADMIN`, bloquean
  `usuario` y `suscripcion`, validan y escriben una fila por `usuario_id`; una política `UPDATE TO CURRENT_USER`
  acotada permite que la función escriba bajo `FORCE RLS`. Una tercera función de lectura (`limites_de_cuenta`,
  `STABLE`, sin `FOR UPDATE`) devuelve la vista para `limitsOf`; sin ella `nimbo_app` no puede leer `suscripcion`.
  Las de escritura devuelven un código de resultado y la vista nueva; el repositorio traduce el código a errores de
  dominio. No hay una función de bloqueo separada ni una regla TS que duplique la de SQL.
- La vigencia solo se extiende: `vence_en` nuevo y `estado` a `vigente` si estaba en solo lectura; **no toca los avisos**,
  `iniciado_en`, `renovacion_automatica` ni `plan_pendiente_id` (RN-2, CA-8): el `vence_en` nuevo basta para la 010.
- **PR-B.** `storage` gana una fachada `SupportTrashService` owner-scoped que lista raíces y restaura con una función
  `SECURITY DEFINER` (`restaurar_raiz_papelera`). La función comprueba dueño, raíz, retención y destino, reubica el
  subárbol **mientras sigue en papelera** y escribe solo las columnas permitidas. No reutiliza `TrashService`
  (actor-scoped, exige cuenta escribible y audita fuera de la transacción) ni `WritableAccountPolicy`.
- No hay políticas `UPDATE` de Soporte sobre `nimbo_app`; las políticas del dueño (`TO CURRENT_USER`) solo las usan las
  funciones. La auditoría `node.restored` con `note` se escribe en la misma transacción.
- Contratos nuevos: ajustes de cuenta y papelera de Soporte; se amplían `spaceSummary` y la actividad del cliente.
- Pruebas: unitarias del mapeo de códigos/errores, integración por endpoint (incluidos los códigos de resultado de SQL), aislamiento bloqueante (RNF-05) y componentes con axe.

## 2. Módulos, archivos y diseño
| Módulo / capa | Archivo (nuevo o cambiado) | Responsabilidad |
|---|---|---|
| contracts/backoffice | `src/backoffice/adjustments.ts` (nuevo), `error-codes.ts`, `schemas.ts`, `index.ts` | `accountLimitsSchema` (`status: active \| readOnly \| personal \| none`; base y total `null` sin suscripción), `adjustQuotaRequestSchema`, `adjustValidityRequestSchema`, códigos y `BACKOFFICE_FIELD_ISSUE_REASONS` nuevos. Valida forma: bytes como texto decimal (011), patrón `^[1-9][0-9]{0,15}$` para `PUT` (cero se quita con `DELETE`) y que cada valor no supere `2^53-1`; fecha `YYYY-MM-DD`. No conoce la cuota del plan ni valida la suma; eso queda en SQL. |
| contracts/backoffice | `src/backoffice/trash.ts` (nuevo), `index.ts` | `clientTrashResponseSchema` (reutiliza `trashItemSchema` de `storage` y añade `client`), `restoreClientNodeRequestSchema` con `type`, `email` y `note` de 1 a `AUDIT_NOTE_MAX_LENGTH`; reutiliza `restoreResponseSchema`. |
| contracts/storage | `src/storage/space-schemas.ts`, `src/storage/schemas.spec.ts` | `baseQuotaBytes`, `extraQuotaBytes`, `extraQuotaUntil` (aquí bytes numéricos, como el resto de `storage`); `quotaBytes` sigue siendo la efectiva. |
| billing/domain | `subscription-adjustment.ts` (nuevo) + spec | Convierte `YYYY-MM-DD` a las 00:00 del día siguiente en `America/Guatemala` (06:00 UTC); no mapea códigos de SQL. No repite las reglas que dependen del estado; la fuente de verdad de esas reglas es la función SQL. |
| billing/domain/errors | `quota-below-usage.error.ts`, `quota-invalid.error.ts`, `validity-not-extended.error.ts` (nuevos) | Errores de la regla en el módulo dueño (`billing`), no en `backoffice`; el controlador los traduce a §4. |
| billing/application | `subscription-administration.ts` (cambia) | `limitsOf(actor, clientId)` usa `limites_de_cuenta`; `adjustQuota(actor, cmd)` y `adjustValidity(actor, cmd)` usan las funciones de escritura. Devuelven la vista nueva, todo dentro de la transacción del llamador. `cmd` lleva `clientId` (máximo 3 parámetros, Art. VII.2). |
| billing/application/ports | `i-subscription-administration.repository.port.ts` (nuevo) | `limitsOf(actor, clientId)`, `adjustQuota(actor, cmd)` y `adjustValidity(actor, cmd)`; no agranda `ISubscriptionRepository` (V.2). No hay `lockSnapshot` separado: la función de escritura bloquea y valida. |
| billing/infrastructure | `typeorm-subscription-administration.repository.ts` (nuevo) | Llama a `limites_de_cuenta`, `ajustar_cuota_extra` y `extender_vigencia` (§3) desde el `EntityManager` del actor y traduce los códigos de resultado. |
| billing/infrastructure | `adapters/plan-limits.adapter.ts`, `i-subscription-repository.port.ts`, `typeorm-subscription.repository.ts` | `SubscriptionStanding` suma `extraQuotaBytes` y `extraQuotaUntil`; `limitsFor` inyecta `IClock` y suma el extra vigente a `storageQuotaBytes`. |
| billing | `billing.module.ts` | Registra el puerto y el repositorio nuevos; exporta los errores de dominio. |
| storage/application | `plan-limits.ts` | `PlanLimits` suma `extraQuotaBytes` y `extraQuotaUntil` (solo el vigente); `PlanStorageLimits` los omite y actualiza dobles de prueba. |
| storage/application | `space-summary.service.ts`, `presentation/space.controller.ts` | `baseQuotaBytes`, `extraQuotaBytes`, `extraQuotaUntil`; `availableBytes` ya usa la cuota efectiva. |
| backoffice/application | `account-adjustments.service.ts` (nuevo) | Compone `InternalActionService` + `AccountDirectory` + `SubscriptionAdministration`; traduce los errores de dominio a §4 y arma los eventos. No crea un candado de uso nuevo. |
| backoffice/application | `internal-action.service.ts` | `event` puede devolver `AuditRecord` o una lista; `run` normaliza ambos con `Array.isArray`, así los llamadores actuales no cambian. La salida de solo lectura suma `subscription.read_only_exited` al evento de vigencia; se prueba con los llamadores existentes. |
| backoffice/presentation | `account-adjustments.controller.ts`, `account-limits.response.ts` (nuevos) | Rutas de §4 con `@Roles(ADMIN)` y respuesta de lista blanca; `accountIdPipe` ya existe. |
| backoffice | `backoffice.module.ts` | Registra servicio y controlador. |
| audit | `audit-action.ts`, `audit-catalog.ts`, `audit.service.ts` | `ACCOUNT_QUOTA_ADJUSTED`, `ACCOUNT_VALIDITY_ADJUSTED` y `note: 'text'` solo en `NODE_RESTORED`; `recordLine` omite los atributos de texto libre (`note`, `reason`) y registra solo sus claves. |
| storage/application | `support-trash.service.ts` (nuevo) | Fachada pública con `list(actor, query)` (`query` lleva `ownerId`, `cursor` y `limit`) y `restore(actor, cmd)`; no reutiliza `TrashService` ni `WritableAccountPolicy`. |
| storage/application/ports | `i-support-trash.repository.port.ts` (nuevo) | `listRoots(actor, query)` y `restoreRoot(actor, cmd)`; sin `findRoot` separado, porque la función valida la raíz y el destino. `query` y `cmd` mantienen dos parámetros (Art. VII.2) y `query` incluye `limit`. |
| storage/infrastructure | `typeorm-support-trash.repository.ts` (nuevo) | SQL de raíces (`eliminado_con_carpeta_id IS NULL`) con `purgar_en > now()`, nombre original y `ruta`; la restauración llama a `restaurar_raiz_papelera` y no usa `rebaseSubtree` desde la aplicación. |
| storage | `storage.module.ts`, `index.ts`, `storage.module.spec.ts`, `index.spec.ts` | Exporta la fachada y su token; actualiza las listas exactas de exportaciones. |
| backoffice/application | `client-trash.service.ts` (nuevo) | Resuelve el correo con `AccountDirectory.findClientByEmail` (mismo 404 para interna o inexistente), ejecuta `internal.run` y audita `client.files_viewed` al listar y `node.restored` al restaurar. |
| backoffice/presentation | `client-trash.controller.ts`, `client-trash.response.ts` (nuevos), `backoffice-validation.ts` | `@Roles(SUPPORT)`; pipe de `nodeId` a `NodeNotFoundError`; `GET` reutiliza `InvalidBackofficeQueryError` (`400`); `POST` valida `email`, `note` y `type` con `422 BACKOFFICE_INVALID_INPUT` y `fields`. |
| backoffice/domain/errors | `invalid-backoffice-input.error.ts` (nuevo) | `422 BACKOFFICE_INVALID_INPUT`; no se crea otra clase con `BACKOFFICE_INVALID_QUERY`. |
| web/backoffice | `api.ts`, `hooks/use-account-limits.ts`, `hooks/use-client-trash.ts` (nuevos) | Llamadas a §4; estados `loading`, `ready`, `notFound`, `forbidden`, `error` como `use-account`. |
| web/backoffice | `components/account-limits.tsx`, `quota-adjust-dialog.tsx`, `validity-adjust-dialog.tsx`, `form-dialog.tsx` (nuevos), `account-profile.tsx`, `error-catalog.ts` | Bloque «Límites y vigencia»: cuota del plan, extra, total y vencimiento; GB con `bytesOf`/`amountAndUnit` (base 1024) y fecha en hora de Guatemala; diálogos con total resultante antes de confirmar. `FormDialog` es nuevo (con prueba y axe); `ConfirmDestructiveDialog` queda para «Quitar extra». |
| web/backoffice | `components/support-trash.tsx`, `client-trash-table.tsx`, `trash-restore-dialog.tsx` (nuevos), `a11y.spec.tsx` | Pantalla de papelera con buscador exacto, lista de raíces, vacía/cargando/error, confirmación con motivo y los tres resultados; axe a 360 y 1440 px. |
| web/app | `app/(app)/(interno)/soporte/papelera/page.tsx` (nuevo) | Ruta de Soporte; `INTERNAL_PATHS.supportTrash` y la navegación interna en `home-path.ts` e `internal-area-layout.tsx`. |
| web/storage | `space-summary-view.tsx`, `sidebar-quota.tsx` | Nota «Tu cuota incluye <X> GB extra hasta el <fecha>» cuando `extraQuotaBytes > 0`; desaparece al vencer. |
| web/audit | `activity-labels.ts` + spec | Textos de `account.quota_adjusted` y `account.validity_adjusted`; `node.restored` y el bloque de `note` ya existen. |
| web/lib, web/billing, billing/application | `lib/format-date.ts` + spec, `subscription-copy.ts`, `payment-form.tsx`, `renewal-payment.tsx`; `billing-date.ts` + spec, `renewal-messages.ts` | `lastDayLabel`, `longLastDayLabel` y `formatBillingLastDay` muestran un instante de fin como el último día en que rige (día de Guatemala de `instante − 1 ms`, RN-8). Los usan la ficha, la nota del resumen de espacio y las vistas y correos de la 010 que dicen «vence», «venció» o «hasta»; las demás fechas («se aplica el», «empieza el») no cambian. |

- **Puertos nuevos:** `ISubscriptionAdministrationRepository` (billing), `ISupportTrashRepository` (storage) y la fachada
  `SupportTrashService`. Sin `IAccountUsageLock`: las funciones de escritura de §3 bloquean `usuario` y validan el uso en
  la misma transacción; una carga ya autorizada puede terminar después por encima de la cuota (`architecture.md` §7.2).
- **Dependencias:** `backoffice → identity, billing, storage, audit` (ya existe); `billing → identity` ya existe
  (evento `identity.client-account-verified`, `VerifiedClientLister`, `AccountContactReader` y `AccountNotFoundError`)
  y `storage` sigue sin importar `billing` (recibe la cuota por `IPlanLimitsProvider`).
- **Permisos por módulo (workflow.md §5):** `billing` es de Juan Marcos (dominio, aplicación, adaptador de límites,
  módulo y migración de `suscripcion`); `storage`, `identity` y `audit` son de Adrián; `backoffice`, `contracts` y `web`
  son de Fátima. El visto bueno de Juan Marcos para `billing` y el de Adrián para las escrituras de `storage` son parte
  de la aprobación; el ADR-0035 los registra como decisores.
- **Frontend:** la ficha reutiliza `ProfileCard`, `Fact`, `StateView`, `Alert`, `ConfirmDestructiveDialog` y `PagePager`;
  la papelera reutiliza `FileTypeChip`, `StateView`, `LoadMore` y `formatBytes` de `contracts`. Sin mockups en `apps/web`
  (se referencian desde `docs/design/mockups/`, prohibido importarlos).

## 3. Datos
```sql
-- 20261022100000-cuota-extra-y-ajuste-de-vigencia.ts (PR-A)
ALTER TABLE suscripcion
  ADD COLUMN cuota_extra_bytes bigint NOT NULL DEFAULT 0,
  ADD COLUMN cuota_extra_hasta timestamptz,
  ADD CONSTRAINT ck_suscripcion_cuota_extra CHECK (
    cuota_extra_bytes >= 0 AND cuota_extra_bytes <= 9007199254740991
    AND ((cuota_extra_bytes = 0) = (cuota_extra_hasta IS NULL)));

DROP POLICY suscripcion_cliente_alta ON suscripcion;
CREATE POLICY suscripcion_cliente_alta ON suscripcion FOR INSERT TO nimbo_app
  WITH CHECK (nimbo_actor_role() = 'CLIENT' AND usuario_id = nimbo_actor_id()
              AND cuota_extra_bytes = 0 AND cuota_extra_hasta IS NULL);
-- Sin GRANT UPDATE (cuota_extra_*) a nimbo_app: el cliente no puede subirse la cuota.
CREATE POLICY suscripcion_ajuste_administracion ON suscripcion FOR UPDATE TO CURRENT_USER
  USING (nimbo_actor_role() = 'ADMIN') WITH CHECK (nimbo_actor_role() = 'ADMIN');

-- Las dos funciones de escritura son VOLATILE, plpgsql, SECURITY DEFINER, SET search_path = pg_catalog, pg_temp,
-- con public.nimbo_actor_role() calificado, REVOKE ALL FROM PUBLIC y EXECUTE solo a nimbo_app.
-- limites_de_cuenta es STABLE, SECURITY DEFINER, sin FOR UPDATE; comprueba ADMIN, usa la política SELECT
--   suscripcion_administracion y devuelve la vista (0 filas = status none); no escribe, no bloquea ni usa UPDATE.
-- Las funciones SQL son la fuente de verdad de las reglas que dependen del estado; el dominio solo convierte la fecha
-- y el repositorio traduce los códigos de resultado a errores. Rol distinto de ADMIN: RAISE SQLSTATE 42501.
-- ajustar_cuota_extra(p_usuario, p_extra, p_hasta) bloquea usuario y suscripcion (FOR UPDATE) y devuelve
--   codigo, plan, estado, vence_en, extra, hasta, espacio_usado y cuota_total.
--   PUT exige p_extra > 0 y p_hasta > now(); DELETE llama con 0/NULL (única vía para quitar).
--   plan + p_extra <= 2^53-1 y >= espacio_usado; no toca vence_en, estado ni avisos; actualiza actualizado_en.
--   Códigos: ok, quota_invalid, quota_below_usage, account_not_found, no_subscription.
-- extender_vigencia(p_usuario, p_vence) bloquea usuario y suscripcion y devuelve la misma vista.
--   Exige plan de pago, p_vence > now() y p_vence > la medianoche de Guatemala que cierra el día de
--   (vence_en - 1 ms), es decir, un día posterior al que se muestra (spec RN-8); calcula estado (solo_lectura -> vigente) y no toca avisos,
--   plan_pendiente_id ni renovacion_automatica.
--   Códigos: ok, validity_not_extended, personal, account_not_found, no_subscription.
-- Las de escritura comprueban una fila por usuario_id (RAISE si el conteo interno no cuadra); la de lectura devuelve 0 o 1.

-- 20261022100100-soporte-restaura-la-papelera.ts (PR-B)
CREATE POLICY archivo_soporte_restauracion ON archivo FOR UPDATE TO CURRENT_USER
  USING (nimbo_actor_role() = 'SUPPORT' AND eliminado_en IS NOT NULL)
  WITH CHECK (nimbo_actor_role() = 'SUPPORT');
CREATE POLICY carpeta_soporte_restauracion ON carpeta FOR UPDATE TO CURRENT_USER
  USING (nimbo_actor_role() = 'SUPPORT' AND eliminado_en IS NOT NULL)
  WITH CHECK (nimbo_actor_role() = 'SUPPORT');
CREATE POLICY carpeta_soporte_destino ON carpeta FOR SELECT TO CURRENT_USER
  USING (nimbo_actor_role() = 'SUPPORT' AND eliminado_en IS NULL);
CREATE POLICY archivo_soporte_destino ON archivo FOR SELECT TO CURRENT_USER
  USING (nimbo_actor_role() = 'SUPPORT' AND eliminado_en IS NULL);
-- El SELECT interno de filas en papelera ya existe (archivo_mantenimiento / carpeta_mantenimiento);
-- no se concede INSERT, DELETE ni acceso a version_archivo, carga o clave_objeto.

-- restaurar_raiz_papelera(p_usuario, p_tipo, p_nodo) es VOLATILE, SECURITY DEFINER y devuelve
-- outcome, original_name, final_name, parent_id, parent_name, item_count y size_bytes. Antes de escribir:
--   bloquea usuario (mismo orden que la 006) y la raíz FOR UPDATE; exige rol SUPPORT, propietario_id,
--   eliminado_en IS NOT NULL, eliminado_con_carpeta_id IS NULL y purgar_en > now(); resuelve el destino
--   como carpeta viva del mismo dueño o la raíz y el primer nombre libre. Si es carpeta, reubica ruta y
--   profundidad del subárbol mientras sigue en papelera; después saca de la papelera solo lo arrastrado.
--   Escribe solo eliminado_en, purgar_en, eliminado_con_carpeta_id, nombre, carpeta_padre_id/carpeta_id,
--   ruta, profundidad y actualizado_en; nunca propietario_id, version_actual_id, tamano_bytes, tipo ni creado_en.
--   Comprueba los conteos y hace RAISE si no cuadran; una raíz vencida o ajena es 0 filas.
```
- `down` de PR-A: `DROP FUNCTION` de las tres funciones, `DROP POLICY suscripcion_ajuste_administracion`, restaurar la
  política `suscripcion_cliente_alta` anterior, `DROP CONSTRAINT` y `DROP COLUMN`. `down` de PR-B: `DROP FUNCTION`,
  `DROP POLICY` de las cuatro políticas. Ambas migraciones se prueban `up → down → up` con un dueño sin `SUPERUSER`.
- No hay tabla nueva. El vencimiento del extra no se persiste como estado: se evalúa con `IClock` en cada lectura.

## 4. Contratos
| Método | Ruta | Rol | Request → Respuesta | Errores (`code`) |
|---|---|---|---|---|
| GET | `/backoffice/accounts/:id/limits` | ADMIN | — → `AccountLimits` (plan, usado, base, extra, total, `expiresAt`, `status`; `none` sin suscripción) | `404 IDENTITY_ACCOUNT_NOT_FOUND` en cuenta interna o inexistente |
| PUT | `/backoffice/accounts/:id/quota` | ADMIN | `{ extraBytes, until: YYYY-MM-DD }` → `AccountLimits` | `404 IDENTITY_ACCOUNT_NOT_FOUND` en interna/inexistente; `422 BACKOFFICE_QUOTA_INVALID` si extra ≤ 0, fecha pasada, sin suscripción o total > `2^53-1`; `422 BACKOFFICE_QUOTA_BELOW_USAGE` |
| DELETE | `/backoffice/accounts/:id/quota` | ADMIN | — → `AccountLimits` | `404 IDENTITY_ACCOUNT_NOT_FOUND` en interna/inexistente; `422 BACKOFFICE_QUOTA_INVALID` sin suscripción; `422 BACKOFFICE_QUOTA_BELOW_USAGE` |
| PUT | `/backoffice/accounts/:id/validity` | ADMIN | `{ expiresAt: YYYY-MM-DD }` → `AccountLimits` | `404 IDENTITY_ACCOUNT_NOT_FOUND` en interna/inexistente; `422 BACKOFFICE_VALIDITY_NOT_EXTENDED` en Personal, sin suscripción o fecha no posterior |
| GET | `/backoffice/client-trash?email=&cursor=&limit=` | SUPPORT | — → `{ client, items, nextCursor }` | `400 BACKOFFICE_INVALID_QUERY`, `404 BACKOFFICE_CLIENT_NOT_FOUND` |
| POST | `/backoffice/client-trash/:nodeId/restore` | SUPPORT | `{ email, note, type }` → `{ item, outcome, originalName }` | `422 BACKOFFICE_INVALID_INPUT` con `fields`, `404 BACKOFFICE_CLIENT_NOT_FOUND`, `404 STORAGE_NODE_NOT_FOUND`, `422 STORAGE_FOLDER_DEPTH_EXCEEDED` |
| GET | `/storage/summary` (007) | CLIENT | — → suma `baseQuotaBytes`, `extraQuotaBytes`, `extraQuotaUntil` | sin cambios |

- **Mapeo de SQL a dominio:** `quota_invalid`/`quota_below_usage`/`validity_not_extended`/`personal`/`no_subscription`
  se traducen a sus errores de `billing`; `account_not_found` a `AccountNotFoundError`; `SQLSTATE 42501` a
  `ForbiddenError`; un conteo inesperado a `BillingInvariantError`. Los mensajes HTTP de §4 no se construyen en SQL.
- **Eventos de auditoría** (todos con `InternalActionService`, en la misma transacción y contra el cliente):
  `account.quota_adjusted` `{ extraBytes, until? }`; `account.validity_adjusted` `{ expiresAt }`; el de 010
  `subscription.read_only_exited` cuando corresponda; `node.restored` `{ nodeType, itemCount, sizeBytes, note }`;
  `client.files_viewed` al abrir la papelera, como los metadatos de la 011. Sin Socket.IO ni correo.

## 5. Seguridad y operación
- **PR-A:** la ficha y los ajustes exigen `@Roles(ADMIN)`; el actor activo, el rate limit y la transacción los pone
  `InternalActionService`. `AccountDirectory.get` da el `404` de cuenta y el rol; las funciones de escritura bloquean
  `usuario` y `suscripcion` en ese orden, validan `plan + extra >= espacio_usado` y no aceptan estado ni fechas fuera de las reglas.
  Una carga autorizada antes puede terminar después de quitar el extra y dejar la cuenta por encima de la cuota; no hay
  pérdida de datos y la siguiente operación la vuelve a medir.
- **PR-B:** el correo se resuelve antes de tocar `storage` y un correo inexistente o interno da el mismo `404`; la función
  filtra `propietario_id`, `eliminado_con_carpeta_id IS NULL` y `purgar_en > now()` (no solo el reloj de la aplicación),
  bloquea `usuario` y la raíz en el mismo orden que la 006 y reubica el subárbol antes de sacarlo de la papelera. No se
  usa `accessibleNodes(actor)` porque el actor es `SUPPORT`: la excepción de `architecture.md` §6.5 se limita a raíces en
  papelera y no devuelve nodos vivos. `nimbo_app` no recibe `UPDATE` sobre `archivo`/`carpeta`; las políticas
  `TO CURRENT_USER` solo las usa la función. No hay `INSERT`/`DELETE` para Soporte.
- **Bitácoras:** `backoffice.account.quota_adjusted`, `backoffice.account.validity_adjusted`,
  `backoffice.client_trash.viewed` y `backoffice.client_trash.restored`, solo con ids y resultado; nunca el motivo, nombres,
  correo, claves de objeto ni URLs. El motivo vive únicamente en `evento_auditoria`, y el cliente lo ve en «Mi actividad».
  `recordLine` omite `note` y `reason`; una prueba captura Pino y verifica que no aparecen.
- **Aislamiento:** el restaurar no toca `espacio_usado` ni la cuota del cliente; una cuenta en solo lectura puede recibir
  la restauración y sigue sin poder subir ni editar (RN-3). Operador y Administrador reciben `403 SHARED_FORBIDDEN` en las
  rutas de Soporte; Soporte y Operador, en las de Administración.

## 6. Estrategia de pruebas (por riesgo)
| CA | Nivel | Archivo |
|---|---|---|
| CA-1, CA-4, CA-5 | unit + int + web | `subscription-adjustment.spec.ts`, `plan-limits.adapter.spec.ts`, `space-summary.service.spec.ts`, `test/int/backoffice/account-adjustments.int-spec.ts`, `account-limits.spec.tsx`, `space-summary-view.spec.tsx` |
| CA-2, CA-3, CA-7 | unit + int | `subscription-adjustment.spec.ts` (conversión de fecha), `typeorm-subscription-administration.repository.spec.ts` (códigos a errores), `account-adjustments.int-spec.ts` (bordes de `plan + extra < usado`, fecha no posterior, `422`/`404`, nada cambia, sin evento) |
| CA-6, CA-8, CA-9, CA-18 | unit + int | `subscription-administration.spec.ts` (solo extiende, no toca renovación ni cambio), `format-date.spec.ts` y `billing-date.spec.ts` (último día: medianoche y hora intermedia), `account-adjustments.int-spec.ts` (solo lectura → vigente; un ajuste de cuota no vuelve a seleccionar la cuenta en `suscripciones_por_avisar`) |
| CA-10, CA-11 | unit + int | `support-trash.service.spec.ts`, `test/int/backoffice/client-trash.int-spec.ts` (raíces, retención, destino, renombrado, `moved_to_root`, carpetas y `ruta`/`profundidad` del subárbol) |
| CA-12 | unit + int | `client-trash.int-spec.ts` (motivo vacío/largo, tipo inválido, no raíz, ajena, vencida, correo inválido/inexistente) |
| CA-13, CA-16 | int | `test/int/backoffice/roles-matrix.int-spec.ts` (SUPPORT solo restaura; ADMIN, OPERATOR y CLIENT `403`) |
| CA-14 | int + web | `client-trash.int-spec.ts` (evento con `note`, sin nombre en logs), `activity-labels.spec.ts` |
| CA-15 | iso | `test/isolation/backoffice.iso-spec.ts` (A/B, sin contenido, versiones, claves ni URLs; B intacto) |
| CA-17 | web | `support-trash.spec.tsx`, `account-limits.spec.tsx`, `a11y.spec.tsx` (360 y 1440 px) |
| Migraciones | int | `test/int/backoffice/migrations.int-spec.ts` (`up → down → up`, CHECK y políticas, dueño `NOSUPERUSER`) |

- **Impacto de `InternalAction.event`:** `internal-action.service.spec.ts` cubre el retorno simple y la lista; los
  llamadores existentes (`suspender`, `reactivar`, catálogo y alta interna) se ejecutan sin cambios.
- **Integración con dueño sin `SUPERUSER`:** `account-adjustments.int-spec.ts` y `migrations.int-spec.ts` corren con el rol
  dueño real; un superusuario ignora `FORCE RLS` y ocultaría el fallo de la política de §3 (ADR-0021:73-74).
- **Aislamiento (RNF-05, todos como `nimbo_app`):** 1) Soporte con el correo de A intenta restaurar un nodo de B → `404`,
  B intacto; 2) SQL directo de Soporte no puede cambiar `propietario_id`, `version_actual_id`, `tamano_bytes`, `tipo`,
  `carpeta_id`, `ruta` ni `purgar_en`; 3) no puede actualizar un nodo vivo, restaurar una raíz vencida o un nodo que no es
  raíz; 4) no puede `INSERT`/`DELETE` en `archivo`/`carpeta` ni tocar `version_archivo`/`carga`; 5) ADMIN, OPERATOR y
  CLIENT reciben `403` en las rutas que no les tocan; 6) Soporte, Operador, Cliente y una sesión sin actor no ejecutan las
  funciones de `suscripcion`; 7) el cliente no se sube `cuota_extra_bytes` por `UPDATE` ni por `INSERT`; 8) la `ruta` y la
  `profundidad` quedan bien en todo el subárbol; 9) B no ve la restauración de A y A la ve con el motivo, sin nombre ni
  correo del interno; 10) una cuenta en solo lectura sigue sin poder subir ni editar tras la restauración; 11) la
  restauración y la purga no se cruzan (mismo candado de `usuario` y `purgar_en > now()` en SQL).
- Una prueba de integración por endpoint con caso feliz y error principal; no se repite el mismo CA en tres capas.
- Los dobles de `TrashService` (`test/support/trash-fakes.ts`) se amplían para la fachada nueva; las pruebas de 006 son
  la red de seguridad de los cambios de `storage`.

## 7. Riesgos y coherencia con el diseño
- **Función de restauración:** es el punto sensible; su cuerpo debe limitarse a las columnas de §3 y probarse con un
  dueño sin `SUPERUSER`, SQL directo de Soporte y una raíz vencida. No hay política `UPDATE` de Soporte sobre
  `nimbo_app`, así que un error de la función no abre la tabla.
- **Funciones de cuenta:** las de escritura son las primeras `SECURITY DEFINER` que escriben y devuelven más que
  identificadores; la de lectura cubre `limitsOf`. El ADR-0035 enmienda ADR-0021 y fija la lista de control (una fila,
  columnas fijas, rol dentro, `search_path`, `VOLATILE` en las de escritura y `STABLE` sin `FOR UPDATE` en la de
  lectura, `REVOKE`/`GRANT` y política del dueño).
- **Carrera cuota/uso:** las funciones bloquean `usuario` antes de validar; una carga ya autorizada puede terminar
  después y dejar la cuenta por encima de la cuota. Se declara como desfase aceptado, sin candado nuevo (YAGNI).
- **Fase y tamaño:** la 011b nace de la 011 (Fase 2) y se ejecuta en la Fase 3; la regla de partir una spec no aplica
  porque la carpeta ya existe. El plan toca más de 12 archivos porque separa PR-A y PR-B por módulos; se revisa en §2.
- **Dos PR:** el PR-B va en rama nueva desde `main` cuando el PR-A esté integrado; no se apila ni se rebasa sobre
  `docs/011-cierre` (esa rama no existe en el remoto). Si el CI no existe, se pega el resumen local de `pnpm lint`,
  `typecheck`, `test`, `test:int` y `test:isolation` (workflow §7.1–§7.2).
- **Desviaciones:** DF-26 pasa a **Aceptado** con `cuota_extra_bytes` + `cuota_extra_hasta` (DF-26 solo nombraba la
  primera) y `adjustValidity` usa `vence_en`, no `fin`. Se abre **DF-81** para `AccountAdjustmentsService`,
  `SupportTrashService`, los puertos nuevos, la función de restauración y el `InternalAction.event` que devuelve una
  lista. Se actualizan `design-model.md` (§billing y §storage), `architecture.md` §6.5/§6.6 y el E-R en PDF se marca en
  `pendientes.md` para redibujarlo (PD-96, no un PD nuevo).
- **Pendientes:** PD-91 (bases 1000/1024 y separador) sigue abierto; la ficha usa `formatPlanBytes`/`bytesOf` (1024, como el
  catálogo) y el cliente `formatBytes` (1000, como la 011). PD-120 (mockups aprobados) queda «Parcial (011b)»: solo se
  regeneran `admin/` y `soporte/`; el resto se lista en el PR. Se abre **PD-131** para extraer la duplicación de los
  generadores de mockups (marco, tablas, estados y límites) sin cambiar las capturas.
- **ADR requeridos:** **ADR-0035** «Escrituras internas acotadas: funciones `SECURITY DEFINER` para la cuenta y la
  papelera» (funciones de `suscripcion`, función de restauración, motivo en auditoría), `Propuesto` y **Aceptado antes del
  código del PR-A**; enmienda ADR-0005, ADR-0021 y delimita ADR-0032 regla 3 **sin editar ADR-0032**, que está Aceptada;
  la ruta de restauración se añade a su lista de permitidas cuando se acepte ADR-0035.
- **Fuera de alcance:** lo de la spec §7. No se añaden dependencias.

## 8. Aprobación
- `architect`: veredicto pendiente sobre el ADR-0035 y las funciones `SECURITY DEFINER`; `security-auditor`: revisión de
  las políticas del dueño y de la función de restauración.
- Juan Marcos: visto bueno pendiente de `billing` (dominio, aplicación y migración).
- Adrián: **Propuesto** — 2026-10-22; revisión de los hallazgos del PR #74 el 2026-10-23, auditoría del 2026-10-24 y seguimiento del 2026-10-26.
