# Plan 009 — Contratación, pagos y facturas

> Spec: `./spec.md` · Estado del plan: Propuesto
> Obligatorio y ≤ 250 líneas. Dice **qué** archivos se tocan y **qué** se espera de cada uno; no es el código en prosa (sin cuerpos de funciones ni pseudocódigo). Lo aprueba Adrián antes de escribir código.
> Dueño del módulo `billing`: Juan Marcos. Lo ajeno (`shared`, `storage`, `notifications`, `identity`) se pide a su dueño en su PR (`specs/README.md`).

## 1. Resumen técnico
`billing` (M4) añade suscripción, pago simulado, factura PDF e historial, y reemplaza las reglas temporales de PD-80:
- Un oyente de `identity.client-account-verified` (ADR-0019), en `presentation/` y delegado en aplicación, abre `withActor(createActor(userId, CLIENT))` e inserta la suscripción Personal; si ya existe, no cambia nada.
- La conciliación (PD-40) es un trabajo repetible del `worker` (patrón de `usage-reconcile`). Obtiene los `usuario_id` verificados y sin suscripción con una función SQL de lectura `SECURITY DEFINER` (ADR-0021) y, por cada id, inserta con `withActor`. No importa repositorios de `identity` y nunca escribe sin actor.
- `GET /plans` devuelve el contrato mínimo del registro (`id`, `name`, `priceCents`, `free`), sin `slug` y sin planes desactivados. Reutiliza `IPlanRepository` de 008 y añade la consulta de activos si falta. No sustituye a `GET /api/v1/billing/plans` de 008, que sí trae `slug`.
- `POST /api/v1/billing/subscribe` ejecuta una sola transacción con la suscripción bloqueada: validar plan, cobrar con `PaymentService` y `SimulatedPaymentGateway`, guardar `transaccion`, registrar la `factura` y mover la suscripción 30 días. Después de confirmar se guarda el PDF con `InvoiceCompletionService` y se avisa por `INotifier`. Dinero con `Money` en centavos (ADR-0016, DF-23); el IVA sale de `breakdown(priceCents)` en `packages/contracts`.
- `PlanLimitsAdapter` y `SubscriptionAdministration` leen la suscripción en vez de devolver Personal fijo (PD-80), reutilizando la fachada concreta de la 011. La lectura va bajo `withActor`: sin actor, RLS devuelve 0 filas y todo cliente caería a Personal sin error.
- Alcance: nada de `estado`, `plan_pendiente_id`, `uso_agente` ni `cuota_extra_bytes` (010 y 011b).

## 2. Módulos, archivos y diseño
Rutas de `billing` bajo `apps/api/src/modules/billing/`; confirmar contra el repo cuáles existen de 008 y 011 antes de crear.

| Módulo / capa | Archivo (nuevo o cambiado) | Responsabilidad |
|---|---|---|
| Contracts | `packages/contracts/src/billing/pricing.ts`, `subscription.ts`, `index.ts` | Esquemas Zod (ADR-0020): `SubscribeRequest`, `SubscribeResponse`, `BillingHistoryResponse`, `InvoiceDownloadResponse`. `RegisterPlansResponse` se deriva del esquema único de plan de la 011. `pricing.ts`: `breakdown(priceCents)`, función pura sin Nest ni DOM (RN-2) |
| Notifications [Adrián] | `notifications/index.ts`, `infrastructure/…notifier.adapter.ts` | Declara y exporta `INotifier` e `I_NOTIFIER`: un método `notify` con destinatario, asunto, texto, HTML y clave de idempotencia (spec RN-8). La implementación encola en `mail` con `jobId = idempotencyKey` (ADR-0018) |
| Storage [Adrián] | `storage/index.ts`, `application/ports/i-object-storage.port.ts` | Exporta `IObjectStorage` e `I_OBJECT_STORAGE` hacia `billing`. El puerto no tiene subida desde el servidor (solo `presignUploadObject`): se pide `putObject(key, body, contentType)` |
| Shared [Adrián] | `shared/…/redacted-fields`, filtro de excepciones | Suma `nit`, `cvc` y `cardNumber` a `REDACTED_FIELDS`; soporte de `400` y `402` en `DomainExceptionFilter` (spec §8) |
| Billing · dominio | `domain/value-objects/money.vo.ts` | `Money` en centavos enteros; el desglose llama a `breakdown`, no lo reimplementa |
| Billing · dominio | `domain/entities/subscription.entity.ts`, `payment.entity.ts`, `invoice.entity.ts` | Entidades `Subscription`, `Payment`, `Invoice`; el slug de Personal sale de `PERSONAL_PLAN_SLUG`, sin cadenas sueltas |
| Billing · dominio | `domain/errors/payment-rejected.error.ts`, `plan-not-available.error.ts`, `invoice-not-found.error.ts` | Un error por archivo, con `code` estable (§4) |
| Billing · aplicación | `application/ports/i-payment-gateway.port.ts`, `i-invoice-generator.port.ts`, `i-billing-repository.port.ts` | Puertos internos de `billing` (sustituibilidad de pagos y PDF). `IPaymentGateway.charge` devuelve `ChargeResult` (aprobado o rechazado, nunca lanza) |
| Billing · aplicación | `application/payment.service.ts` | `charge`: habla con `IPaymentGateway` y persiste `Payment` dentro de la transacción que abre `SubscriptionService`. Devuelve el resultado; el rechazo queda guardado |
| Billing · aplicación | `application/subscription.service.ts` | Orquesta, en el orden de §2.1: candado, validación, cobro, suscripción y factura; tras confirmar, `InvoiceCompletionService`. Traduce el rechazo a `BILLING_PAYMENT_REJECTED` después de confirmar |
| Billing · aplicación | `application/invoice-completion.service.ts` | Idempotente por `transaccion_id`: genera y guarda el PDF si `clave_objeto` es nulo y avisa con la clave `comprobante:{transaccion_id}`. Lo usan el flujo normal, el reintento y la descarga |
| Billing · aplicación | `application/subscription-provisioning.service.ts`, `subscription-reconciler.service.ts` | Alta Personal idempotente con `withActor` y conciliación sobre la función de lectura |
| Billing · aplicación | `application/subscription-administration.ts` | Fachada concreta de 011 (DF-04): `planNamesFor(actor, clientIds)` y `clientCountsByPlan(actor, clientCount)` con la suscripción; sin fila, regla de Personal. La crea la T-09 de la 011; T-02 la reemplaza por la suscripción y actualiza su prueba unitaria |
| Billing · aplicación | `application/billing-history.service.ts` | Historial y enlace de descarga del cliente |
| Billing · infra | `infrastructure/simulated-payment-gateway.adapter.ts`, `pdf-invoice-generator.adapter.ts` | Implementan `IPaymentGateway` (RN-3, determinista) e `IInvoiceGenerator` (plantilla ligera, sin imágenes externas) |
| Billing · infra | `infrastructure/plan-limits.adapter.ts` | Modificado (PD-80): una sola consulta `suscripcion` + `plan` bajo `withActor` (sin caché, PD-58); sin fila devuelve Personal. No filtra `desactivado_en` y el slug de Personal sale de `PERSONAL_PLAN_SLUG` |
| Billing · infra | `infrastructure/persistence/*.orm-entity.ts`, `*.mapper.ts`, `typeorm-billing.repository.ts` | Repositorio sobre `TransactionContext` (con `@InjectRepository` la escritura escaparía de la transacción); bloqueo `FOR UPDATE` y llamada a la función de conciliación |
| Billing · infra | `infrastructure/subscription-reconcile.scheduler.ts`, `subscription-reconcile.processor.ts` | Cola `subscription-reconcile`, `upsertJobScheduler`, concurrencia 1, 3 reintentos con backoff exponencial; falla al final si hubo errores por fila (ADR-0021) |
| Billing · presentación | `presentation/account-verified.listener.ts` | `@OnEvent(CLIENT_ACCOUNT_VERIFIED, { async: true })`; importa el evento de `identity/index.ts` y solo delega |
| Billing · presentación | `presentation/subscription.controller.ts`, `public-plans.controller.ts` | Rutas de §4 |
| Worker / config | `apps/worker/src/worker.module.ts`, `.env.example`, `pnpm env:check` | Registra la cola y `BillingModule`; `SUBSCRIPTION_RECONCILE_INTERVAL_MINUTES` (por defecto 1440). `boundaries.js` ya trae `billing → storage, notifications, identity` |
| Migraciones | `apps/api/src/migrations/<fecha>-crear-suscripcion.ts`, `-crear-funcion-clientes-sin-suscripcion.ts`, `-crear-transaccion.ts`, `-crear-factura.ts` | Una por cambio lógico, con `down`. Fechas posteriores a la migración de `desactivado_en` de la T-09 de la 011 |
| Web · identity [Adrián] | `apps/web/src/features/identity/plan-catalog.ts` | Usa el contrato y la ruta de `@nimbo/contracts` y borra el esquema local (PD-48) |
| Web · billing | `apps/web/src/features/billing/{api.ts,components/payment-form.tsx,…}`, `lib/error-catalog.ts` | Formulario con `react-hook-form` y el esquema de `contracts`; resumen con `breakdown`; textos por `code` |
| Web · billing | `apps/web/src/app/(app)/(cliente)/planes/contratar/page.tsx` | Pantalla de pago; lee `?slug=` |
| Web · billing | `PlanCard` de `components/nimbo` y `…/planes/…` | Botón «Contratar» en las tarjetas de pago; arma `/planes/contratar?slug=` con el `slug` de 008 |
| Web · billing | `apps/web/src/app/(app)/(cliente)/suscripcion/page.tsx` | Plan actual e historial; base para 010 |

