# Plan 006a — Catálogo y límites

> Spec: `./spec.md` (Aclarada, 2026-09-28) · Estado del plan: **Propuesto** (pendiente de aprobación de arquitectura)

## 1. Resumen técnico

Esta spec construye la infraestructura base del catálogo de suscripciones de Nimbo: la tabla `plan` en PostgreSQL, el objeto de valor inmutable `PlanLimits` y el puerto `IPlanLimitsProvider` que aísla a los demás módulos del esquema de facturación.
Siguiendo la decisión de arquitectura **ADR-0022** (resolución de DF-51 opción A) y la alineación con la spec 005 (carga y descarga):
- El puerto `IPlanLimitsProvider` y el value object `PlanLimits` se ubican en `apps/api/src/modules/storage/application/plan-limits.ts`, identificados por el token `I_PLAN_LIMITS_PROVIDER`.
- `PlanLimits` contiene estrictamente las cuotas que consume la carga: `maxFileBytes: bigint` y `storageQuotaBytes: bigint`.
- El puerto exporta el método `limitsFor(actor: Actor): Promise<PlanLimits>`.
- El módulo `billing` (`apps/api/src/modules/billing/`) implementa este puerto mediante `PlanLimitsAdapter` (`apps/api/src/modules/billing/infrastructure/adapters/plan-limits.adapter.ts`).
- En esta fase (CA-5, Art. VI), `limitsFor(actor)` consulta la fila `personal` de la tabla `plan` en base de datos (`52428800n` bytes de archivo y `16106127360n` bytes de cuota) sin consultar tablas de usuario ni importar `identity`.
- La raíz de composición global (`PlanLimitsBindingModule`, introducido por la spec 005) registra el enlace `{ provide: I_PLAN_LIMITS_PROVIDER, useExisting: PlanLimitsAdapter }`.
- La tabla `plan` se crea con tipos exactos según **ADR-0016** (precios en centavos `integer`, almacenamiento y tamaños en bytes `bigint`). Conserva todas las columnas de la regla **RN-2** (precios, cuotas, editores, consultas de agente, versiones retenidas, días de papelera), sin RLS ni columna `activo`. Dos migraciones TypeORM crean la estructura y siembran los 4 planes oficiales con UUIDs estables fijos (CA-1, CA-9). No se duplica el índice en `slug` ya que la restricción `UNIQUE` crea el índice automáticamente.
- Siguiendo **PD-40**, el catálogo público por HTTP y el oyente de cuentas verificadas se trasladaron a la spec 009; por lo tanto, esta spec no expone rutas HTTP ni consume eventos.

## 2. Verificación contra la constitución

| Artículo | Cumple | Nota |
|---|---|---|
| I Spec manda | ☑ | El plan atiende exactamente los criterios CA-1 a CA-7 y CA-9, y las reglas RN-1 a RN-6 de `spec.md`. |
| IV SOLID | ☑ | **S**: `PlanLimitsAdapter` tiene la única responsabilidad de adaptar la persistencia de `plan` a los límites de consumo. `PlanLimits` solo encapsula la inmutabilidad y reglas de límites. **O**: La incorporación de futuros planes o ajustes de cuotas se realiza mediante datos/migraciones sin alterar el contrato `IPlanLimitsProvider`. **L**: `PlanLimitsAdapter` sustituye a cualquier implementación o mock en pruebas sin alterar el comportamiento. **I**: El puerto expone únicamente el método `limitsFor(actor)` que consume el módulo de almacenamiento. No expone precios ni mutaciones. **D**: `storage` depende de su propia abstracción `IPlanLimitsProvider`, no de TypeORM ni de `billing`. |
| V YAGNI | ☑ | No se implementa la entidad `Subscription`, ni el value object `Money`, ni endpoints HTTP, ni oyentes de eventos (trasladados a spec 009 según PD-40). No se crea `storage.module.ts` antes de la spec 005. |
| VI DRY | ☑ | La única fuente de verdad de los límites es la base de datos (sembrada por migración). Los números mágicos no se replican en el código ni en los módulos consumidores. |
| VIII Fronteras | ☑ | Aplica ADR-0022 (DF-51 opción A): `storage` declara el puerto y `billing` lo implementa. `storage` no importa nada de `billing` (verificado por `boundaries.js`). `billing` solo expone sus contratos por `modules/billing/index.ts`. |
| IX Seguridad | ☑ | Sin exposición HTTP directa en esta spec. La tabla `plan` contiene información pública del sistema sin datos de clientes. |
| X Operabilidad | ☑ | Registros estructurados mediante `pino` (`logger.info` / `logger.debug`) al inicializar el adaptador y consultar límites por actor. |
| XI Integridad | ☑ | Restricciones de integridad a nivel de base de datos (`CHECK` en `precio_centavos >= 0`, `cuota_bytes > 0`, etc.) e índice único en `slug`. Migración reversible con borrado limpio en `down`. |
| XII Degradación | ☑ | Ante usuarios sin suscripción o en caso de que la tabla de suscripción no exista, `limitsFor` degrada de forma predecible y segura devolviendo el plan `personal` (CA-5). |

