# Plan 009 — Contratación, pagos y facturas

> Spec: `./spec.md` · Estado del plan: Propuesto
> Obligatorio y ≤ 250 líneas. Dice **qué** archivos se tocan y **qué** se espera de cada uno; no es el código en
> prosa (sin cuerpos de funciones ni pseudocódigo). Lo aprueba Adrián antes de escribir código.

## 1. Resumen técnico
`billing` (M4) añade suscripción, pago simulado, factura PDF e historial, y reemplaza las reglas temporales de PD-80:
- Un oyente de `identity.client-account-verified` (ADR-0019) crea la suscripción Personal; una conciliación idempotente cubre a los verificados sin fila (PD-40).
- `GET /plans` devuelve el contrato mínimo del registro (`id`, `name`, `priceCents`, `free`), sin planes desactivados (PD-40, PD-48, PD-86). Reutiliza `IPlanRepository` de 008 y añade la consulta de planes no desactivados si no la tiene. No sustituye a `GET /api/v1/billing/plans` de 008 (008 RN-8).
- `POST /api/v1/billing/subscribe` cobra con `SimulatedPaymentGateway`, guarda la transacción, mueve la suscripción 30 días, emite la factura y encola el correo. Dinero con el VO `Money` en centavos (ADR-0016, DF-23).
- La factura PDF se guarda con `IObjectStorage` y se descarga con enlace temporal.
- `PlanLimitsAdapter` y `SubscriptionAdministration` leen la suscripción en vez de devolver Personal fijo (PD-80).
- Alcance: nada de `estado`, `plan_pendiente_id`, `uso_agente` ni `cuota_extra_bytes` (010 y 011b).

## 2. Módulos, archivos y diseño
| Módulo / capa | Archivo (nuevo o cambiado) | Responsabilidad |
|---|---|---|
| Contracts | `packages/contracts/src/billing/subscription.ts` e `index.ts` | Esquemas Zod: `SubscribeRequest`, `SubscribeResponse`, `RegisterPlansResponse`, `BillingHistoryResponse`, `InvoiceDownloadResponse` (ADR-0020). |
| Storage | `apps/api/src/modules/storage/index.ts` | Exporta `IObjectStorage` y su token para `billing` (visto bueno del `architect`, §8). |
| Billing · dominio | `domain/value-objects/money.ts` | `Money` en centavos enteros y desglose de IVA (RN-2). |
| Billing · dominio | `domain/entities/subscription.entity.ts`, `payment.entity.ts`, `invoice.entity.ts` | Entidades `Subscription`, `Payment`, `Invoice`. |
| Billing · dominio | `domain/ports/i-payment-gateway.ts`, `i-invoice-generator.ts`, `i-billing-repository.ts` | Puertos internos de `billing` (Art. V.2). |
| Billing · dominio | `domain/errors/payment-rejected.error.ts`, `plan-not-available.error.ts`, `invoice-not-found.error.ts` | Un error por archivo, como `plan-not-found.error.ts`. |
| Billing · aplicación | `application/subscription.service.ts` | Orquesta cobro, suscripción, factura y correo en el orden de CA-4 y CA-7. |
| Billing · aplicación | `application/account-verified.listener.ts`, `subscription-reconciler.service.ts` | Alta Personal idempotente y conciliación. |
| Billing · aplicación | `application/subscription-administration.ts` | Modificado (PD-80): usa la suscripción en vez de contar a todos como Personal. |
| Billing · aplicación | `application/billing-history.service.ts` | Historial y enlace de descarga del cliente. |
| Billing · infra | `infrastructure/adapters/simulated-payment-gateway.ts`, `pdf-invoice-generator.ts` | Implementan `IPaymentGateway` (RN-3) e `IInvoiceGenerator`. |
| Billing · infra | `infrastructure/adapters/plan-limits.adapter.ts` | Modificado (PD-80): lee la suscripción; sin fila devuelve Personal. |
| Billing · infra | `infrastructure/persistence/*.orm-entity.ts`, `typeorm-billing.repository.ts` | Entidades TypeORM y repositorio bajo RLS. |
| Billing · presentación | `presentation/subscription.controller.ts`, `public-plans.controller.ts` | Rutas de §4. |
| Migraciones | `apps/api/src/migrations/*-crear-suscripcion.ts`, `*-crear-transaccion.ts`, `*-crear-factura.ts` | Una por tabla, cada una con su `down` y su RLS. |
| Web · identity | `apps/web/src/features/identity/plan-catalog.ts` | Usa el contrato y `GET /plans` (PD-48). |
| Web · billing | `apps/web/src/app/(app)/(cliente)/planes/contratar/page.tsx` | Pantalla de pago (confirmar el grupo de rutas con el guard de sesión). |
| Web · billing | `apps/web/src/app/(app)/(cliente)/suscripcion/page.tsx` | Plan actual e historial; base para 010. |

