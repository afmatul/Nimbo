# Plan 011b — Ajustes de cuenta y restauración por Soporte

> Spec: `./spec.md` · Estado del plan: **Propuesto** (2026-10-22)
> Obligatorio y ≤ 250 líneas. Dice qué archivos se tocan y qué se espera de cada uno; no es el código en prosa.
> Lo aprueba Adrián antes de escribir código. Dos PR sobre la misma rama, como la 011: **PR-A** (cuota y vigencia)
> y **PR-B** (restauración), con el PR-B encima del PR-A. Antes de implementar se acepta el **ADR-0033** (§7).

## 1. Resumen técnico
- **PR-A.** `suscripcion` gana `cuota_extra_bytes` y `cuota_extra_hasta`; la cuota efectiva es la del plan más el extra
  mientras `ahora < cuota_extra_hasta`, calculada al leer (sin job ni evento de expiración, RN-1). `PlanLimitsAdapter`
  la suma, `PlanLimits` y el resumen de espacio exponen base, extra y fecha, y la ficha del Administrador gana el bloque
  «Límites y vigencia» con ajustar/quitar cuota y extender vigencia.
- La escritura del Administrador sobre `suscripcion` **no** abre una política UPDATE nueva: dos funciones
  `SECURITY DEFINER` (patrón de ADR-0021) bloquean y ajustan la fila con rol `ADMIN`, dentro de la transacción de
  `InternalActionService`; así siguen cerradas las escrituras directas de `nimbo_app` sobre esa tabla.
- La vigencia solo se extiende: `vence_en` nuevo, `estado` a `vigente` si estaba en solo lectura y avisos reseteados;
  no toca `iniciado_en`, `renovacion_automatica` ni `plan_pendiente_id` (RN-2, CA-8).
- **PR-B.** `storage` gana una fachada `SupportTrashService` que lista y restaura raíces por `propietario_id`; no reutiliza
  `TrashService` (actor-scoped, exige cuenta escribible y audita fuera de la transacción) ni `WritableAccountPolicy`.
  Comparte con 006 el cálculo de destino, renombrado y resultado (CA-11).
- Dos políticas RLS `FOR UPDATE` para `SUPPORT`, limitadas a filas en papelera (`eliminado_en IS NOT NULL`); la
  autorización real —cliente por correo, raíz, retención— se resuelve en la consulta. La auditoría `node.restored` con
  `note` se escribe en la misma transacción.
- Contratos nuevos: ajustes de cuenta y papelera de Soporte; se amplían `spaceSummary` y la actividad del cliente.
- Pruebas: unitarias de las reglas puras, integración por endpoint, aislamiento bloqueante (RNF-05) y componentes con axe.

