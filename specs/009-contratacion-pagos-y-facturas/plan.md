# Plan 009 — Contratación, pagos y facturas

> Spec: `./spec.md` · Estado del plan: Propuesto (decisiones de Adrián del 2026-10-14 incorporadas, §8)
> Obligatorio y ≤ 250 líneas. Dice **qué** archivos se tocan y **qué** se espera de cada uno; no es el código en
> prosa (sin cuerpos de funciones ni pseudocódigo). Lo aprueba Adrián antes de escribir código.

## 1. Resumen técnico
`billing` (M4) añade suscripción, pago simulado, factura PDF e historial, y reemplaza las reglas temporales de PD-80. El catálogo público, también el del registro, ya lo sirve la 008 (`GET /api/v1/billing/plans`, RN-8): esta spec no crea otra ruta de planes.
- **Alta Personal** (CA-1): un oyente de `identity.client-account-verified` (ADR-0019), en `presentation/`, delega en `PersonalSubscriptionService`, que con `withActor` inserta la suscripción Personal; si la fila ya existe no cambia nada (`uq_suscripcion_usuario`).
- **Conciliación** (CA-2, PD-40): el trabajo `subscription-reconcile`, con el patrón de `usage-reconcile` de `storage`, pagina los ids de clientes verificados con la fachada `VerifiedClientLister` de `identity` dentro de `ITransactionRunner.run` (sin actor) y, por cada id, inserta Personal con `createActor(id, CLIENT)`. `billing` no lee la tabla `usuario`.
- **Cobro** (CA-3 a CA-5): `POST /api/v1/billing/subscribe` corre en una transacción (Art. XI.2–3): garantiza la fila Personal, la bloquea con `FOR UPDATE`, valida el plan, cobra con `PaymentService.charge` (inserta la transacción y devuelve `ChargeResult`), mueve la suscripción `PAID_PLAN_PERIOD_DAYS` y registra la factura con `InvoiceService.register`. El rechazo se confirma como fila y el controlador responde `402` después del commit.
- **Comprobante** (CA-6): `InvoiceService.issue` genera el PDF, lo sube (`IObjectStorage.putObject`) y avisa por `INotifier` después del commit. Si falla, el trabajo `invoice-retry` busca las facturas pendientes con `IPendingInvoiceScanner` y las repone.
- **Desglose de IVA**: función pura `breakdown(priceCents)` en `packages/contracts`; la llaman `InvoiceService` (servicio de aplicación) y el formulario web. `Money` no la importa: el dominio solo importa `domain` y `shared/domain`.
- **Lectura** (PD-80): `PlanLimitsAdapter` y `SubscriptionAdministration` (la crea T-03 de esta spec, con `planNamesFor` y `clientCountsByPlan`) leen la suscripción en vez de devolver Personal fijo; `limitsFor` la lee por `ISubscriptionRepository` dentro de `withActor`.
- Alcance: nada de `estado`, `plan_pendiente_id`, `uso_agente` ni `cuota_extra_bytes` (010 y 011b).

## 2. Módulos, archivos y diseño
Dueño del módulo ajeno entre corchetes: se pide a su dueño en este PR (`specs/README.md`, «un módulo, un dueño»).