## 3. Coherencia con los diagramas

| Diagrama | Clases / tablas usadas | ¿Se aparta del diagrama? | Acción |
|---|---|---|---|
| Clases M4 (`billing`) | `Plan`, `PlanOrmEntity`, `PlanLimitsAdapter` | No. `PlanLimitsAdapter` implementa el puerto definido en la arquitectura. | Refleja el diseño modular. |
| Clases M2 (`storage`) | `PlanLimits`, `IPlanLimitsProvider` | Sí (DF-51 opción A, ADR-0022): el puerto y value object se declaran en `storage` para romper el ciclo `storage ↔ billing`. Los campos se acotan a los requeridos por la carga en 005 (`maxFileBytes`, `storageQuotaBytes`). | Aceptado en ADR-0022. Redibujo en la fase de revisión. |
| E-R | tabla `plan` | Sí: `precio_centavos` en `integer` (DF-23) y `cuota_bytes`/`max_archivo_bytes` en `bigint` (DF-24 / DF-06). Columnas de RN-2 presentes. | Aceptado en ADR-0016. Redibujo en la fase de revisión. |
| Arquitectura §3/§5 | `billing`, `storage` | Sí: se elimina la arista `storage → billing`. `storage` es independiente de `billing`. | Cumple ADR-0022. |

Hallazgos `DF-xx` aplicados:
- **DF-06, DF-23, DF-24**: `Aceptado` vía ADR-0016 (dinero en centavos `integer`, cuotas y tamaños en bytes `bigint`).
- **DF-51 (Opción A)**: `Aceptado` vía ADR-0022 (`storage` declara `IPlanLimitsProvider` y `PlanLimits`; `billing` lo implementa).
- **DF-27**: Se mantiene `Abierto` para los demás puertos (`IAgentQuota`, `INotifier`, `IIndexQueue`).

## 3b. Módulos afectados

| Módulo | Cambio | Capa(s) |
|---|---|---|
| `apps/api/src/modules/storage` | Declara el value object inmutable `PlanLimits`, el puerto `IPlanLimitsProvider` y el token `I_PLAN_LIMITS_PROVIDER` en `application/plan-limits.ts` | `application` |
| `apps/api/src/modules/billing` | Implementa `PlanOrmEntity`, repositorio, error de dominio `PlanNotFoundError`, adaptador `PlanLimitsAdapter`, migraciones y módulo NestJS | `domain`, `infrastructure/persistence`, `infrastructure/adapters`, `application` |
| `apps/api/src/app.module.ts` | Registra `{ provide: I_PLAN_LIMITS_PROVIDER, useClass: PlanLimitsAdapter }` | Composición raíz |

### Dependencias entre módulos
- `billing → storage`: permitida para implementar `IPlanLimitsProvider`.
- `storage → billing`: **ninguna** (evita ciclo `storage ↔ billing`).

## 4. Modelo de datos