- Puertos nuevos: `IPaymentGateway` e `IInvoiceGenerator`, internos de `billing`.
- Dependencias: `billing → storage` (`IObjectStorage`), `billing → notifications` (`IMailer`, ADR-0018), `billing → identity` (solo el evento, ADR-0019).
- El correo y el PDF se disparan después de guardar la transacción aprobada. Un fallo de ellos no revierte el cobro (ver riesgos).

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
-- 2.ª migración
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
-- 3.ª migración
CREATE SEQUENCE factura_numero_seq;
CREATE TABLE factura (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaccion_id UUID NOT NULL UNIQUE REFERENCES transaccion(id) ON DELETE RESTRICT,
  usuario_id UUID NOT NULL REFERENCES usuario(id) ON DELETE RESTRICT,
  numero VARCHAR(20) NOT NULL UNIQUE,
  subtotal_centavos INTEGER NOT NULL CHECK (subtotal_centavos >= 0),
  iva_centavos INTEGER NOT NULL CHECK (iva_centavos >= 0),
  total_centavos INTEGER NOT NULL CHECK (total_centavos > 0),
  nit VARCHAR(20) NOT NULL DEFAULT 'CF',
  clave_objeto VARCHAR(255) NOT NULL,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Cada tabla: ENABLE + FORCE ROW LEVEL SECURITY y política por propietario (usuario_id = actor).
```
- Numeración: `referencia` = `SIM-{año}-{secuencia a 6 dígitos}` y `numero` = `NB-{año}-{secuencia a 4 dígitos}`, tomadas de las secuencias (sin carreras). Las secuencias no se reinician por año. Propuesta a confirmar con Adrián.
- `transaccion` y `factura` usan `RESTRICT`: RN-7 exige conservarlas 7 años. `suscripcion` usa `CASCADE`.
- `uq_suscripcion_usuario` asume una fila por cliente (DF-25, DF-35). La 010 añade `estado` y `plan_pendiente_id` en su propia migración.
- Las políticas copian el patrón de las migraciones de 005 (nombre de la variable de sesión incluido). El oyente y la conciliación escriben sin actor y siguen ADR-0021.
- `down` de cada migración: elimina su tabla y su secuencia. Orden inverso: factura, transacción, suscripción.

## 4. Contratos
| Método | Ruta | Rol | Request → Respuesta | Errores (`code`) |
|---|---|---|---|---|
| GET | `/plans` (ruta que ya consume `plan-catalog.ts`; confirmar el prefijo global) | `@Public()` | — → `{ plans: [{ id, name, priceCents, free }] }` | `500 PLAN_CATALOG_UNAVAILABLE` |
| POST | `/api/v1/billing/subscribe` | `@Roles('CLIENT')` | `{ planSlug, card, nit }` → `SubscribeResponse` (referencia, plan, vencimiento, montos) | `400 BILLING_PLAN_NOT_AVAILABLE`, `402 BILLING_PAYMENT_REJECTED`, `422` con los campos |
| GET | `/api/v1/billing/history` | `@Roles('CLIENT')` | — → `BillingHistoryResponse` | `401 SHARED_UNAUTHORIZED` |
| GET | `/api/v1/billing/invoices/:id/download` | `@Roles('CLIENT')` | — → `{ downloadUrl, expiresInSeconds }` | `404 BILLING_INVOICE_NOT_FOUND` |

- Los montos viajan como enteros en centavos (RN-1). Los roles internos reciben `403 SHARED_FORBIDDEN`.

## 5. Seguridad y operación
- Servicios de cliente con `actor: Actor`; RLS forzado y filtro por `usuario_id` (RNF-05).
- El número de tarjeta, el CVC y el NIT no se guardan ni llegan al logger; solo marca y últimos 4 dígitos.
- PDF en `invoices/{usuario_id}/{factura_id}.pdf`, privado, con enlace prefirmado de 5 minutos.
- Bitácora técnica: `billing.payment_approved` y `billing.payment_rejected` con `correlationId`, sin datos personales. No hay auditoría RF-07 (spec §8).

## 6. Estrategia de pruebas (por riesgo)
| CA | Nivel | Archivo |
|---|---|---|
| CA-1, CA-2 | int | `account-verified.listener.int-spec.ts`, `subscription-reconciler.int-spec.ts`: alta, repetición y conciliación. |
| CA-2 | int | `plan-limits.adapter.int-spec.ts`, `subscription-administration.int-spec.ts`: con fila, sin fila. |
| CA-3 | int | `public-plans.int-spec.ts`: orden, `free` y exclusión de desactivados, sin sesión. |
| CA-4, CA-5 | unit | `money.spec.ts` (9 821 y 1 179 para 11 000, mitades), `simulated-payment-gateway.spec.ts`. |
| CA-4, CA-5, CA-6 | int | `subscribe.int-spec.ts`: aprobado, rechazado (suscripción intacta), plan no disponible y datos inválidos. |
| CA-7 | int | `subscribe-invoice.int-spec.ts`: factura, PDF en MinIO y correo encolado solo si se aprueba. |
| CA-8, CA-9 | int | `billing-history.int-spec.ts`: historial, vacío y enlace de descarga. |
| CA-8, CA-9 | iso | `test/isolation/billing.isolation.spec.ts`: el cliente A no ve ni descarga lo del B. |
| CA-4 a CA-6 | web | `payment-form.spec.tsx`: estados y resumen con IVA. |
| CA-8, CA-9 | web | `subscription-page.spec.tsx`: con facturas, vacío y descarga. |

## 7. Riesgos y coherencia con el diseño
- **Falla de MinIO o del correo tras un cobro aprobado**: la transacción y la suscripción ya están guardadas. Mitigación: reintento acotado de la factura y correo por la cola `mail`, y el historial muestra el pago aunque falte el PDF hasta que se reintente.
- **Conciliación y fronteras**: listar clientes verificados exige leer `identity`, y `billing` solo importa contratos de evento de su `index.ts` (architecture §3). Se resuelve como ya lo hace `SubscriptionAdministration`; lo confirma el `architect`.
- **PDF pesado en memoria**: plantilla ligera sin imágenes externas.
- **Vencimiento sin 010**: pasada `vence_en`, los límites no cambian hasta que 010 lo defina.
- **Desviaciones de los diagramas**: DF-23 resuelto con centavos y `Money`. DF-25 y DF-26 no se adelantan. DF-65 y PD-80 se cumplen en los dos lugares. Se abre un DF en `design-findings.md` en el mismo PR por `GET /plans` como contrato aparte de 008 y por la separación factura/comprobante.
- **Pendientes**: el PR cierra PD-40 y PD-80 en `pendientes.md` y referencia PD-86, que sigue abierto por 010.
- **Mockups**: la 009 usa los de `billing/pago/` y `billing/suscripcion/`. Quedan fuera «Descargar todas» y la edición de datos de facturación.
- **ADR requeridos**: ninguno nuevo; rigen ADR-0016, ADR-0018, ADR-0019, ADR-0020, ADR-0021 y ADR-0022.

## 8. Aprobación
- `architect`: pendiente. Debe aprobar (1) exportar `IObjectStorage` desde `storage/index.ts` hacia `billing` sin ciclos y (2) cómo `billing` obtiene los clientes verificados para la conciliación.
- Adrián: pendiente. Además de la aprobación, resuelve las preguntas abiertas de spec §8 y la numeración de §3.