## 2. Módulos, archivos y diseño
| Módulo / capa | Archivo (nuevo o cambiado) | Responsabilidad |
|---|---|---|
| contracts/backoffice | `src/backoffice/adjustments.ts` (nuevo), `error-codes.ts`, `schemas.ts`, `index.ts` | `accountLimitsSchema` (`status: active \| readOnly \| personal \| none`; base y total `null` sin suscripción), `adjustQuotaRequestSchema`, `adjustValidityRequestSchema`, códigos y `BACKOFFICE_FIELD_ISSUE_REASONS` nuevos; bytes como texto decimal (011). |
| contracts/backoffice | `src/backoffice/trash.ts` (nuevo), `index.ts` | `clientTrashResponseSchema` (reutiliza `trashItemSchema` de `storage` y añade `client`), `restoreClientNodeRequestSchema` con `note` de 1 a 500; reutiliza `restoreResponseSchema`. |
| contracts/storage | `src/storage/space-schemas.ts`, `src/storage/schemas.spec.ts` | `baseQuotaBytes`, `extraQuotaBytes`, `extraQuotaUntil` (aquí bytes numéricos, como el resto de `storage`); `quotaBytes` sigue siendo la efectiva. |
| billing/domain | `subscription-adjustment.ts` (nuevo) + spec | Reglas puras: cuota válida (`extra > 0`, `hasta > ahora`, `plan + extra >= usado`, quitar exige `plan >= usado`) y vigencia (`> actual`, `> ahora` si solo lectura, Personal no). Sin HTTP ni códigos. |
| billing/application | `subscription-administration.ts` (cambia) | `limitsOf(actor, clientId)`, `adjustQuota(actor, clientId, cmd, usado)`, `adjustValidity(actor, clientId, cmd)`: bloquea, evalúa, guarda y devuelve la vista nueva; todo dentro de la transacción del llamador. |
| billing/application/ports | `i-subscription-administration.repository.port.ts` (nuevo) | `lockSnapshot(actor, clientId)` y `save(actor, clientId, cambio)`; no agranda `ISubscriptionRepository` (V.2). |
| billing/infrastructure | `typeorm-subscription-administration.repository.ts` (nuevo) | Llama a `bloquear_suscripcion_cliente` y `ajustar_suscripcion_cliente` (§3) desde el `EntityManager` del actor. |
| billing/infrastructure | `plan-limits.adapter.ts`, `i-subscription-repository.port.ts`, `typeorm-subscription.repository.ts` | `SubscriptionStanding` suma `extraQuotaBytes` y `extraQuotaUntil`; `limitsFor` inyecta `IClock` y suma el extra vigente a `storageQuotaBytes`. |
| billing | `billing.module.ts` | Registra el puerto y el repositorio nuevos. |
| storage/domain | `plan-limits.ts` | `PlanLimits` suma `extraQuotaBytes` y `extraQuotaUntil` (solo el vigente); actualiza dobles de prueba. |
| storage/application | `space-summary.service.ts`, `presentation/space.controller.ts` | `baseQuotaBytes`, `extraQuotaBytes`, `extraQuotaUntil`; `availableBytes` ya usa la cuota efectiva. |
| identity/application | `account-administration.ts`, `ports/i-account-usage-lock.port.ts` (nuevo), `typeorm-user.repository.ts`, `identity.module.ts` | `lockUsage(actor, id): bigint` con `SELECT espacio_usado … FOR UPDATE` sobre `usuario`; serializa con las cargas. No crece `IAdminRosterRepository`. |
| backoffice/application | `account-adjustments.service.ts` (nuevo) | Compone `InternalActionService` + `AccountDirectory` + `AccountAdministration` + `SubscriptionAdministration`; traduce las reglas a los errores de §4 y arma los eventos. |
| backoffice/domain/errors | `quota-below-usage.error.ts`, `quota-invalid.error.ts`, `validity-not-extended.error.ts` (nuevos) | `422` con `BACKOFFICE_QUOTA_BELOW_USAGE` (usado y total), `BACKOFFICE_QUOTA_INVALID` y `BACKOFFICE_VALIDITY_NOT_EXTENDED` (Personal explica «Personal no vence»). |
| backoffice/application | `internal-action.service.ts` | `event` puede devolver `AuditRecord` o una lista: la salida de solo lectura suma `subscription.read_only_exited` al evento de vigencia. |
| backoffice/presentation | `account-adjustments.controller.ts`, `account-limits.response.ts` (nuevos) | Rutas de §4 con `@Roles(ADMIN)` y respuesta de lista blanca; `accountIdPipe` ya existe. |
| backoffice | `backoffice.module.ts` | Registra servicio y controlador. |
| audit | `audit-action.ts`, `audit-catalog.ts` | `ACCOUNT_QUOTA_ADJUSTED`, `ACCOUNT_VALIDITY_ADJUSTED` y `note: 'text'` en `NODE_RESTORED`; atributos de §4. |
| storage/application | `support-trash.service.ts` (nuevo), `trash-placement.ts` (nuevo) | Fachada pública con `list(actor, ownerId, cursor)` y `restore(actor, ownerId, nodeId)`; `trash-placement` extrae de `TrashService` el destino, `firstFree` y el resultado, que ambos comparten. |
| storage/application/ports | `i-support-trash.repository.port.ts` (nuevo) | `listRoots(ownerId, cursor)`, `findRoot(ownerId, nodeId)`, `restoreRoot(ownerId, root, destino)`; todas con `propietario_id`, retención `purgar_en > ahora` y sin `accessibleNodes`. |
| storage/infrastructure | `typeorm-support-trash.repository.ts` (nuevo) | SQL de raíces (`eliminado_con_carpeta_id IS NULL`) con `FOR UPDATE` de la raíz, nombre original, purga y `ruta`; reutiliza `rebaseSubtree` para carpetas. |
| storage | `storage.module.ts`, `index.ts`, `storage.module.spec.ts`, `index.spec.ts` | Exporta la fachada y su token; actualiza las listas exactas de exportaciones. |
| backoffice/application | `support-trash.service.ts` (nuevo) | Resuelve el correo con `AccountDirectory.findClientByEmail` (mismo 404 para interna o inexistente), ejecuta `internal.run` y audita `client.files_viewed` al listar y `node.restored` al restaurar. |
| backoffice/presentation | `client-trash.controller.ts`, `client-trash.response.ts` (nuevos), `backoffice-validation.ts` | `@Roles(SUPPORT)`; pipe de `nodeId` a `NodeNotFoundError` y pipe de correo con `422 BACKOFFICE_INVALID_QUERY`; respuesta de lista blanca. |
| backoffice/domain/errors | `invalid-backoffice-input.error.ts`, `invalid-backoffice-trash-query.error.ts` (nuevos) | `422 BACKOFFICE_INVALID_INPUT` (motivo) y `422 BACKOFFICE_INVALID_QUERY` (correo), sin tocar el `400` de la 011. |
| web/backoffice | `api.ts`, `hooks/use-account-limits.ts`, `hooks/use-client-trash.ts` (nuevos) | Llamadas a §4; estados `loading`, `ready`, `notFound`, `forbidden`, `error` como `use-account`. |
| web/backoffice | `components/account-limits.tsx`, `quota-adjust-dialog.tsx`, `validity-adjust-dialog.tsx` (nuevos), `account-profile.tsx`, `error-catalog.ts` | Bloque «Límites y vigencia»: cuota del plan, extra, total y vencimiento; GB con `bytesOf`/`amountAndUnit` (base 1024) y fecha en hora de Guatemala; diálogos con total resultante antes de confirmar. |
| web/backoffice | `components/support-trash.tsx`, `client-trash-table.tsx`, `trash-restore-dialog.tsx` (nuevos), `a11y.spec.tsx` | Pantalla de papelera con buscador exacto, lista de raíces, vacía/cargando/error, confirmación con motivo y los tres resultados; axe a 360 y 1440 px. |
| web/app | `app/(app)/(interno)/soporte/papelera/page.tsx` (nuevo) | Ruta de Soporte; `INTERNAL_PATHS.supportTrash` y la navegación interna en `home-path.ts` e `internal-area-layout.tsx`. |
| web/storage | `space-summary-view.tsx`, `sidebar-quota.tsx` | Nota «Tu cuota incluye <X> GB extra hasta el <fecha>» cuando `extraQuotaBytes > 0`; desaparece al vencer. |
| web/audit | `activity-labels.ts` + spec | Textos de `account.quota_adjusted` y `account.validity_adjusted`; `node.restored` y el bloque de `note` ya existen. |