| Módulo / capa | Archivo (nuevo o cambiado) | Responsabilidad |
|---|---|---|
| Contracts | `packages/contracts/src/billing/subscription.ts`, `breakdown.ts`, `error-codes.ts`, `index.ts` | Esquemas Zod (ADR-0020): `SubscribeRequest` (`planSlug`, `card`, `nit`; constantes de las dos tarjetas de prueba; lo usa también el formulario con `react-hook-form`), `SubscribeResponse` (referencia, plan, vencimiento, montos, `receiptEmail`), `BillingHistoryResponse`, `InvoiceDownloadResponse`. `breakdown`: función pura, sin Nest ni DOM, con subtotal e IVA de RN-2. `BILLING_ERROR_CODES` (de la 008) suma `BILLING_PLAN_NOT_AVAILABLE`, `BILLING_PAYMENT_REJECTED` y `BILLING_INVOICE_NOT_FOUND`. |
| Contracts | `packages/contracts/src/shared/error-codes.ts` | `SHARED_ERROR_CODES.TOO_MANY_REQUESTS = 'SHARED_TOO_MANY_REQUESTS'`: tercer código de límite de tasa tras `identity` y `storage` (Art. VI.2). |
| Shared [Adrián] | `apps/api/src/shared/domain/errors/rate-limit-exceeded.error.ts`, `infrastructure/logging/redacted-fields.ts` y `redact-deep.spec.ts` | Subclase concreta de `TooManyRequestsError` (429, `Retry-After`) con ese código. `REDACTED_FIELDS` suma `card`, `cardNumber`, `number`, `cvc` y `nit`, que llegan en el cuerpo de `POST /subscribe`. |
| Shared [Adrián] | `workerEnvSchema` y `.env.example`; `apps/api/src/worker.module.ts` y `worker.module.spec.ts` | Variables `SUBSCRIPTION_RECONCILE_INTERVAL_MINUTES=60`, `SUBSCRIPTION_RECONCILE_BATCH_SIZE=100`, `INVOICE_RETRY_INTERVAL_MINUTES=1` e `INVOICE_RETRY_BATCH_SIZE=100` (`pnpm env:check`); el lote es el mismo de `UPLOAD_CLEANUP_BATCH_SIZE`, `TRASH_PURGE_BATCH_SIZE` y `USAGE_RECONCILE_BATCH_SIZE`. `WorkerModule` importa `BillingWorkerModule.forRoot(env)` y suma `subscription-reconcile` e `invoice-retry` a `WORKER_QUEUES`. |
| Storage [Adrián] | `storage/application/ports/i-object-storage.port.ts`, `infrastructure/minio-storage.adapter.ts`, `storage-worker.module.ts`, `index.ts` | `IObjectStorage` hoy solo firma cargas de cliente: suma `putObject(key, body, contentType)` para subir el PDF desde el servidor. `index.ts` exporta el puerto y `I_OBJECT_STORAGE`; `StorageWorkerModule` exporta el token, porque `invoice-retry` corre en el `worker`. `putObject` solo acepta claves `invoices/{usuario_id}/{factura_id}.pdf`: el adaptador rechaza cualquier otra, también las del prefijo `u/` de los archivos de cliente. |
| Notifications [Adrián] | `notifications/application/ports/i-notifier.port.ts`, su implementación en `infrastructure/`, `index.ts`, `notifications-worker.module.ts` | Puerto `INotifier` (`I_NOTIFIER`), previsto en `architecture.md` §5 y ADR-0010. El primer canal es solo correo: `notify` con la forma de `MailMessage` (`to`, `subject`, `text`, `html`, `idempotencyKey`, `tag`, `recipientId`); la clave es `billing.receipt.<transaccion_id>` (sin `:`, ADR-0018). Su implementación solo encola en `mail`; `index.ts` y `NotificationsWorkerModule` exportan el token. `INotifier` e `IMailer` son dos puertos que comparten `MailMessage` mientras el único canal sea el correo; un segundo canal los separa. `billing` no importa `IMailer`. |
| Identity [Adrián] | `identity/application/account-contact-reader.ts`, `verified-client-lister.ts`, `ports/i-account-directory.repository.port.ts` (de la 011), `identity.module.ts`, `identity-worker.module.ts`, `index.ts` | Dos fachadas de lectura, sin interfaz (DF-04): `AccountContactReader.contactOf(actor)` devuelve el correo de la propia cuenta (metadatos propios, `architecture.md` §6) y `VerifiedClientLister.listIds(afterId, limit)` pagina los ids de clientes verificados. Resuelven quién da el destinatario del aviso, porque `Actor` no trae el correo y `notifications` no depende de `identity`. Se apoyan en `IAccountDirectoryRepository` con dos consultas nuevas (§7). No exportan repositorios ni entidades. `IdentityWorkerModule` publica en el `worker` solo `VerifiedClientLister` (la conciliación corre allí y `IdentityModule`, con JWT y *throttlers*, no entra). |
| Fronteras | `packages/config/eslint/boundaries.js` y *fixtures* | `billing → storage`, `notifications` e `identity` (en `identity`, solo el evento y las dos fachadas); `storage → billing` queda rechazado (ADR-0019, ADR-0022). |
| Billing · dominio | `domain/value-objects/money.ts` | `Money` solo guarda centavos enteros; no importa `packages/contracts` ni calcula el desglose, y no crece más (YAGNI). |
| Billing · dominio | `domain/payment-card.ts`, `domain/payment-reference.ts` | `PaymentCard` (número y vencimiento; el CVC no entra al dominio), `isCardExpired` (vale hasta fin de mes, UTC) y `lastFourOf` (RN-3); `formatPaymentReference` arma `SIM-{año}-{secuencia}` con `padStart`, que no corta pasado el 999 999. |
| Billing · dominio | `domain/entities/subscription.entity.ts`, `payment.entity.ts`, `invoice.entity.ts` | Entidades `Subscription`, `Payment`, `Invoice`. `PAID_PLAN_PERIOD_DAYS = 30` vive en `subscription.entity.ts` (RN-4); una columna en `plan` espera a que dos planes duren distinto. |
| Billing · dominio | `domain/errors/billing-invalid-input.error.ts`, `payment-rejected.error.ts`, `plan-not-available.error.ts`, `invoice-not-found.error.ts` | `BillingInvalidInputError` es el único 422 con `fields` de `billing` (tarjeta vencida en T-04 y RN-9 en T-05). Un error por archivo, como `plan-not-found.error.ts`. `PaymentRejectedError` solo lo lanza el controlador al traducir un `ChargeResult` rechazado, después del commit. |
| Billing · puertos | `application/ports/i-subscription-repository.port.ts`, `i-payment-repository.port.ts`, `i-invoice-repository.port.ts` | Un repositorio por agregado (Art. V.2 b; ISP). |
| Billing · puertos | `application/ports/i-payment-gateway.port.ts`, `i-invoice-generator.port.ts`, `i-pending-invoice.scanner.port.ts` | Pasarela y generador de PDF, ya en `architecture.md` §5 (V.2 c y a). El escáner es el único acceso a `factura` sin actor, como `IExpiredUploadScanner` de `storage`: llama a `facturas_pendientes_de_emitir`, solo devuelve ids, se usa dentro de `ITransactionRunner.run` y no sale de `billing`. |
| Billing · puertos | `application/i-plan-repository.ts` → `application/ports/i-plan-repository.port.ts` | Se mueve a `ports/` con el sufijo de `conventions.md`, como los puertos de `identity`, `notifications` y `storage`; lo mueve la 011 al integrar su T-09 (decisión 9). Esta spec no le suma métodos: el cobro usa `findBySlug` y `Plan.isForSale` (activo y con precio), que cubre RN-6 sin otra consulta (YAGNI). |
| Billing · aplicación | `application/payment.service.ts` | Único dueño del pago. `charge` corre dentro de la transacción de `SubscriptionService`: habla con `IPaymentGateway`, valida el vencimiento con `IClock`, inserta la fila `transaccion` (aprobada o rechazada) y devuelve `ChargeResult` (`aprobada` \| `rechazada`); no lanza por un rechazo. La 010 lo reutiliza al renovar (`architecture.md` §8). |
| Billing · aplicación | `application/subscription.service.ts` | Orquesta la transacción de cobro: fila Personal, candado, validación del plan, `PaymentService.charge`; si se aprueba, cambio de suscripción e `InvoiceService.register`. Devuelve el `ChargeResult` y, después del commit, llama a `InvoiceService.issue`. No inserta `transaccion`. |
| Billing · aplicación | `application/invoice.service.ts` | Dos métodos de ≤ 30 líneas: `register` inserta la fila `factura` dentro de la transacción del cobro (montos de `breakdown`, `usuario_id` copiado de la transacción bloqueada y el correo de `AccountContactReader`); `issue(facturaId)`, después del commit, genera el PDF, lo sube con `putObject` y avisa por `INotifier`. `retryPending()` repone los que fallaron: recorre los ids de `IPendingInvoiceScanner` y delega en `issue`, como método aparte y también de ≤ 30 líneas (revisión N-3). `issue` es idempotente por `transaccion_id`. |
| Billing · aplicación | `application/personal-subscription.service.ts`, `subscription-reconciler.service.ts` | Alta Personal con `withActor`, idempotente (la usan el oyente, la conciliación y el cobro); y la conciliación, que pagina `VerifiedClientLister` y delega cada alta. |
| Billing · aplicación | `application/subscription-administration.ts` | PD-80. Fachada sin interfaz para `backoffice` (DF-04) que crea T-03 (acuerdo con Fátima, `arreglos-011.md`): `planNamesFor(actor, clientIds)` → `ReadonlyMap<clientId, planName>` con las funciones de lectura de §3 (con fila, el nombre del plan; sin fila, el cliente no aparece y administración muestra «—», spec §8) y `clientCountsByPlan(actor)` → `{ planId, clientCount }[]`, sin `clientCount` de entrada (YAGNI): los clientes sin fila no cuentan en ningún plan. |
| Billing · aplicación | `application/billing-history.service.ts` | Historial y enlace de descarga del cliente (`presignDownload` de 5 minutos). |
| Billing · infra | `infrastructure/adapters/simulated-payment-gateway.ts`, `pdf-invoice-generator.ts`, `plan-limits.adapter.ts` | `IPaymentGateway` (RN-3, determinista, sin `failureRate` ni `latencyMs`) e `IInvoiceGenerator`; el adaptador de límites (PD-80) lee la suscripción por `ISubscriptionRepository` dentro de `withActor` y, sin fila, devuelve Personal. Deja `@InjectRepository`: con RLS forzado y sin actor vería cero filas y todo cliente seguiría en Personal. |
| Billing · infra | `infrastructure/persistence/*.orm-entity.ts`, `typeorm-subscription.repository.ts`, `typeorm-payment.repository.ts`, `typeorm-invoice.repository.ts`, `sql-pending-invoice.scanner.ts` | Repositorios bajo RLS, sobre `TransactionContext` como el de plan de la 011 (con `@InjectRepository` la escritura escaparía de `withActor`). Cada `*.orm-entity.ts` se crea solo cuando su repositorio lo usa (YAGNI); `typeorm-subscription.repository.ts` usa SQL y no lo necesita. |
| Billing · trabajos | `infrastructure/subscription-reconcile.scheduler.ts`, `.processor.ts`, `invoice-retry.scheduler.ts`, `.processor.ts` | Copian el patrón de `usage-reconcile` de `storage`: cada trabajo, su cola, su programa `upsertJobScheduler` con `{ every }` y su procesador (`concurrency: 1`) que solo delega. Tres intentos con espera exponencial; datos del trabajo: solo `correlationId`. Son la quinta y sexta copia del planificador: la 009 no extrae y las suma a PD-63. |
| Billing · worker | `billing/billing-worker.module.ts`, `billing/index.ts` | `BillingWorkerModule.forRoot(env)` registra colas, planificadores, procesadores y los proveedores del lado `worker`; `index.ts` lo exporta, como `storage/index.ts` y `notifications` (sale de la fachada de tres exports de la 008). |
| Billing · presentación | `presentation/subscription.controller.ts`, `account-verified.listener.ts` | `POST /subscribe`, `GET /history` y `GET /invoices/:id/download`; y `@OnEvent(CLIENT_ACCOUNT_VERIFIED, { async: true })`, con la constante y el tipo de `identity/index.ts` (ADR-0019), que solo delega. |
| Migraciones | `apps/api/src/migrations/*-crear-suscripcion.ts`, `*-funciones-de-lectura-de-suscripcion.ts`, `*-crear-transaccion.ts`, `*-crear-factura.ts`, `*-funcion-facturas-pendientes.ts` | Una por tabla y una por grupo de funciones (§3), cada una con su `down`; las tablas, con RLS. Las de T-03 en adelante, con fecha posterior a la de `agregar-desactivado-en-a-plan` de la 011 (T-09); la de `suscripcion` (T-01) no depende de ella. |
| Diseño | `docs/sdd/design-model.md`, `design-findings.md`, E-R | Las clases nuevas de M4, los trabajos y las dos fachadas de `identity` entran al diagrama, con su DF (Art. VIII.6). Las diferencias con el E-R (§7) se registran y el redibujo del PDF queda en un pendiente, como PD-46 y PD-81. |
| Web · errores | `apps/web/src/lib/error-catalog.ts` | Mensajes de los códigos `BILLING_*` y de `SHARED_TOO_MANY_REQUESTS`. |
| Web · billing | `apps/web/src/components/nimbo/plan-card.tsx` y `app/(public)/planes/page.tsx` (008, PD-83) | El único `PlanCard` suma una prop opcional `action`; `PlanCatalog` pasa un enlace «Contratar» a `/planes/contratar?slug=` solo a los planes con `priceCents` mayor que 0. |
| Web · billing | `app/(app)/(cliente)/planes/contratar/{page,loading,error}.tsx`, `features/billing/subscribe-api.ts`, `components/payment-form.tsx`, `payment-summary.tsx` | `page.tsx` lee el plan por `slug` en el servidor con `fetchPlanCatalog(getEnv().API_INTERNAL_URL)` (008); `loading.tsx` y `error.tsx` dan cargando y error. El formulario (`react-hook-form` + `SubscribeRequest`) llama con `authFetch` y cubre formulario, procesando, rechazado y aprobado con `StateView`; el resumen usa `breakdown` y `lib/format-plan.ts`. |
| Web · billing | `app/(app)/(cliente)/suscripcion/page.tsx`, `features/billing/billing-history-api.ts`, `components/invoice-history.tsx` | Plan actual e historial con `authFetch` y `StateView`: cargando, con facturas, vacío y error con «Reintentar»; base para 010. |

- **Puertos (Art. V.2):** `IPaymentGateway`, `IInvoiceGenerator` e `INotifier` están en los diagramas; los tres repositorios y el escáner de facturas cumplen V.2 b. Todos van en `application/ports/*.port.ts` (decisión 9, también para la 011); `conventions.md` ya fija el sufijo y esta spec le suma la carpeta. `VerifiedClientLister`, `AccountContactReader`, `PaymentService`, `SubscriptionService` e `InvoiceService` son clases, sin segunda implementación.
- **Dependencias:** `billing → storage` (`IObjectStorage`), `billing → notifications` (`INotifier`) y `billing → identity` (el evento y las dos fachadas). Las dos primeras ya figuran en `architecture.md` §3; la de las fachadas está aprobada (§8, decisión 2): al firmar, `architecture.md` §3 y el DF de la 009 registran que la arista suma esas dos fachadas a los eventos. `billing` no lee `usuario`. `billing` no importa `IMailer` ni crea la tabla `notificacion` (ADR-0018).
- **Reutiliza** de T-09 de la 011 `Plan` y `plan.desactivado_en`. `PERSONAL_PLAN_SLUG` lo crea T-01 en `domain/plan-slug.ts` (lo usan el alta Personal y `PlanLimitsAdapter`) y T-09 de la 011, que depende de T-01, lo amplía con `slugFromName`: el slug de Personal se declara una sola vez (Art. VI).
- **Cobro (Art. XI.2–3), una sola transacción** con `withActor`: 1) `INSERT … ON CONFLICT DO NOTHING` de la fila Personal, porque `FOR UPDATE` no bloquea nada si la fila no existe (evento perdido, conciliación pendiente) y dos pagos simultáneos pasarían; quien tiene sesión ya verificó su correo, así que es seguro. 2) `SELECT … FOR UPDATE` de la suscripción. 3) Validar el plan. 4) `PaymentService.charge` inserta `transaccion` y devuelve `ChargeResult`. 5) Si se aprueba, actualizar `suscripcion` e `InvoiceService.register` inserta `factura` sin PDF. El candado evita otro cobro: un segundo pago simultáneo espera y, como la cuenta ya no está en Personal, recibe `400 BILLING_PLAN_NOT_AVAILABLE` sin otra transacción. El cobro no es idempotente; sí lo son el oyente, la conciliación e `invoice-retry`.
- **Rechazo, un solo contrato (`ChargeResult`):** con `rechazada`, la transacción confirma la fila `rechazada` sin tocar la suscripción ni crear factura, y el controlador traduce el resultado a `402 BILLING_PAYMENT_REJECTED` después del commit. Nada lanza dentro de la transacción por un rechazo: si lanzara, la fila rechazada desaparecería.
- **Después del commit** (RN-8): `InvoiceService.issue` genera el PDF, guarda `clave_objeto`, avisa con `INotifier` al `correo_comprobante` de la factura y marca `aviso_encolado_en`. Si lanza, `SubscriptionService` lo registra y responde igual: el pago ya está confirmado. Guardar el correo en `factura` evita que el `worker` dependa de `identity`.
- **Trabajos** (colas `subscription-reconcile` e `invoice-retry`, BullMQ, en el `worker`): el reintento corre cada minuto y repone hasta un lote de 100 facturas con `clave_objeto` o `aviso_encolado_en` nulos; la conciliación corre cada 60 minutos en lotes de 100 y falla al final si dejó cuentas sin revisar, para que BullMQ la reintente, como `usage-reconcile`. Intervalos y lotes salen de las variables de §2; ambos trabajos son idempotentes (Art. XI.2) y observables por su bitácora técnica (Art. X.3).
- **Decisión registrada:** `breakdown` vive en `packages/contracts` porque es lo único que ven `api` y `web` sin importarse entre sí (Art. VI.1); `Money` no la importa (el dominio no depende de `contracts`).