### 2.1 Orden del cobro
1. Abrir `withActor` con el cliente (una sola transacción).
2. Insertar la suscripción Personal si falta (`ON CONFLICT DO NOTHING`) y leerla con `SELECT … FOR UPDATE`. Un segundo pago del mismo cliente espera aquí.
3. Validar el plan: existe, no está desactivado, no es Personal y la cuenta sigue en Personal. Si no, `400 BILLING_PLAN_NOT_AVAILABLE` sin transacción (CA-6, CA-10).
4. Cobrar con `PaymentService.charge` e insertar `transaccion` (aprobada o rechazada).
5. Si fue aprobada: actualizar la suscripción (30 días) e insertar la `factura` con `clave_objeto` nulo. Confirmar.
6. Si fue rechazada: confirmar solo la `transaccion` rechazada y responder `402`; la suscripción no cambia.
7. Tras confirmar, `InvoiceCompletionService` guarda el PDF y llama a `INotifier`. Si fallan, el cobro no se revierte y se reintenta con el mismo `transaccion_id`.

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
  CONSTRAINT uq_suscripcion_usuario_id UNIQUE (usuario_id)
);
CREATE INDEX idx_suscripcion_plan_id ON suscripcion(plan_id); -- Índice crítico para métricas de 011

-- 2.ª migración: función clientes_verificados_sin_suscripcion(p_limite integer) → TABLE (usuario_id uuid), SECURITY DEFINER

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
  referencia VARCHAR(20) NOT NULL,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_transaccion_referencia UNIQUE (referencia)
);
CREATE INDEX idx_transaccion_usuario_id_creado_en ON transaccion (usuario_id, creado_en DESC);