- **Puertos nuevos:** `IAccountUsageLock` (identity), `ISubscriptionAdministrationRepository` (billing) e
  `ISupportTrashRepository` (storage), más la fachada `SupportTrashService`. Ninguno agranda una interfaz existente (V.2).
- **Dependencias:** `backoffice → identity, billing, storage, audit` (ya existe); `billing` sigue sin importar `identity`
  y `storage` sigue sin importar `billing` (recibe la cuota por `IPlanLimitsProvider`).
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
    cuota_extra_bytes >= 0 AND ((cuota_extra_bytes = 0) = (cuota_extra_hasta IS NULL)));

-- SECURITY DEFINER, rol ADMIN, REVOKE ALL FROM PUBLIC y EXECUTE solo a nimbo_app (ADR-0021):
-- bloquear_suscripcion_cliente(p_usuario) devuelve plan_id, plan_slug, estado, vence_en,
--   cuota_extra_bytes y cuota_extra_hasta con FOR UPDATE.
-- ajustar_suscripcion_cliente(p_usuario, p_extra, p_hasta, p_vence, p_estado) actualiza esas
--   columnas, pone aviso_previo_para y aviso_vencida_para a NULL y actualizado_en = now().

-- 20261022100100-soporte-restaura-la-papelera.ts (PR-B)
CREATE POLICY archivo_soporte_restauracion ON archivo FOR UPDATE TO nimbo_app
  USING (nimbo_actor_role() = 'SUPPORT' AND eliminado_en IS NOT NULL)
  WITH CHECK (nimbo_actor_role() = 'SUPPORT');