## 3. Datos
```sql
-- 1.ª migración
CREATE TABLE suscripcion (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES plan(id),
  iniciado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  vence_en TIMESTAMPTZ,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_suscripcion_usuario UNIQUE (usuario_id)
);
-- 2.ª migración: dos funciones SECURITY DEFINER de solo lectura (patrón de ADR-0021)
--   nombres_de_plan_por_cliente(ids uuid[])  -> (usuario_id, nombre); solo ADMIN, máximo 100 ids
--   conteo_de_clientes_por_plan()            -> (plan_id, total);     ADMIN y OPERATOR
-- 3.ª migración
CREATE SEQUENCE transaccion_referencia_seq;
CREATE TABLE transaccion (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES usuario(id) ON DELETE RESTRICT,
  plan_id UUID NOT NULL REFERENCES plan(id),
  monto_centavos INTEGER NOT NULL CHECK (monto_centavos > 0),
  estado VARCHAR(20) NOT NULL CHECK (estado IN ('aprobada', 'rechazada')),
  marca_tarjeta VARCHAR(20) NOT NULL,
  tarjeta_ultimos4 CHAR(4) NOT NULL,
  referencia VARCHAR(20) NOT NULL UNIQUE,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_transaccion_usuario_creado_en ON transaccion (usuario_id, creado_en DESC);
-- 4.ª migración
CREATE SEQUENCE factura_numero_seq;
CREATE TABLE factura (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaccion_id UUID NOT NULL UNIQUE REFERENCES transaccion(id) ON DELETE RESTRICT,
  usuario_id UUID NOT NULL REFERENCES usuario(id) ON DELETE RESTRICT,
  numero VARCHAR(20) NOT NULL UNIQUE,
  subtotal_centavos INTEGER NOT NULL CHECK (subtotal_centavos >= 0),
  iva_centavos INTEGER NOT NULL CHECK (iva_centavos >= 0),
  total_centavos INTEGER NOT NULL CHECK (total_centavos > 0),
  CONSTRAINT ck_factura_total CHECK (subtotal_centavos + iva_centavos = total_centavos),
  nit VARCHAR(20) NOT NULL DEFAULT 'CF',
  correo_comprobante VARCHAR(254) NOT NULL,
  clave_objeto VARCHAR(255),
  aviso_encolado_en TIMESTAMPTZ,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_factura_usuario_creado_en ON factura (usuario_id, creado_en DESC);
-- Trigger BEFORE INSERT tg_factura_usuario_de_transaccion: rechaza la fila si usuario_id ≠ transaccion.usuario_id
-- 5.ª migración: facturas_pendientes_de_emitir() -> (factura_id, usuario_id); solo sin actor en la sesión, antigüedad mínima y tope fijos
-- Cada tabla: ENABLE + FORCE ROW LEVEL SECURITY y política por propietario (usuario_id = actor); ningún rol interno lee filas.
```
- Numeración, confirmada por Adrián (decisión 5): el año del texto es el año del pago y la secuencia no se reinicia al cambiar de año. `referencia` = `SIM-{año}-{secuencia a 6 dígitos}` y `numero` = `NB-{año}-{secuencia a 4 dígitos}`, tomadas de las secuencias (sin carreras). `NB-` admite 9 999 facturas, suficiente para la demo; `numero` es `VARCHAR(20)`, así que el formato puede crecer sin migrar.
- **Dueño de la factura:** un `CHECK` no puede mirar otra tabla. `register` copia `usuario_id` de la transacción ya bloqueada en la misma transacción, y el trigger `BEFORE INSERT` rechaza la fila si difiere.
- **Vigencia hasta la 010:** `PlanLimitsAdapter.limitsFor` y las funciones de `SubscriptionAdministration` leen `plan_id` e ignoran `vence_en`; pasada la fecha, los dos caminos siguen mostrando el plan contratado hasta que la 010 lo defina.
- `transaccion` y `factura` usan `RESTRICT`: RN-7 exige conservarlas 7 años. `suscripcion` usa `CASCADE`.
- `clave_objeto` es nulo hasta que el PDF exista y `aviso_encolado_en` hasta que el aviso se entregó a `INotifier`; el reintento busca las facturas con alguno nulo. `correo_comprobante` guarda a dónde se envió, para que el reintento no necesite a `identity`.
- `uq_suscripcion_usuario` asume una fila por cliente (DF-25, DF-35). La 010 añade `estado` y `plan_pendiente_id` en su propia migración.
- Las políticas copian el patrón de las migraciones de 005 con `nimbo_actor_id()` y `nimbo_actor_role()`. El oyente, la conciliación y el reintento escriben y leen con el actor del dueño (`withActor`).
- **Funciones de lectura** (ADR-0021, Aceptado el 2026-10-14, que las autoriza con esta lista): `STABLE`, `search_path` cerrado, propiedad del rol que migra, `REVOKE … FROM PUBLIC` y `EXECUTE` solo para `nimbo_app`; devuelven nombres, conteos o identificadores, nunca filas completas. Las dos primeras comprueban `nimbo_actor_role()` dentro; la tercera exige `nimbo_actor_id()` nulo (contexto de mantenimiento, como `carga_expiradas` de `storage`). Como `FORCE` somete también al dueño, las tablas que leen llevan una política `FOR SELECT TO CURRENT_USER` para ellas. Leen solo tablas de `billing`.
- `down` de cada migración: elimina su tabla y su secuencia (o sus funciones y su política). Orden inverso: función de facturas, factura, transacción, funciones de suscripción, suscripción.

