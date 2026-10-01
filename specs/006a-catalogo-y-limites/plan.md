# Plan 006a — Catálogo y límites

> Spec: `./spec.md` (Aclarada, 2026-09-28) · Estado del plan: **Aprobado** (2026-09-30, §11) · Alineado con el código integrado el 2026-09-30 (`review.md`)

## 1. Resumen técnico

Esta spec construye la infraestructura base del catálogo de suscripciones de Nimbo: la tabla `plan` en PostgreSQL, el tipo de solo lectura `PlanLimits` y el puerto `IPlanLimitsProvider` que aísla a los demás módulos del esquema de facturación.
Siguiendo la decisión de arquitectura **ADR-0022** (resolución de DF-51 opción A) y la alineación con la spec 005 (carga y descarga):
- El puerto `IPlanLimitsProvider` y el tipo `PlanLimits` los declaró la spec 005 en `apps/api/src/modules/storage/application/plan-limits.ts`, con el token `I_PLAN_LIMITS_PROVIDER` (`Symbol`). La 006a no los modifica.
- `PlanLimits` es una `interface` con propiedades `readonly` y contiene estrictamente las cuotas que consume la carga: `maxFileBytes: bigint` y `storageQuotaBytes: bigint`.
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
| IV SOLID | ☑ | **S**: `PlanLimitsAdapter` tiene la única responsabilidad de adaptar la persistencia de `plan` a los límites de consumo. `PlanLimits` solo describe los dos límites de solo lectura. **O**: La incorporación de futuros planes o ajustes de cuotas se realiza mediante datos/migraciones sin alterar el contrato `IPlanLimitsProvider`. **L**: `PlanLimitsAdapter` sustituye a cualquier implementación o mock en pruebas sin alterar el comportamiento. **I**: El puerto expone únicamente el método `limitsFor(actor)` que consume el módulo de almacenamiento. No expone precios ni mutaciones. **D**: `storage` depende de su propia abstracción `IPlanLimitsProvider`, no de TypeORM ni de `billing`. |
| V YAGNI | ☑ | No se implementa la entidad `Subscription`, ni el value object `Money`, ni endpoints HTTP, ni oyentes de eventos (trasladados a spec 009 según PD-40). |
| VI DRY | ☑ | La única fuente de verdad de los límites es la base de datos (sembrada por migración). Los números mágicos no se replican en el código ni en los módulos consumidores. |
| VIII Fronteras | ☑ | Aplica ADR-0022 (DF-51 opción A): `storage` declara el puerto y `billing` lo implementa. `storage` no importa nada de `billing` (verificado por `boundaries.js`). `billing` solo expone sus contratos por `modules/billing/index.ts`. |
| IX Seguridad | ☑ | Sin exposición HTTP directa en esta spec. La tabla `plan` contiene información pública del sistema sin datos de clientes. |
| X Operabilidad | ☑ | El adaptador no escribe bitácoras: es una lectura de catálogo sin efectos y sin datos de cliente. Los errores (`PlanNotFoundError`, `PLAN_NOT_FOUND`) suben a quien llama, que ya registra la petición (§7). |
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
| `apps/api/src/modules/storage` | Ninguno: `PlanLimits`, `IPlanLimitsProvider` e `I_PLAN_LIMITS_PROVIDER` ya existen en `application/plan-limits.ts` (005) | — |
| `apps/api/src/modules/billing` | Implementa `PlanOrmEntity`, error de dominio `PlanNotFoundError`, adaptador `PlanLimitsAdapter` y `BillingModule` | `domain`, `infrastructure/persistence`, `infrastructure/adapters` |
| `apps/api/src/migrations` | `20260928233000-crear-tabla-plan.ts` y `20260928233500-sembrar-planes.ts` | Migraciones |
| `apps/api/src/plan-limits-binding.module.ts` | Cambia el proveedor provisional de 005 por `{ provide: I_PLAN_LIMITS_PROVIDER, useExisting: PlanLimitsAdapter }` e importa `BillingModule`. `AppModule` y `WorkerModule` ya importan este módulo | Composición raíz |

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
Ya existe desde la 005; la 006a lo consume tal cual:
```typescript
export interface PlanLimits {
  readonly maxFileBytes: bigint;
  readonly storageQuotaBytes: bigint;
}

export interface IPlanLimitsProvider {
  limitsFor(actor: Actor): Promise<PlanLimits>;
}

export const I_PLAN_LIMITS_PROVIDER = Symbol('IPlanLimitsProvider');
```
- `PlanLimits` es un tipo de solo lectura, no una clase: la inmutabilidad la garantiza `readonly` en compilación (CA-6), y el adaptador devuelve un objeto nuevo en cada llamada.
- `modules/storage/index.ts` exporta los tres.

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
  Exporta `BillingModule`, `PlanLimitsAdapter` y `PlanNotFoundError`.

### 3. En la raíz de composición (`apps/api/src/plan-limits-binding.module.ts`)
- Módulo `@Global()` creado en la 005. Importa `BillingModule` y cambia el proveedor provisional por:
  ```typescript
  {
    provide: I_PLAN_LIMITS_PROVIDER,
    useExisting: PlanLimitsAdapter,
  }
  ```

## 7. Observabilidad

- Sin bitácoras propias. `limitsFor` se llama en cada carga; registrarla añadiría ruido sin información útil. El `PlanNotFoundError` llega a quien llama y queda en su registro de la petición.
- Si la 007 consulta los límites en cada operación, se evalúa una caché y su métrica entonces.

## 8. Estrategia de pruebas

| Criterio | Nivel | Archivo |
|---|---|---|
| CA-1 (Semilla del catálogo oficial) | Integración | `apps/api/test/int/billing/plan-migration.int-spec.ts`, `plan-limits.adapter.int-spec.ts` |
| CA-2 (Límites por id de plan) | Unitario e integración | `billing/infrastructure/adapters/plan-limits.adapter.spec.ts`, `apps/api/test/int/billing/plan-limits.adapter.int-spec.ts` |
| CA-3 (Límites por slug) | Unitario e integración | `billing/infrastructure/adapters/plan-limits.adapter.spec.ts`, `apps/api/test/int/billing/plan-limits.adapter.int-spec.ts` |
| CA-4 (Plan inexistente lanza `PlanNotFoundError`) | Unitario e integración | `billing/domain/errors/plan-not-found.error.spec.ts`, adaptador (unitaria e int-spec) |
| CA-5 (Límites por actor devuelven Personal) | Unitario e integración | `billing/infrastructure/adapters/plan-limits.adapter.spec.ts`, int-spec (cliente y admin), `apps/api/src/plan-limits-binding.module.spec.ts` |
| CA-6 (Inmutabilidad y tipos de `PlanLimits`) | Tipos y unitario | `readonly` lo verifica `pnpm typecheck`. Las pruebas del adaptador comparan con `toEqual` contra literales `bigint` (`52428800n`…), que fallan si el valor es `number` o si sobra una propiedad. `plan.orm-entity.spec.ts` verifica el mapeo a `bigint` |
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

- Veredicto: Aprobado (2026-09-30, Adrián), registrado al cerrar la spec.
- Observaciones: las dos decisiones de arquitectura del plan se aceptaron antes del código: ADR-0016 (DF-23, DF-24) y ADR-0022 (DF-51 opción A), ambos el 2026-09-29. Adrián integró el PR #8 el 2026-09-30, y `review.md` (✅, sin bloqueantes) confirma que el código respeta las fronteras. Este plan se alineó después con lo integrado (`PlanLimits` de 005 como `interface`, enlace con `useExisting` en `PlanLimitsBindingModule`, sin bitácoras propias).