### DDL de la tabla `plan`
```sql
CREATE TABLE plan (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre VARCHAR(100) NOT NULL,
    slug VARCHAR(50) NOT NULL UNIQUE,
    descripcion TEXT,
    precio_centavos INTEGER NOT NULL CHECK (precio_centavos >= 0),
    cuota_bytes BIGINT NOT NULL CHECK (cuota_bytes > 0),
    max_archivo_bytes BIGINT NOT NULL CHECK (max_archivo_bytes > 0),
    max_editores INTEGER NOT NULL CHECK (max_editores >= 0),
    consultas_agente_mensual INTEGER NOT NULL CHECK (consultas_agente_mensual >= 0),
    versiones_retenidas INTEGER NOT NULL CHECK (versiones_retenidas >= 1),
    dias_retencion_papelera INTEGER NOT NULL CHECK (dias_retencion_papelera >= 1),
    creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Reversibilidad (`down`)
```sql
DROP TABLE IF EXISTS plan CASCADE;
```

### Datos de la semilla (CA-1, CA-9, RN-1)
Identificadores UUID estables predeterminados:
1. `personal` (`10000000-0000-4000-8000-000000000001`):
   - `nombre`: `'Personal'`
   - `precio_centavos`: `0` (Q0.00)
   - `cuota_bytes`: `16106127360` (15 GB)
   - `max_archivo_bytes`: `52428800` (50 MB)
   - `max_editores`: `0`
   - `consultas_agente_mensual`: `20`
   - `versiones_retenidas`: `3`
   - `dias_retencion_papelera`: `7`
2. `pro` (`10000000-0000-4000-8000-000000000002`):
   - `nombre`: `'Pro'`
   - `precio_centavos`: `4500` (Q45.00)
   - `cuota_bytes`: `107374182400` (100 GB)
   - `max_archivo_bytes`: `524288000` (500 MB)
   - `max_editores`: `3`
   - `consultas_agente_mensual`: `500`
   - `versiones_retenidas`: `30`
   - `dias_retencion_papelera`: `30`
3. `equipo` (`10000000-0000-4000-8000-000000000003`):
   - `nombre`: `'Equipo'`
   - `precio_centavos`: `11000` (Q110.00)
   - `cuota_bytes`: `375809638400` (350 GB)
   - `max_archivo_bytes`: `1073741824` (1 GB)
   - `max_editores`: `5`
   - `consultas_agente_mensual`: `2000`
   - `versiones_retenidas`: `60`
   - `dias_retencion_papelera`: `60`
4. `institucional` (`10000000-0000-4000-8000-000000000004`):
   - `nombre`: `'Institucional'`
   - `precio_centavos`: `45000` (Q450.00)
   - `cuota_bytes`: `2199023255552` (2 TB)
   - `max_archivo_bytes`: `2147483648` (2 GB)
   - `max_editores`: `5`
   - `consultas_agente_mensual`: `10000`
   - `versiones_retenidas`: `100`
   - `dias_retencion_papelera`: `90`

## 5. Contratos

### HTTP
No aplica. La lectura pública del catálogo por HTTP se traslada a la spec 009 (PD-40).

### Eventos
No aplica. La spec 006a no produce ni consume eventos asíncronos.

### Tiempo real
No aplica.

## 6. Diseño de componentes

### 1. En módulo `storage` (`apps/api/src/modules/storage/application/plan-limits.ts`)
Value object `PlanLimits`, puerto `IPlanLimitsProvider` y token `I_PLAN_LIMITS_PROVIDER`:
```typescript
import type { Actor } from '../../../shared';

export interface PlanLimitsProps {
  maxFileBytes: bigint;
  storageQuotaBytes: bigint;
}

export class PlanLimits {
  readonly maxFileBytes: bigint;
  readonly storageQuotaBytes: bigint;

  constructor(props: PlanLimitsProps) {
    this.maxFileBytes = props.maxFileBytes;
    this.storageQuotaBytes = props.storageQuotaBytes;
    Object.freeze(this);
  }
}

export const I_PLAN_LIMITS_PROVIDER = 'I_PLAN_LIMITS_PROVIDER';