## 4. Contratos
| Método | Ruta | Rol | Request → Respuesta | Errores (`code`) |
|---|---|---|---|---|
| POST | `/api/v1/billing/subscribe` | `@Roles('CLIENT')` | `{ planSlug, card, nit }` → `SubscribeResponse` (referencia, plan, vencimiento, montos, `receiptEmail`) | `400 BILLING_PLAN_NOT_AVAILABLE`, `402 BILLING_PAYMENT_REJECTED`, `422` con los campos, `429 SHARED_TOO_MANY_REQUESTS` |
| GET | `/api/v1/billing/history` | `@Roles('CLIENT')` | — → `BillingHistoryResponse` | `401 SHARED_UNAUTHENTICATED` |
| GET | `/api/v1/billing/invoices/:id/download` | `@Roles('CLIENT')` | — → `{ downloadUrl, expiresInSeconds }` | `404 BILLING_INVOICE_NOT_FOUND` |

- Los montos viajan como enteros en centavos (RN-1). Los roles internos reciben `403 SHARED_FORBIDDEN`.
- No hay `GET /plans`: el catálogo es `GET /api/v1/billing/plans` de la 008, que ya trae el `slug` que pide el cobro y deriva «gratuito» de `priceCents = 0`.

## 5. Seguridad y operación
- Servicios de cliente con `actor: Actor`; RLS forzado y filtro por `usuario_id` (RNF-05). Ningún rol interno lee `suscripcion`, `transaccion` ni `factura`: la 011 solo obtiene nombres y conteos por las funciones de §3.
- No se guardan el número de tarjeta ni el CVC. El NIT y el correo del comprobante se guardan solo en `factura`. `card`, `cardNumber`, `number`, `cvc` y `nit` se redactan en las bitácoras (§2, `shared`); el correo nunca se registra.
- Límite de tasa `billing:subscribe:{actor}` en `POST /subscribe` con `IRateLimiter` (Art. IX.7), que lanza `RateLimitExceededError`: 10 intentos por actor cada 15 minutos (decisión 6). Las cargas permiten 300 por minuto y las descargas 120; un intento de tarjeta va más cerca del candado de login.
- PDF en `invoices/{usuario_id}/{factura_id}.pdf` (`putObject` rechaza cualquier otra clave), privado, con enlace prefirmado de 5 minutos (`presignDownload`).
- Bitácora técnica: `billing.payment_approved` y `billing.payment_rejected` con `correlationId`, sin datos personales; `billing.invoice_issued`, `billing.invoice_retry_failed`, `billing.reconcile_run` y `billing.reconcile_failed` (solo UUID). No hay auditoría RF-07 (spec §8).

