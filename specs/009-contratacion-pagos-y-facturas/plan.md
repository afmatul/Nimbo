# Plan 009 — Contratación, pagos y facturas

> Spec: `./spec.md` · Estado del plan: Propuesto
> Obligatorio y ≤ 250 líneas. Dice **qué** archivos se tocan y **qué** se espera de cada uno; no es el código en
> prosa (sin cuerpos de funciones ni pseudocódigo). Lo aprueba Adrián antes de escribir código.

## 1. Resumen técnico
El módulo `billing` (M4) implementa el ciclo de contratación con pago simulado e historial de facturas, e integra los pendientes de suscripción de la Fase 1 (PD-40, PD-80):
- Escucha `identity.client-account-verified` para crear la suscripción inicial `personal` de forma idempotente, y provee una conciliación para cuentas existentes.
- Provee `GET /plans` con el catálogo mínimo filtrando planes desactivados (PD-40, PD-48, PD-86).
- Procesa el pago simulado con `SimulatedPaymentGateway` (tarjetas `4242...` aprueba, `4000...` rechaza) calculando IVA (12%) con regla `Math.round(precio / 1.12)` y monto en centavos con el VO `Money` (ADR-0016).
- Guarda la transacción (`SIM-AAAA-NNNNNN`), actualiza `suscripcion` al plan contratado por 30 días, genera la factura PDF correlativa (`NB-AAAA-NNNN`) con `PdfInvoiceGenerator` y la sube a MinIO mediante `IObjectStorage` (exportado desde `storage/index.ts`).
- Notifica el comprobante por correo encolando el mensaje en la cola `mail` de `notifications` vía `IMailer`.
- Conecta `PlanLimitsAdapter` y `SubscriptionAdministration` para leer la suscripción activa (degradando a Personal si la cuenta no está verificada, PD-80).
- Expone historial y descarga de facturas firmadas bajo RLS en la ruta web unificada `/suscripcion`.