export interface IPlanLimitsProvider {
  limitsFor(actor: Actor): Promise<PlanLimits>;
}
```
- `modules/storage/index.ts`: Exporta `PlanLimits`, `IPlanLimitsProvider` y `I_PLAN_LIMITS_PROVIDER`.

### 2. En módulo `billing` (`apps/api/src/modules/billing/`)
- `domain/errors/plan-not-found.error.ts`:
  Error de dominio que extiende `DomainError`:
  ```typescript
  export class PlanNotFoundError extends DomainError {
    constructor(identifier: string) {
      super(`Plan no encontrado: ${identifier}`, 'PLAN_NOT_FOUND', 404);
    }
  }
  ```
- `infrastructure/persistence/plan.orm-entity.ts`:
  Entidad TypeORM que mapea la tabla `plan`, con columnas `bigint` mapeadas con transformador.
- `infrastructure/adapters/plan-limits.adapter.ts`:
  Implementa `IPlanLimitsProvider`:
  - `limitsFor(actor: Actor)`: devuelve los límites del plan Personal consultando la fila `personal` de la tabla `plan` en base de datos (`maxFileBytes: 52428800n`, `storageQuotaBytes: 16106127360n`) sin consultar datos de usuario ni importar `identity` (CA-5, Art. VI).
  - Métodos propios de billing (`getLimitsByPlanId`, `getLimitsBySlug`) para consultar límites por ID o por slug para la spec 009 (Opción A).
- `billing.module.ts`:
  Configura TypeORM para `PlanOrmEntity`, provee y exporta `PlanLimitsAdapter`.
- `index.ts`:
  Exporta `BillingModule` y `PlanLimitsAdapter`.

### 3. En la raíz de composición (`apps/api/src/plan-limits-binding.module.ts`)
- Registra el proveedor global creado en spec 005:
  ```typescript
  {
    provide: I_PLAN_LIMITS_PROVIDER,
    useExisting: PlanLimitsAdapter,
  }
  ```

## 7. Observabilidad

- Bitácoras estructuradas `pino`:
  - `billing.plan_limits.queried`: registro en nivel `debug` con `{ actorId, durationMs }`.

## 8. Estrategia de pruebas

| Criterio | Nivel | Archivo propuesto |
|---|---|---|
| CA-1 (Semilla del catálogo oficial) | Integración | `apps/api/test/int/billing/plan-migration.int-spec.ts` |
| CA-4 (Plan inexistente lanza `PlanNotFoundError`) | Unitario | `apps/api/src/modules/billing/domain/errors/plan-not-found.error.spec.ts` |
| CA-5 (Límites por actor devuelven Personal) | Unitario | `apps/api/src/modules/billing/infrastructure/adapters/plan-limits.adapter.spec.ts` |
| CA-6 (Inmutabilidad y tipos de `PlanLimits`) | Unitario | `apps/api/src/modules/storage/application/plan-limits.spec.ts` |
| CA-7 (Reversibilidad de la migración `up`/`down`) | Integración | `apps/api/test/int/billing/plan-migration.int-spec.ts` |
| CA-9 (Identificadores estables y UUIDs fijos) | Integración | `apps/api/test/int/billing/plan-migration.int-spec.ts` |

## 9. Riesgos y mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| Ciclo de dependencias `storage ↔ billing` | Alta | Alta | Se adopta formalmente ADR-0022 (DF-51 opción A): `storage` declara el puerto y `billing` lo implementa. |
| Divergencia de contratos con spec 005 | Alta | Crítica | Se implementa exactamente la interfaz de 005 (`maxFileBytes`, `storageQuotaBytes`, `limitsFor`). |
| Inconsistencia de UUIDs entre ambientes de desarrollo y producción | Media | Alta | Los cuatro UUIDs v4 están fijos en el código de la migración de semilla (CA-9). |

## 10. Decisiones

- **ADR-0016**: Dinero en centavos de quetzal (`integer`), almacenamiento en bytes (`bigint`).
- **ADR-0022**: DF-51 opción A aceptada: `storage` declara `IPlanLimitsProvider` y `PlanLimits`; `billing` lo implementa.
- **Alineación con 005**: `storage/application/plan-limits.ts`, token `I_PLAN_LIMITS_PROVIDER`, campos `maxFileBytes` y `storageQuotaBytes`.
- **PD-40**: El catálogo público por HTTP y el oyente de cuentas se trasladan a la spec 009.

## 11. Aprobación de arquitectura

> Sección reservada para el subagente `architect`.

- Veredicto: Pendiente
- Observaciones:
