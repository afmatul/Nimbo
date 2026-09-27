# Spec 006a — Catálogo y límites

| Campo | Valor |
|---|---|
| Estado | Borrador |
| Dueño | Fátima |
| Fase | 1 |
| Requisitos | RF-19 (parcial), RNF-06, RNF-10, RNF-11 |
| Depende de | 000 |
| Última actualización | 2026-09-27 |

## 1. Contexto y problema
Los módulos centrales de almacenamiento (005 carga y descarga, 007 cuota) y edición (016 ONLYOFFICE) necesitan verificar restricciones de cuenta en tiempo real: espacio total disponible, tamaño máximo por archivo admitido y número de editores simultáneos permitidos. Actualmente no existe una infraestructura de planes en base de datos ni una interfaz común para consultar estos límites, lo que provocaría que cada módulo queme números mágicos o se acople a esquemas prematuros de facturación.

## 2. Objetivo
Proveer la infraestructura base del catálogo de planes en PostgreSQL (tabla `plan` con semilla de los 4 planes comerciales) y el puerto desacoplado `IPlanLimitsProvider` con su value object `PlanLimits`, permitiendo a cualquier módulo consultar los límites operativos de forma tipada, inmutable y sin acoplamiento a la base de datos de facturación.

## 3. Actores
- **Sistema**: módulos consumidores internos (`storage`, `editing`, `intelligence`, `billing`).
- **Cliente**: usuario sujeto a los límites de su plan activo.
- **Administrador**: rol interno que en fases posteriores gestionará el catálogo (spec 011).

## 4. Historias de usuario
- **HU-1**: Como módulo del sistema (ej. almacenamiento o edición), quiero consultar los límites vigentes de un plan a través del puerto `IPlanLimitsProvider`, para aplicar cuotas y restricciones sin acoplarme directamente a la persistencia de facturación.
- **HU-2**: Como sistema, quiero contar con la tabla `plan` sembrada en base de datos desde la migración inicial con los 4 planes oficiales del producto (Personal, Pro, Equipo, Institucional), para garantizar datos consistentes en todos los ambientes.
- **HU-3**: Como desarrollador de otros módulos, quiero que los límites se devuelvan en un value object inmutable `PlanLimits` con tamaños en bytes y contadores enteros, para evitar errores de conversión y efectos secundarios.

## 5. Criterios de aceptación
> Formato Dado/Cuando/Entonces. Trazados a RF-19 y RNF asociados.

- **CA-1** (HU-2, RF-19, RNF-10) — Semilla del catálogo oficial
  - **Dado** que se ejecutan las migraciones del sistema sobre una base de datos limpia,
  - **Cuando** se consulta la tabla `plan`,
  - **Entonces** existen exactamente los 4 planes comerciales oficiales (`personal`, `pro`, `equipo`, `institucional`) con sus identificadores UUID, nombres, descripciones, precios en centavos (0, 4500, 11000, 45000), cuotas y tamaños máximos en bytes, límites de editores, consultas de agente, versiones y retención en papelera conforme a la regla RN-1.

- **CA-2** (HU-1, RF-19) — Consulta de límites por ID de plan
  - **Dado** un `planId` correspondiente a un plan existente en el catálogo,
  - **Cuando** se invoca `IPlanLimitsProvider.getLimitsByPlanId(planId)`,
  - **Entonces** devuelve una instancia de `PlanLimits` con los límites operativos exactos asociados a ese plan.

- **CA-3** (HU-1, RF-19) — Consulta de límites por slug de plan
  - **Dado** un slug válido (`'personal'`, `'pro'`, `'equipo'`, `'institucional'`),
  - **Cuando** se invoca `IPlanLimitsProvider.getLimitsBySlug(slug)`,
  - **Entonces** devuelve la instancia de `PlanLimits` correspondiente.

- **CA-4** (HU-1, RF-19) — Plan inexistente (caso de error)
  - **Dado** un `planId` o `slug` que no existe en el catálogo,
  - **Cuando** se solicita su consulta mediante `IPlanLimitsProvider`,
  - **Entonces** se lanza un error de dominio `PlanNotFoundError` con código `PLAN_NOT_FOUND` y mensaje descriptivo en español, sin retornar valores nulos ni objetos incompletos.

- **CA-5** (HU-1, RF-19) — Consulta de límites de usuario con plan por defecto
  - **Dado** un usuario registrado que aún no posee una suscripción explícita registrada,
  - **Cuando** se invoca `IPlanLimitsProvider.getLimitsForUser(userId)`,
  - **Entonces** se retornan los límites correspondientes al plan base `personal`.

- **CA-6** (HU-3, ADR-0016, RNF-06) — Inmutabilidad y tipos del Value Object
  - **Dado** el objeto `PlanLimits`,
  - **Cuando** es instanciado,
  - **Entonces** todas sus propiedades son de solo lectura (`readonly`), con tipos `bigint` para almacenamiento en bytes (`storageBytes`, `maxFileSizeBytes`) y enteros seguros para editores, consultas y días de retención.