## 2. Módulos, archivos y diseño
| Módulo / capa | Archivo (nuevo o cambiado) | Responsabilidad |
|---|---|---|
| Contracts | `packages/contracts/src/billing/subscription.ts` | Esquemas Zod: `SubscribeRequest`, `SubscribeResponse`, `RegisterPlansResponse`, `BillingHistoryResponse`, `InvoiceDownloadResponse`. Exportado en `index.ts`. |
| Storage | `apps/api/src/modules/storage/index.ts` | Exporta `IObjectStorage` e `I_OBJECT_STORAGE` para permitir a `billing` persistir facturas (requiere visto bueno del `architect` en §8). |
| Billing · dominio | `apps/api/src/modules/billing/domain/value-objects/money.ts` | VO `Money`: centavos enteros (ADR-0016), suma, resta, desglose de IVA 12% (`subtotal`, `iva`). |
| Billing · dominio | `apps/api/src/modules/billing/domain/entities/subscription.entity.ts` | Entidad `Subscription` (`userId`, `planId`, `estado`, `iniciadoEn`, `venceEn`). |
| Billing · dominio | `apps/api/src/modules/billing/domain/entities/payment.entity.ts` | Entidad `Payment` (`monto`, `tarjetaUltimos4`, `referencia`, `estado`). |
| Billing · dominio | `apps/api/src/modules/billing/domain/entities/invoice.entity.ts` | Entidad `Invoice` (`numeroFactura`, `subtotal`, `iva`, `total`, `nit`, `claveObjeto`). |
| Billing · dominio | `apps/api/src/modules/billing/domain/ports/i-payment-gateway.ts` | Puerto `IPaymentGateway.charge(params): Promise<ChargeResult>`. |
| Billing · dominio | `apps/api/src/modules/billing/domain/ports/i-invoice-generator.ts` | Puerto `IInvoiceGenerator.generate(invoiceData): Promise<Buffer>`. |
| Billing · dominio | `apps/api/src/modules/billing/domain/ports/i-billing-repository.ts` | Puerto de persistencia para suscripciones, transacciones y facturas. |
| Billing · dominio | `apps/api/src/modules/billing/domain/errors/billing.errors.ts` | `PaymentRejectedError` (402), `PlanNotAvailableError` (400), `InvoiceNotFoundError` (404). |
| Billing · aplicación | `apps/api/src/modules/billing/application/subscription.service.ts` | Orquesta contratación, cobro simulado, guardado en MinIO, actualización de suscripción y encolado de correo. |
| Billing · aplicación | `apps/api/src/modules/billing/application/account-verified.listener.ts` | `@OnEvent(CLIENT_ACCOUNT_VERIFIED)`: crea la suscripción `personal` idempotentemente (PD-40). |
| Billing · aplicación | `apps/api/src/modules/billing/application/subscription-reconciler.service.ts` | Conciliación de clientes verificados sin suscripción activa (PD-40). |
| Billing · aplicación | `apps/api/src/modules/billing/application/register-plan-catalog.service.ts` | Catálogo filtrando planes inactivos para el registro en `GET /plans` (PD-40, PD-86). |
| Billing · infra | `apps/api/src/modules/billing/infrastructure/adapters/simulated-payment-gateway.ts` | Implementa `IPaymentGateway` con lógica 4242/4000. |
| Billing · infra | `apps/api/src/modules/billing/infrastructure/adapters/pdf-invoice-generator.ts` | Implementa `IInvoiceGenerator` generando PDF estructurado en memoria. |
| Billing · infra | `apps/api/src/modules/billing/infrastructure/adapters/plan-limits.adapter.ts` | Modificado: consulta suscripción activa en `suscripcion`; si no existe, devuelve Personal (PD-80). |
| Billing · infra | `apps/api/src/modules/billing/infrastructure/adapters/subscription-administration.ts` | Modificado: cuenta clientes según plan activo real; reporta «Personal (sin verificar)» si no hay fila (PD-80). |
| Billing · infra | `apps/api/src/modules/billing/infrastructure/persistence/*.orm-entity.ts` | Entidades TypeORM: `SubscriptionOrmEntity`, `TransactionOrmEntity`, `InvoiceOrmEntity`. |
| Billing · infra | `apps/api/src/modules/billing/infrastructure/persistence/typeorm-billing.repository.ts` | Implementa `IBillingRepository` con TypeORM bajo RLS. |
| Billing · presentación | `apps/api/src/modules/billing/presentation/subscription.controller.ts` | Endpoints `POST /api/v1/billing/subscribe`, `GET /api/v1/billing/history`, `GET /api/v1/billing/invoices/:id/download`. |
| Billing · presentación | `apps/api/src/modules/billing/presentation/public-plans.controller.ts` | Endpoint público `GET /plans` para el registro (PD-40, PD-48). |
| Migración | `apps/api/src/migrations/20261010100000-crear-tablas-facturacion.ts` | Crea `suscripcion`, `transaccion` y `factura` con RLS y restricciones CHECK. |
| Web · identity | `apps/web/src/features/identity/plan-catalog.ts` | Actualizado para usar el contrato de `@nimbo/contracts` y la ruta oficial `GET /plans` (PD-48). |
| Web · billing | `apps/web/src/app/(app)/planes/contratar/page.tsx` | Pantalla de pago `/planes/contratar` (formulario, estados rechazado/aprobado y soporte para 001 CA-28). |
| Web · billing | `apps/web/src/app/(app)/(cliente)/suscripcion/page.tsx` | Pantalla de suscripción `/suscripcion` (plan activo, datos de facturación e historial de facturas; base para 010). |

- Puertos nuevos: `IPaymentGateway` e `IInvoiceGenerator` (internos de `billing`, Art. V.2(a)(c)).
- Dependencias entre módulos: `billing → storage` (`IObjectStorage` para subir y firmar PDFs); `billing → notifications` (`IMailer` para comprobante); `billing → identity` (evento `ClientAccountVerifiedEvent`, ADR-0019).

## 3. Datos
```sql
CREATE TABLE suscripcion (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES plan(id),
  estado VARCHAR(20) NOT NULL CHECK (estado IN ('activa', 'cancelada', 'vencida')),
  iniciado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  vence_en TIMESTAMPTZ,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_suscripcion_usuario UNIQUE (usuario_id)
);
CREATE TABLE transaccion (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES plan(id),
  monto_centavos INTEGER NOT NULL CHECK (monto_centavos >= 0),
  estado VARCHAR(20) NOT NULL CHECK (estado IN ('aprobada', 'rechazada')),
  tarjeta_ultimos4 VARCHAR(4) NOT NULL,
  referencia VARCHAR(50) NOT NULL UNIQUE,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE factura (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaccion_id UUID NOT NULL REFERENCES transaccion(id) ON DELETE CASCADE,
  usuario_id UUID NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
  numero_factura VARCHAR(30) NOT NULL UNIQUE,
  subtotal_centavos INTEGER NOT NULL CHECK (subtotal_centavos >= 0),
  iva_centavos INTEGER NOT NULL CHECK (iva_centavos >= 0),
  total_centavos INTEGER NOT NULL CHECK (total_centavos >= 0),
  nit VARCHAR(20) NOT NULL DEFAULT 'CF',
  clave_objeto VARCHAR(255) NOT NULL,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- RLS (RNF-05)
ALTER TABLE suscripcion ENABLE ROW LEVEL SECURITY;
ALTER TABLE suscripcion FORCE ROW LEVEL SECURITY;
CREATE POLICY suscripcion_propietario ON suscripcion FOR ALL USING (usuario_id = current_setting('nimbo.actor_id', true)::uuid);

ALTER TABLE transaccion ENABLE ROW LEVEL SECURITY;
ALTER TABLE transaccion FORCE ROW LEVEL SECURITY;
CREATE POLICY transaccion_propietario ON transaccion FOR ALL USING (usuario_id = current_setting('nimbo.actor_id', true)::uuid);

ALTER TABLE factura ENABLE ROW LEVEL SECURITY;
ALTER TABLE factura FORCE ROW LEVEL SECURITY;
CREATE POLICY factura_propietario ON factura FOR ALL USING (usuario_id = current_setting('nimbo.actor_id', true)::uuid);
```
- `down`: `DROP TABLE IF EXISTS factura, transaccion, suscripcion CASCADE;`

## 4. Contratos
| Método | Ruta | Rol | Request → Respuesta | Errores (`code`) |
|---|---|---|---|---|
| GET | `/plans` | `@Public()` | `void` → `{ plans: RegisterPlanItem[] }` | `500 PLAN_CATALOG_UNAVAILABLE` |
| POST | `/api/v1/billing/subscribe` | `@Roles('CLIENT')` | `{ planSlug, card, nit }` → `SubscribeResponse` | `400 BILLING_PLAN_NOT_AVAILABLE`, `402 BILLING_PAYMENT_REJECTED` |
| GET | `/api/v1/billing/history` | `@Roles('CLIENT')` | `void` → `BillingHistoryResponse` | `401 SHARED_UNAUTHORIZED` |
| GET | `/api/v1/billing/invoices/:id/download` | `@Roles('CLIENT')` | `void` → `{ downloadUrl, expiresInSeconds }` | `404 BILLING_INVOICE_NOT_FOUND` |

## 5. Seguridad y operación
- `actor: Actor` en todas las consultas de clientes; filtrado por `usuario_id = actor.id` y RLS forzado.
- Números de tarjeta y CVC nunca se guardan en base de datos ni se emiten al logger Pino; solo se persiste `tarjeta_ultimos4`.
- Facturas en MinIO con clave privada `invoices/{usuario_id}/{factura_id}.pdf` y entrega por URLs prefirmadas de 5 minutos.
- Bitácoras técnicas registran `billing.payment_attempted`, `billing.payment_approved` y `billing.payment_rejected` con `correlationId`, sin PII ni tarjetas.

## 6. Estrategia de pruebas (por riesgo)
| CA | Nivel | Archivo |
|---|---|---|
| CA-1, CA-2 | unit | `account-verified.listener.spec.ts`, `subscription-reconciler.service.spec.ts`: creación idempotente y conciliación. |
| CA-2 | int | `plan-limits.adapter.int-spec.ts`: límites reales calculados según suscripción activa vs sin suscripción. |
| CA-3 | int | `register-plans.int-spec.ts`: listado público de planes ordenado en `/plans`, omitiendo planes desactivados. |
| CA-4, CA-5 | unit | `simulated-payment-gateway.spec.ts`, `money.spec.ts`: validación de tarjeta 4242 vs 4000, cálculo exacto de IVA 12% con redondeo. |
| CA-4, CA-5, CA-6 | int | `subscribe.int-spec.ts`: flujo transaccional completo en Postgres y MinIO, cobro aprobado/rechazado y plan inactivo. |
| CA-7, CA-8 | int | `billing-history.int-spec.ts`: consulta de transacciones y generación de URL prefirmada de factura. |
| CA-7, CA-8 | iso | `test/isolation/billing.isolation.spec.ts`: cliente A no puede ver transacciones ni descargar facturas de cliente B. |
| CA-4, CA-5, CA-9 | web | `payment-form.spec.tsx`: renderizado, cálculo de IVA, estado rechazado/aprobado y preselección de plan de registro (CA-28). |
| CA-7 | web | `invoice-history-table.spec.tsx`: estado con facturas y estado vacío. |

## 7. Riesgos y coherencia con el diseño
- **Riesgos reales y mitigación**:
  - Generación de PDF lenta o pesada en memoria → Mitigación: plantilla ligera con PDFKit estructurado sin imágenes externas.
  - Falla en MinIO al subir la factura tras el cobro → Mitigación: transacción con reintento antes de responder al cliente.
- **Desviaciones de los diagramas**:
  - DF-23 queda resuelto en este plan con centavos enteros y el VO `Money`.
  - DF-25: la tabla `suscripcion` incluye `plan_id` (y deja preparado el diseño para `plan_pendiente_id` de la spec 010).
  - DF-65 y PD-80: actualiza `SubscriptionAdministration` y `PlanLimitsAdapter` para no retornar Personal fijo.
- **Pendientes que resuelve y actualiza**:
  - Cierra completamente **PD-40** (oyente Personal, conciliación y catálogo de registro) y **PD-80** (consulta de suscripción activa en límites y administración).
  - Cumple **PD-86** filtrando `desactivado_en IS NULL` en `/plans` y en la contratación.
  - El PR de esta spec actualizará `docs/sdd/pendientes.md` moviendo PD-40 y PD-80 a la tabla de «Cerrados».
- **Mockup de suscripción (`mockups/billing/suscripcion/`)**:
  - La pantalla se ubica en `/suscripcion` (`apps/web/src/app/(app)/(cliente)/suscripcion/page.tsx`). La spec 009 implementa la base visual: tarjeta de plan actual, datos de facturación e historial de facturas.
  - La spec 010 ampliará esta misma pantalla con los botones de renovación, cambio de plan y cancelación.
  - Quedan explícitamente fuera de 009: «Descargar todas» en ZIP y edición interactiva de datos de facturación fuera del pago.
- **ADR requeridos**: Ninguno nuevo; se rige por ADR-0016 (centavos y bytes), ADR-0018 (correo), ADR-0019 (eventos) y ADR-0022 (límites).

## 8. Aprobación
- `architect`: Pendiente. Requiere autorizar formalmente la exportación de `IObjectStorage` e `I_OBJECT_STORAGE` desde `apps/api/src/modules/storage/index.ts` hacia `billing` (módulo cuyo dueño es Adrián), validando que cumple el grafo de `architecture.md` §3 y no crea ciclos.
- Adrián: Pendiente