-- 4.ª migración
CREATE SEQUENCE factura_numero_seq;
CREATE TABLE factura (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaccion_id UUID NOT NULL REFERENCES transaccion(id) ON DELETE RESTRICT,
  usuario_id UUID NOT NULL REFERENCES usuario(id) ON DELETE RESTRICT,
  numero VARCHAR(20) NOT NULL,
  subtotal_centavos INTEGER NOT NULL CHECK (subtotal_centavos >= 0),
  iva_centavos INTEGER NOT NULL CHECK (iva_centavos >= 0),
  total_centavos INTEGER NOT NULL CHECK (total_centavos > 0),
  nit VARCHAR(20) NOT NULL DEFAULT 'CF',
  clave_objeto VARCHAR(255),
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_factura_transaccion_id UNIQUE (transaccion_id),
  CONSTRAINT uq_factura_numero UNIQUE (numero),
  CONSTRAINT ck_factura_total CHECK (subtotal_centavos + iva_centavos = total_centavos)
);
CREATE INDEX idx_factura_usuario_id_creado_en ON factura (usuario_id, creado_en DESC);
```
- **RLS** (`ENABLE` + `FORCE` en las tres tablas): política de cliente (`nimbo_actor_role() = 'CLIENT' AND usuario_id = nimbo_actor_id()`, `USING` y `WITH CHECK`). Solo `suscripcion` suma una política de lectura para `ADMIN` y `OPERATOR` (011 CA-1 y CA-12); `transaccion` y `factura` no tienen política interna.
- **Privilegios de `nimbo_app`**: `suscripcion` SELECT, INSERT, UPDATE; `transaccion` SELECT, INSERT (sin UPDATE ni DELETE); `factura` SELECT, INSERT y `UPDATE (clave_objeto)`; `USAGE` en las dos secuencias. Nadie borra: RN-7.
- **Función de conciliación** (checklist de ADR-0021): `SECURITY DEFINER`, `SET search_path = pg_catalog, pg_temp`, solo lectura, devuelve únicamente `usuario_id`, tope de filas (`LEAST(GREATEST(p_limite, 0), 1000)`), `REVOKE ALL … FROM PUBLIC` y `EXECUTE` solo para `nimbo_app`. Lee `usuario` (`rol = 'CLIENT'`, `correo_verificado`) y `suscripcion`; lleva la política `suscripcion_mantenimiento` (`FOR SELECT TO CURRENT_USER`). Un superusuario ignora RLS: la prueba corre con dueño `NOSUPERUSER`.
- **Numeración**: `referencia` = `SIM-{año del pago}-{secuencia a 6 dígitos}` y `numero` = `NB-{año del pago}-{secuencia a 4 dígitos}`. No se reinician por año y pueden dejar huecos.
- `clave_objeto` admite nulo hasta que el PDF exista; así la factura se registra con el cobro y el PDF se repone después. `transaccion` y `factura` usan `RESTRICT`; `suscripcion`, `CASCADE`.
- `monto_centavos` sigue `precio_centavos` de `plan` (ADR-0016) y se aparta de `transaccion.monto` del E-R.
- `down` de cada migración: elimina su objeto en orden inverso. Prueba `up → down → up` con dueño sin `SUPERUSER`.

## 4. Contratos
| Método | Ruta | Rol | Request → Respuesta | Errores (`code`) |
|---|---|---|---|---|
| GET | `/api/v1/plans` | `@Public()` | — → `{ plans: [{ id, name, priceCents, free }] }` | `500 PLAN_CATALOG_UNAVAILABLE` |
| POST | `/api/v1/billing/subscribe` | `@Roles('CLIENT')` | `{ planSlug, card, nit }` → `SubscribeResponse` | `400 BILLING_PLAN_NOT_AVAILABLE`, `402 BILLING_PAYMENT_REJECTED`, `422` con los campos, `429` por límite de tasa |
| GET | `/api/v1/billing/history` | `@Roles('CLIENT')` | — → `BillingHistoryResponse` | `401 SHARED_UNAUTHORIZED` |
| GET | `/api/v1/billing/invoices/:id/download` | `@Roles('CLIENT')` | — → `{ downloadUrl, expiresInSeconds }` | `404 BILLING_INVOICE_NOT_FOUND` |

- Los montos viajan como enteros en centavos (RN-1). Los roles internos reciben `403 SHARED_FORBIDDEN`.
- `GET /plans` queda mínimo y sin `slug`. El `planSlug` del cobro llega por la URL del botón «Contratar», armada con la respuesta de `GET /api/v1/billing/plans` de la 008.

## 5. Seguridad y operación
- Servicios de cliente con `actor: Actor`; RLS forzado y filtro por `usuario_id` (RNF-05). El oyente y la conciliación también escriben con el actor del dueño; solo la función de lectura de la conciliación corre sin actor.
- No se guardan el número de tarjeta ni el CVC; solo marca y últimos 4 dígitos. El NIT se guarda únicamente en `factura` y no entra en bitácoras ni en el logger.
- Límite de tasa `billing:subscribe:{actor}` con `IRateLimiter` de `shared` (propuesta 5 intentos por minuto).
- PDF en `invoices/{usuario_id}/{factura_id}.pdf`, privado, con enlace prefirmado de 5 minutos (`presignDownload`).
- Bitácora técnica (Pino): `billing.payment_approved`, `billing.payment_rejected`, `billing.subscription_provisioned`, `billing.invoice_completion_failed`, todas con `correlationId` y sin datos personales. No hay auditoría RF-07.

## 6. Estrategia de pruebas (por riesgo)
Nombre de cada prueba de aceptación: `'CA-n: …'`. Integración en `apps/api/test/int/billing/`; aislamiento en `apps/api/test/isolation/`; unitarias junto al código.

| CA | Nivel | Archivo |
|---|---|---|
| CA-1 | int | `account-verified.listener.int-spec.ts`: alta con actor del dueño y repetición |
| CA-2 | int | `subscription-reconciler.int-spec.ts`: función de lectura, alta, repetición, trabajo con error por fila |
| CA-2 | int | `plan-limits.adapter.int-spec.ts`, `subscription-administration.int-spec.ts`: con fila de plan de pago **como `nimbo_app`** (no cae a Personal), plan desactivado que conserva sus límites, sin fila; reemplaza el unitario de PD-80 de la T-09 de la 011 |
| CA-3 | int | `public-plans.int-spec.ts`: orden, `free`, sin `slug`, exclusión de desactivados, sin sesión (verifica protección `@Public()`) |
| RN-2 | unit | `packages/contracts/src/billing/pricing.spec.ts`: 9 821 y 1 179 para 11 000, mitades hacia arriba |
| CA-5, CA-6 | unit | `simulated-payment-gateway.adapter.spec.ts`, `payment.service.spec.ts`, `money.vo.spec.ts` |
| CA-4 a CA-6 | int | `subscribe.int-spec.ts`: aprobado, cliente sin fila, rechazado (suscripción intacta y transacción guardada), plan no disponible, plan de pago vigente, datos inválidos, `429` |
| CA-10 | int | `subscribe-concurrency.int-spec.ts`: dos pagos a la vez, una sola transacción aprobada |
| CA-7 | int | `subscribe-invoice.int-spec.ts`: factura registrada con el pago y PDF en MinIO; `invoice-completion.int-spec.ts`: PDF o aviso fallan y el reintento repone sin duplicar |
| CA-7 | int | `notifier.int-spec.ts` (en `notifications`): encola en `mail` con clave de idempotencia, solo si se aprueba |
| CA-8, CA-9 | int | `billing-history.int-spec.ts`: historial, vacío, enlace de descarga y reposición del PDF faltante síncrona en el GET si falló MinIO |
| CA-8, CA-9 | iso | `billing.iso-spec.ts`: el cliente A no ve ni descarga lo del B; `SUPPORT` 0 filas de `suscripcion`; `ADMIN` y `OPERATOR` leen `suscripcion` pero no `transaccion` ni `factura` |
| CA-2 | iso | `billing-maintenance.iso-spec.ts`: sin actor 0 filas; la función devuelve solo ids; `PUBLIC` no la ejecuta; dueño `NOSUPERUSER` |
| Datos | int | `migrations.int-spec.ts`: `up → down → up` con dueño sin `SUPERUSER`, `GRANT`s y `CHECK` de la factura |
| CA-4 a CA-6 | web | `payment-form.spec.tsx`: estados, `?slug=` y resumen con IVA vía `breakdown` |
| CA-8, CA-9 | web | `subscription-page.spec.tsx`: con facturas, vacío y descarga |

## 7. Riesgos y coherencia con el diseño
- **Pagos simultáneos**: lo cubre el `FOR UPDATE` de §2.1 (Art. XI, CA-10). Sin el candado, dos solicitudes podrían aprobarse.
- **Lectura sin actor**: `limitsFor` se llama fuera de la transacción de carga. Con RLS forzado, si no abre su propio `withActor`, devuelve Personal a todos sin error. La prueba de CA-2 corre como `nimbo_app`.
- **Falla de MinIO o del aviso tras un cobro aprobado**: La transacción, la suscripción y la factura ya están guardadas. `InvoiceCompletionService` se reintenta por `transaccion_id`. El proceso es estrictamente idempotente: si MinIO guardó el PDF pero la BD falló al guardar el `clave_objeto`, el reintento sobrescribe el objeto huérfano en MinIO y reintenta el `UPDATE`, garantizando consistencia final sin basura. La descarga repone el PDF síncronamente antes de responder 404.
- **Conciliación y fronteras**: leer `usuario` desde `billing` es una excepción nueva a «cada módulo es dueño de sus tablas». Se acota a una función de solo lectura que devuelve ids.
- **Lectura interna de `suscripcion`**: la 011 necesita plan por cuenta y conteo por plan. Se resuelve con la política de `ADMIN` y `OPERATOR` de §3.
- **Plan vencido sin 010**: pasada `vence_en`, los límites no cambian y contratar da `400` hasta que la 010 defina la renovación.
- **`desactivado_en` y orden de integración**: la 009 no entra hasta que la 011 haya integrado esta columna: el orden inviolable es 008 → T-09 de la 011 → 009.
- **Archivos compartidos con la 011**: `account-menu.tsx` y `lib/error-catalog.ts`. Rebase frecuente; el enlace «Plan y facturación» solo después de la tarea de Fátima.
- **Desviaciones de los diagramas**: DF-23 resuelto con centavos y `Money`. El simulador es determinista frente a la probabilística del diagrama (`failureRate`, `latencyMs` no se implementan).

## 8. Aprobación
- `architect`: Aprobada la exportación de `IObjectStorage` desde `storage/index.ts` hacia `billing` sin ciclos, la función `SECURITY DEFINER` de la conciliación y la política de lectura de `suscripcion` para `ADMIN` y `OPERATOR`.
- Adrián: Autorizado el uso de `INotifier` en `notifications`, `putObject` en `storage`, `REDACTED_FIELDS` y el `400`/`402` en `shared`, el catálogo de `identity` y la numeración de facturas/comprobantes en §3.