- **CA-7** (HU-2, RNF-10) — Reversibilidad de migración
  - **Dado** que la migración de `plan` fue aplicada con éxito,
  - **Cuando** se ejecuta la reversión (`down`),
  - **Entonces** la tabla `plan` y sus tipos asociados se eliminan limpiamente de PostgreSQL.

## 6. Reglas de negocio
- **RN-1** (Catálogo oficial y límites, ADR-0016, product-context.md §3):
  1. **Personal**: Q0.00 (`0` centavos), 15 GB (`16,106,127,360` bytes), máx. 50 MB (`52,428,800` bytes), 0 editores simultáneos (edición solo lectura), 20 consultas agente/mes, 3 versiones retenidas, 7 días en papelera.
  2. **Pro**: Q45.00 (`4500` centavos), 100 GB (`107,374,182,400` bytes), máx. 500 MB (`524,288,000` bytes), 3 editores simultáneos, 500 consultas agente/mes, 30 versiones retenidas, 30 días en papelera.
  3. **Equipo**: Q110.00 (`11000` centavos), 350 GB (`375,809,638,400` bytes), máx. 1 GB (`1,073,741,824` bytes), 5 editores simultáneos, 2 000 consultas agente/mes, 60 versiones retenidas, 60 días en papelera.
  4. **Institucional**: Q450.00 (`45000` centavos), 2 TB (`2,199,023,255,552` bytes), máx. 2 GB (`2,147,483,648` bytes), 5 editores simultáneos, 10 000 consultas agente/mes, 100 versiones retenidas, 90 días en papelera.
- **RN-2**: La tabla en base de datos se denomina `plan` (singular, snake_case), con columnas `id uuid PRIMARY KEY`, `nombre varchar NOT NULL`, `slug varchar UNIQUE NOT NULL`, `descripcion text`, `precio_centavos integer NOT NULL`, `cuota_bytes bigint NOT NULL`, `max_archivo_bytes bigint NOT NULL`, `max_editores integer NOT NULL`, `consultas_agente_mensual integer NOT NULL`, `versiones_retenidas integer NOT NULL`, `dias_retencion_papelera integer NOT NULL`, `creado_en timestamptz NOT NULL`, `actualizado_en timestamptz NOT NULL`.
- **RN-3**: Los límites se consultan exclusivamente a través de `IPlanLimitsProvider`. Ningún módulo externo puede realizar consultas SQL directas a la tabla `plan` (Art. VIII).

## 7. Requisitos no funcionales aplicables
| RNF | Cómo aplica aquí | Cómo se verifica |
|---|---|---|
| RNF-06 | Identificadores de planes generados con UUID v4. | Prueba unitaria y verificación de esquema en Postgres. |
| RNF-10 | Migración versionada con `up` y `down` que deja la BD limpia al revertir. | Prueba de migración y reversión en suite de integración. |
| RNF-11 | Cobertura ≥ 60% en la lógica de dominio (`PlanLimits`) y servicio proveedor. | Reporte de cobertura en Jest. |

## 8. Seguridad y privacidad
- ¿Toca contenido de archivos? **No**. Solo maneja metadatos de límites y catálogo del sistema.
- ¿Qué acciones van a auditoría (RF-07)? **Ninguna en esta spec** (la creación/modificación de planes por el Administrador se auditará en la spec 011).
- ¿Qué operaciones requieren límite de tasa? **Ninguna** (las consultas son internas entre servicios de la aplicación).
- ¿Qué NO debe aparecer en bitácoras? No se manejan credenciales ni datos privados de usuarios.

## 9. Experiencia de usuario
- **Sin interfaz**: Esta spec es 100% de backend e infraestructura de catálogo y límites. La interfaz gráfica del comparador de planes para el usuario se implementa en la **spec 008**, y la gestión de catálogo por el administrador en la **spec 011**.

## 10. Fuera de alcance
- Pantallas visuales de planes o comparador (spec 008).
- Pasarela de pago o cobro simulado (spec 009).
- Modificación dinámica del catálogo vía endpoints REST de administración (spec 011).
- Múltiples monedas o cobro prorrateado (fuera de alcance general).

## 11. Preguntas
- [RESUELTA] ¿El plan Personal permite editores simultáneos? → No, la edición es de solo lectura (límite = 0 editores simultáneos).
- [RESUELTA] ¿Qué unidades deben tener los precios y cuotas? → Centavos de quetzal (`integer`) y bytes (`bigint`) según ADR-0016.
- [ABIERTA] ¿El método `getLimitsForUser` debe consultar una tabla de suscripciones o asumir plan por defecto en Fase 1? — bloquea: no (se resuelve en el plan con fallback a `personal` hasta que exista la tabla `suscripcion`).

## 12. Registro de cambios
| Fecha | Cambio | Motivo | Aprobó |
|---|---|---|---|
| 2026-09-27 | Creación inicial en estado Borrador | Inicio de la spec de catálogo y límites | Fátima |