CREATE POLICY carpeta_soporte_restauracion ON carpeta FOR UPDATE TO nimbo_app
  USING (nimbo_actor_role() = 'SUPPORT' AND eliminado_en IS NOT NULL)
  WITH CHECK (nimbo_actor_role() = 'SUPPORT');
-- El SELECT interno ya existe (archivo_metadatos_internos / carpeta_metadatos_internos);
-- no se concede INSERT, DELETE ni acceso a version_archivo, carga o clave_objeto.
```
- `down` de PR-A: `DROP FUNCTION` de las dos funciones, `DROP CONSTRAINT` y `DROP COLUMN` (las dos). `down` de PR-B:
  `DROP POLICY` de las dos políticas. Ambas migraciones se prueban `up → down → up` con un dueño sin `SUPERUSER`.
- No hay tabla nueva. El vencimiento del extra no se persiste como estado: se evalúa con `IClock` en cada lectura.

## 4. Contratos
| Método | Ruta | Rol | Request → Respuesta | Errores (`code`) |
|---|---|---|---|---|
| GET | `/backoffice/accounts/:id/limits` | ADMIN | — → `AccountLimits` (plan, usado, base, extra, total, `expiresAt`, `status`) | `404 IDENTITY_ACCOUNT_NOT_FOUND`; `422 BACKOFFICE_QUOTA_INVALID` en cuenta interna |
| PUT | `/backoffice/accounts/:id/quota` | ADMIN | `{ extraBytes, until }` → `AccountLimits` | `422 BACKOFFICE_QUOTA_INVALID`, `422 BACKOFFICE_QUOTA_BELOW_USAGE`, `404 IDENTITY_ACCOUNT_NOT_FOUND` |
| DELETE | `/backoffice/accounts/:id/quota` | ADMIN | — → `AccountLimits` | `422 BACKOFFICE_QUOTA_INVALID`, `422 BACKOFFICE_QUOTA_BELOW_USAGE`, `404 IDENTITY_ACCOUNT_NOT_FOUND` |
| PUT | `/backoffice/accounts/:id/validity` | ADMIN | `{ expiresAt }` → `AccountLimits` | `422 BACKOFFICE_VALIDITY_NOT_EXTENDED`, `404 IDENTITY_ACCOUNT_NOT_FOUND` |
| GET | `/backoffice/client-trash?email=&cursor=&limit=` | SUPPORT | — → `{ client, items, nextCursor }` | `422 BACKOFFICE_INVALID_QUERY`, `404 BACKOFFICE_CLIENT_NOT_FOUND` |
| POST | `/backoffice/client-trash/:nodeId/restore` | SUPPORT | `{ email, note }` → `{ item, outcome, originalName }` | `422 BACKOFFICE_INVALID_INPUT`, `422 BACKOFFICE_INVALID_QUERY`, `404 BACKOFFICE_CLIENT_NOT_FOUND`, `404 STORAGE_NODE_NOT_FOUND`, `422 STORAGE_FOLDER_DEPTH_EXCEEDED` |
| GET | `/storage/summary` (011) | CLIENT | — → suma `baseQuotaBytes`, `extraQuotaBytes`, `extraQuotaUntil` | sin cambios |

- **Eventos de auditoría** (todos con `InternalActionService`, en la misma transacción y contra el cliente):
  `account.quota_adjusted` `{ extraBytes, until? }`; `account.validity_adjusted` `{ expiresAt }`; el de 010
  `subscription.read_only_exited` cuando corresponda; `node.restored` `{ nodeType, itemCount, sizeBytes, note }`;
  `client.files_viewed` al abrir la papelera, como los metadatos de la 011. Sin Socket.IO ni correo.

## 5. Seguridad y operación
- **PR-A:** la ficha y los ajustes exigen `@Roles(ADMIN)`; el actor activo, el rate limit y la transacción los pone
  `InternalActionService`. `AccountDirectory.get` da el `404` de cuenta y el rol; `lockUsage` bloquea `usuario` antes de
  leer la cuota del plan, y las funciones bloquean `suscripcion` con `FOR UPDATE`: una carga concurrente no deja la cuota
  bajo lo usado. El orden de candados es siempre `usuario` → `suscripcion` (las cargas no bloquean `suscripcion`).
- **PR-B:** el correo se resuelve antes de tocar `storage` y un correo inexistente o interno da el mismo `404`; la
  consulta filtra `propietario_id`, `eliminado_con_carpeta_id IS NULL` y `purgar_en > ahora`, y la restauración bloquea la
  raíz con `FOR UPDATE`. No se usa `accessibleNodes(actor)` porque el actor es `SUPPORT`: la excepción de
  `architecture.md` §6 se limita a raíces en papelera y no devuelve nodos vivos. Las políticas RLS solo permiten `UPDATE`
  sobre filas ya en papelera; el `WITH CHECK` deja salir de la papelera y nada más. No hay `INSERT`/`DELETE` para Soporte.
- **Bitácoras:** `backoffice.account.quota_adjusted`, `backoffice.account.validity_adjusted`,
  `backoffice.client_trash.viewed` y `backoffice.client_trash.restored`, solo con ids y resultado; nunca el motivo, nombres,
  correo, claves de objeto ni URLs. El motivo vive únicamente en `evento_auditoria`, y el cliente lo ve en «Mi actividad».
- **Aislamiento:** el restaurar no toca `espacio_usado` ni la cuota del cliente; una cuenta en solo lectura puede recibir
  la restauración y sigue sin poder subir ni editar (RN-3). Operador y Administrador reciben `403 SHARED_FORBIDDEN` en las
  rutas de Soporte; Soporte y Operador, en las de Administración.

## 6. Estrategia de pruebas (por riesgo)
| CA | Nivel | Archivo |
|---|---|---|
| CA-1, CA-4, CA-5 | unit + int + web | `subscription-adjustment.spec.ts`, `plan-limits.adapter.spec.ts`, `space-summary.service.spec.ts`, `test/int/backoffice/account-adjustments.int-spec.ts`, `account-limits.spec.tsx`, `space-summary-view.spec.tsx` |
| CA-2, CA-3, CA-7 | unit + int | `subscription-adjustment.spec.ts` (bordes y `plan + extra < usado`), `account-adjustments.int-spec.ts` (`422`/`404`, nada cambia, sin evento) |
| CA-6, CA-8, CA-9 | unit + int | `subscription-administration.spec.ts` (solo extiende, no toca renovación ni cambio), `account-adjustments.int-spec.ts` (solo lectura → vigente, avisos reseteados, siguiente ciclo) |
| CA-10, CA-11 | unit + int | `support-trash.service.spec.ts`, `test/int/backoffice/client-trash.int-spec.ts` (raíces, retención, destino, renombrado, `moved_to_root`, carpetas) |
| CA-12 | unit + int | `client-trash.int-spec.ts` (motivo vacío/largo, no raíz, ajena, vencida, correo inválido/inexistente) |
| CA-13, CA-16 | int | `test/int/backoffice/roles-matrix.int-spec.ts` (SUPPORT solo restaura; ADMIN, OPERATOR y CLIENT `403`) |
| CA-14 | int + web | `client-trash.int-spec.ts` (evento con `note`, sin nombre en logs), `activity-labels.spec.ts` |
| CA-15 | iso | `test/isolation/backoffice.iso-spec.ts` (A/B, sin contenido, versiones, claves ni URLs; B intacto) |
| CA-17 | web | `support-trash.spec.tsx`, `account-limits.spec.tsx`, `a11y.spec.tsx` (360 y 1440 px) |
| Migraciones | int | `test/int/backoffice/migrations.int-spec.ts` (`up → down → up`, CHECK y políticas) |

- Una prueba de integración por endpoint con caso feliz y error principal; no se repite el mismo CA en tres capas.
- Los dobles de `TrashService` (`test/support/trash-fakes.ts`) se amplían para la fachada nueva; las pruebas de 006 son
  la red de seguridad del extracto `trash-placement`.

## 7. Riesgos y coherencia con el diseño
- **Política RLS de Soporte:** es amplia dentro de las filas en papelera (cualquier `SUPPORT` que ejecute SQL directo
  podría tocar otra cuenta). Se mitiga con un único camino de código, la comprobación de `propietario_id`, la transacción
  única y el aislamiento; el ADR-0033 lo declara y compara con la alternativa de una función `SECURITY DEFINER`.
- **Refactor de `TrashService`:** extraer `trash-placement` puede cambiar el orden de lectura o el resultado `R-5`; las
  pruebas de 006 deben quedar verdes antes y después. No se cambia el comportamiento del cliente.
- **Carrera cuota/uso:** si se omite el `FOR UPDATE` de `usuario`, una carga simultánea puede dejar el total bajo lo usado;
  la prueba de concurrencia en `account-adjustments.int-spec.ts` lo cubre.
- **Dos PR:** el PR-B se apila sobre el PR-A para no bloquear la ficha; la rama se rebasa sobre `docs/011-cierre` cuando
  se integre el cierre de la 011. Si el CI no existe, se pega el resumen local de `pnpm lint`, `typecheck`, `test`,
  `test:int` y `test:isolation` (workflow §7.1–§7.2).
- **Desviaciones:** DF-26 pasa a **Aceptado** con `cuota_extra_bytes` + `cuota_extra_hasta` (DF-26 solo nombraba la
  primera) y `adjustValidity` usa `vence_en`, no `fin` (desviación ya anotada por la 009). Se actualizan
  `design-model.md` (§billing y §storage: métodos y puertos nuevos) y `architecture.md` §6; el E-R en PDF se marca en
  `pendientes.md` para redibujarlo, como el `fin`.
- **Pendientes:** PD-91 (bases 1000/1024 y separador) sigue abierto; la ficha usa `formatPlanBytes`/`bytesOf` (1024, como el
  catálogo) y el cliente `formatBytes` (1000, como la 011). No se inventan topes: la UI muestra el total resultante.
- **ADR requeridos:** **ADR-0033** «Escrituras internas acotadas: funciones `SECURITY DEFINER` para la cuenta y RLS por
  estado para la papelera» (funciones de `suscripcion`, políticas RLS de papelera, motivo en auditoría), en estado
  `Propuesto` con el PR-A y aceptado antes del PR-B.
- **Fuera de alcance:** lo de la spec §7. No se añaden dependencias.

## 8. Aprobación
- `architect`: previsible, por las políticas RLS nuevas y las funciones `SECURITY DEFINER` (ADR-0033); veredicto pendiente.
- Adrián: **Propuesto** — 2026-10-22.