## 6. Estrategia de pruebas (por riesgo)
Integración en `apps/api/test/int/billing/` (`*.int-spec.ts`) y aislamiento en `apps/api/test/isolation/` (`*.iso-spec.ts`). Nombres `'CA-n: …'`.

| CA | Nivel | Archivo |
|---|---|---|
| CA-1 | int | `account-verified.listener.int-spec.ts`: alta con el actor del dueño y repetición sin duplicar. |
| CA-2 | unit + int | `subscription-reconcile.processor.spec.ts` (un fallo no frena las demás cuentas y el trabajo falla al final), `subscription-reconciler.int-spec.ts` (conciliación y repetición) y `worker.module.spec.ts` (nombres de cola). |
| CA-2 | int | `plan-limits.adapter.int-spec.ts` (con fila, el plan; sin fila, Personal; leído con `withActor` bajo RLS), `subscription-administration.int-spec.ts` (con fila, el nombre; sin fila, `planName` nulo); `accounts.int-spec.ts` y `metrics.int-spec.ts` de la 011 siguen verdes con suscripciones reales. |
| CA-2 | iso | `billing-subscription.iso-spec.ts`: `nimbo_app` sin actor ve 0 filas de `suscripcion`; Soporte no ejecuta las dos funciones de lectura y Operador solo el conteo; con un actor `CLIENT` o interno, `facturas_pendientes_de_emitir` falla; `PUBLIC` no ejecuta ninguna; corre con un dueño sin `SUPERUSER`. |
| RN-2 | unit | `packages/contracts/src/billing/breakdown.spec.ts` (9 821 y 1 179 para 11 000, mitades). |
| RN-2 a RN-4 | unit | `money.spec.ts`, `simulated-payment-gateway.spec.ts` (RN-3), `payment.service.spec.ts` (`ChargeResult` aprobada y rechazada, vencimiento con `IClock`), `subscription.service.spec.ts` (`PAID_PLAN_PERIOD_DAYS`, RN-4). |
| CA-3 a CA-5 | int | `subscribe.int-spec.ts`: aprobado, rechazado (suscripción intacta), plan no disponible, plan de pago vigente, datos fuera de RN-9 (`422` con `fields` y sin fila), `429` tras 10 intentos, cliente sin fila de suscripción y dos pagos simultáneos con y sin fila (solo uno se aprueba). |
| CA-6 | int | `subscribe-invoice.int-spec.ts`: factura con su correo, PDF en MinIO y aviso por `INotifier` solo si se aprueba; el trigger rechaza una factura con `usuario_id` distinto al de su transacción; `invoice-retry.int-spec.ts`: con fallo del PDF o del aviso, el trabajo los repone sin duplicar el correo; `minio-storage.adapter.int-spec.ts` (de `storage`): `putObject`, su descarga firmada y el rechazo de claves `u/` o fuera de `invoices/`. |
| CA-7, CA-8 | int | `billing-history.int-spec.ts`: historial, vacío, factura sin PDF y enlace de descarga. |
| CA-7, CA-8 | iso | `billing.iso-spec.ts`: el cliente A no ve ni descarga lo del B; ningún rol interno lee `transaccion` ni `factura`. |
| — | unit | `redact-deep.spec.ts` (`card`, `cardNumber`, `number`, `cvc`, `nit`); prueba de `INotifier` en `notifications`. |
| Estados de pantalla | web | `payment-form.spec.tsx`: un caso por estado (formulario, procesando con indicador, rechazado, aprobado) y el resumen con IVA; `contratar/error.spec.tsx` y `loading` (cargando y error con «Reintentar»). |
| CA-9 | web | `plan-card.spec.tsx` y `(public)/planes/page.spec.tsx`: «Contratar» con el `slug` en planes de pago y sin botón en los gratuitos. |
| CA-7, CA-8 | web | `subscription-page.spec.tsx`: un caso por estado (cargando, con facturas, vacío, error con «Reintentar») y la descarga. |

## 7. Riesgos y coherencia con el diseño
- **Falla de MinIO o del aviso tras un cobro aprobado**: la transacción y la suscripción ya están confirmadas. Mitigación: el trabajo `invoice-retry`; el historial muestra el pago aunque falte el PDF.
- **Fachadas de `identity`**: `architecture.md` §3 deja a `billing` solo los eventos de `identity`; se agregan dos fachadas de lectura como hizo la 011 (DF-04). Se apoyan en `IAccountDirectoryRepository` de la 011 (T-03), un modelo de lectura paginado sobre `usuario`, con dos consultas nuevas (ids de verificados y contacto por id): con `AccountDirectory` serían tres lecturas de `usuario` (regla de tres, Art. VI.2) y no se abre otro acceso a la tabla; se separan por consumidor (ISP). `storage` ya tiene su `IClientAccountScanner` (007) sobre `usuario`; esta spec no lo toca y deja un pendiente para que pase a la fachada de `identity`. La alternativa descartada es una función `SECURITY DEFINER` que lea `usuario` desde `billing`: acopla a `billing` con el esquema de `identity` y depende de ADR-0021. Aprobado por Adrián (decisión 2).
- **ADR-0021 Aceptado** (2026-10-14): la opción B está elegida desde el 28/09 y `storage` ya la usa (`carga_expiradas`, `papelera_vencida`). Autoriza las tres funciones de §3 con la misma lista: solo lectura, `search_path` cerrado, `EXECUTE` solo para `nimbo_app`, y devuelven nombres, conteos o ids.
- **El `worker` corre `invoice-retry`**: necesita `IObjectStorage` e `INotifier` allí. No es un patrón nuevo: `worker.module.ts` ya registra `NotificationsWorkerModule` y `StorageWorkerModule`, y `storage` ya tiene `usage-reconcile`, `trash-purge` y `upload-cleanup`, cada uno con su planificador y su procesador. `billing` copia ese patrón con `BillingWorkerModule`; solo se exporta el token de cada módulo (§2) y `BillingWorkerModule` los importa. De `identity` solo entra `IdentityWorkerModule` con `VerifiedClientLister`, que la conciliación necesita; `AccountContactReader` no entra porque el correo va en `factura`. `IdentityWorkerModule` no estaba en la lista de módulos ajenos que Adrián autorizó el 2026-10-14 (§8): T-02 lo agrega y queda a su visto bueno.
- **`IObjectStorage.putObject`** es un método nuevo en un puerto de `storage` (hoy solo firma): se agrega con su prueba de adaptador, que incluye el rechazo de claves `u/`, y sin tocar el resto de `storage`.
- **Patrón de planificadores**: `storage` ya copió tres veces el planificador y dejó PD-63 para extraerlo. La 009 no extrae: suma `subscription-reconcile` e `invoice-retry` a PD-63.
- **Orden con la 011**: T-09 de la 011 (billing, Juan Marcos, sobre la 008) depende de T-01 de esta spec (`plan-slug.ts`) y entrega `plan.desactivado_en` (DF-65), `Plan` y el catálogo del Administrador. T-05 (`desactivado_en` vía `Plan.isForSale`, RN-6) no se integra antes de T-09 y sus migraciones llevan fecha posterior a la suya; T-01, T-03 y T-04 no leen `desactivado_en`. T-02 y T-06 esperan además T-03 de la 011 (`IAccountDirectoryRepository`). `SubscriptionAdministration` la crea T-03 de esta spec: T-10 y T-11 de la 011 (Fátima) la esperan y escriben `accounts.int-spec.ts` y `metrics.int-spec.ts` ya sobre `suscripcion`.
- **Pagos simultáneos y cuenta sin fila**: el candado solo sirve si la fila existe; por eso el cobro la garantiza antes de bloquear (§2).
- **PDF pesado en memoria**: plantilla ligera sin imágenes externas.
- **Vencimiento sin 010**: pasada `vence_en`, los límites no cambian hasta que 010 lo defina.
- **Desviaciones de los diagramas** (Art. VIII.6; una migración que se aparta del E-R exige actualizarlo, `conventions.md`): DF-23 resuelto con centavos y `Money`; DF-25 y DF-26 no se adelantan; PD-80 se cumple en los dos lugares y DF-65 fija `desactivado_en`, `SubscriptionAdministration` e `IPlanRepository`. Se abre un DF en el mismo PR por: la separación factura/comprobante; el simulador determinista (4242… aprueba, 4000…0002 rechaza) en lugar del `failureRate` y `latencyMs` del diagrama; las diferencias con el E-R: `suscripcion` con `iniciado_en` y `vence_en` (E-R: `fin`) y sin `renov_auto` (010); `transaccion` con `plan_id`, `marca_tarjeta`, `tarjeta_ultimos4`, `monto_centavos` (E-R: `monto`) y `creado_en` (E-R: `fecha`); `factura` con `usuario_id`, `numero`, `subtotal_centavos`, `iva_centavos`, `total_centavos` entero (E-R: `total numeric`), `nit`, `correo_comprobante`, `clave_objeto`, `aviso_encolado_en` y `creado_en` (E-R: `emitida_en`), y sin `datos`; y las clases, trabajos y fachadas nuevos de M4 e `identity`. El DF se abre en T-01 y cada tarea que crea una tabla (T-04, T-06) suma sus diferencias con el E-R.
- **Pendientes**: el PR cierra PD-40 (puntos 1 y 2; el 3 y PD-48 los cierra la 008) y PD-80. PD-86 se referencia y sigue abierto por 010. PD-63 suma los dos planificadores de `billing`. Se abren pendientes para migrar `IDENTITY_` y `STORAGE_TOO_MANY_REQUESTS` a `SHARED_TOO_MANY_REQUESTS` (la 009 solo estrena el código compartido), para el `IClientAccountScanner` de `storage` y para el redibujo del E-R. El commit `59d17a9` («not completed, only files saved») se elimina con el squash merge del PR; no hace falta un commit de limpieza.
- **Mockups**: la 009 usa los de `billing/pago/` (solo `default`) y `billing/suscripcion/` (solo `vigente`); los demás estados siguen `ui-guidelines.md`. Quedan fuera «Descargar todas» y la edición de datos de facturación.
- **ADR**: rigen ADR-0016, ADR-0018, ADR-0019, ADR-0020, ADR-0021 y ADR-0022. ADR-0022 dejó abierta la exportación de `IObjectStorage`: la arista está aprobada (decisión 1) y se cierra en `design-findings.md`. La librería que genere el PDF no se firma ahora: es una dependencia nueva y exige un ADR menor de dependencias de `billing` (como ADR-0015 y ADR-0017), con el paquete elegido, aprobado antes del código de T-07. Es una compuerta previa, no parte de la tarea.

## 8. Aprobación
- `architect` (Adrián, 2026-10-14): aprueba (1) exportar `IObjectStorage` y `I_OBJECT_STORAGE` hacia `billing`, con `putObject` limitado a `invoices/{usuario_id}/{factura_id}.pdf` y `storage → billing` rechazado en `boundaries.js`; (2) las fachadas `VerifiedClientLister` y `AccountContactReader` como clases concretas sobre `IAccountDirectoryRepository` y la arista `billing → identity`; (3) las tres funciones de lectura, con ADR-0021 Aceptado; (4) `INotifier` como puerto distinto de `IMailer` con el mismo `MailMessage`.
- Adrián (2026-10-14): confirma la numeración de §3, el límite de 10 intentos cada 15 minutos (§5) y los trabajos (reintento cada minuto y conciliación cada 60, lotes de 100). Autoriza solo estos cambios en módulos ajenos: `notifications` (`INotifier`), `storage` (`putObject`, `index.ts`, `StorageWorkerModule`), `identity` (dos fachadas y dos consultas), `shared` (redacción, `RateLimitExceededError`, `workerEnvSchema`), `worker.module.ts` y `boundaries.js`. Fija la convención `application/ports/*.port.ts`, que arrastra a la 011. El ADR de la librería del PDF queda como compuerta previa a T-07.
- Aprobación final del plan: pendiente de Adrián tras esta corrección (B-1 a B-3, I-1 a I-12, S-1 a S-4).
