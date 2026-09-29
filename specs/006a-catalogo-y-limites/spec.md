# Spec 006a — Catálogo y límites

| Campo | Valor |
|---|---|
| Estado | Borrador |
| Dueño | Fátima |
| Fase | 1 |
| Requisitos | RF-19 (parcial), RNF-10, RNF-11 |
| Depende de | 000 |
| Habilita | 005 y 007 (límites), 008. El catálogo público y la suscripción Personal los hace la 009 (PD-40) |
| Última actualización | 2026-09-29 |

## 1. Contexto y problema

Los módulos de almacenamiento (005 carga y descarga, 007 cuota) y edición (016) necesitan, en el momento de la operación, el espacio total, el tamaño máximo por archivo y el número de editores simultáneos. Hoy no hay catálogo en base de datos ni un puerto común para leer esos límites, así que cada módulo tendería a copiar cifras o a acoplarse a un esquema de facturación que todavía no existe. La pantalla de registro, la suscripción Personal y el evento de cuenta verificada quedan para la 009 (PD-40).

## 2. Objetivo

La tabla `plan` queda sembrada con los cuatro planes oficiales. Los módulos que aplican cuota o cupos leen un `PlanLimits` inmutable por el puerto `IPlanLimitsProvider`, sin consultar la tabla. Mientras no exista `suscripcion`, toda cuenta recibe los límites de Personal. Esta spec no publica el catálogo por HTTP.

## 3. Actores

- **Sistema**: módulos consumidores (`storage`, `editing`, `billing`). `intelligence` lee de `PlanLimits` el cupo de consultas; el contador de uso es `IAgentQuota` y queda fuera de esta spec. El visitante que se registra lee el catálogo en la 009.
- **Cliente**: queda sujeto a los límites de su plan. En esta spec ese plan es Personal.
- **Administrador**: gestionará el catálogo en la spec 011.

## 4. Historias de usuario

- **HU-1**: Como módulo del sistema (almacenamiento o edición), quiero consultar los límites vigentes de un plan a través de `IPlanLimitsProvider`, para aplicar cuotas y restricciones sin acoplarme a la persistencia de facturación.
- **HU-2**: Como sistema, quiero la tabla `plan` sembrada en la migración inicial con los cuatro planes oficiales (Personal, Pro, Equipo, Institucional), para que todos los ambientes tengan los mismos datos.
- **HU-3**: Como desarrollador de otros módulos, quiero los límites en un value object inmutable `PlanLimits`, con tamaños en `bigint` y contadores enteros, para evitar conversiones y efectos secundarios.

## 5. Criterios de aceptación

> Formato Dado/Cuando/Entonces. Trazados a RF-19 y a los RNF de esta spec.

- **CA-1** (HU-2, RF-19, RNF-10) — Semilla del catálogo oficial
  - **Dado** que se ejecutan las migraciones sobre una base de datos limpia,
  - **Cuando** se consulta la tabla `plan`,
  - **Entonces** existen exactamente los cuatro planes (`personal`, `pro`, `equipo`, `institucional`) con los UUID fijos de CA-9, sus nombres, descripciones, precios en centavos (0, 4500, 11000, 45000), cuotas y tamaños máximos en bytes, límites de editores, consultas de agente, versiones retenidas y días de papelera, conforme a RN-1.

- **CA-2** (HU-1, RF-19) — Consulta de límites por id de plan
  - **Dado** un `planId` de un plan existente,
  - **Cuando** se invoca `IPlanLimitsProvider.getLimitsByPlanId(planId)`,
  - **Entonces** devuelve el `PlanLimits` de ese plan.

- **CA-3** (HU-1, RF-19) — Consulta de límites por slug
  - **Dado** un slug válido (`personal`, `pro`, `equipo`, `institucional`),
  - **Cuando** se invoca `IPlanLimitsProvider.getLimitsBySlug(slug)`,
  - **Entonces** devuelve el `PlanLimits` correspondiente.

- **CA-4** (HU-1, RF-19) — Plan inexistente
  - **Dado** un `planId` o un slug que no existe,
  - **Cuando** se consulta por `IPlanLimitsProvider`,
  - **Entonces** se lanza `PlanNotFoundError` con código `PLAN_NOT_FOUND` y mensaje en español, sin devolver nulos ni objetos incompletos.

- **CA-5** (HU-1, RF-19) — Límites de una cuenta sin suscripción
  - **Dado** un `userId` cualquiera y que la tabla `suscripcion` todavía no existe,
  - **Cuando** se invoca `IPlanLimitsProvider.getLimitsForUser(userId)`,
  - **Entonces** devuelve el `PlanLimits` de `personal`,
  - **Y** la implementación no consulta `usuario` ni importa `identity`.
  - La spec 009, al crear `suscripcion`, conserva esta firma y pasa a leer el plan vigente. Si no hay fila, sigue devolviendo `personal`.

- **CA-6** (HU-3, RF-19, ADR-0016) — Inmutabilidad y tipos
  - **Dado** un `PlanLimits`,
  - **Cuando** se instancia,
  - **Entonces** todas sus propiedades son `readonly` y son exactamente estas:
    - `storageBytes` y `maxFileSizeBytes`, tipo `bigint`;
    - `maxEditors`, `agentQueriesPerMonth`, `retainedVersions` y `trashRetentionDays`, enteros.
  - El precio no forma parte de `PlanLimits`.

- **CA-7** (HU-2, RNF-10) — Reversibilidad de la migración
  - **Dado** que la migración de `plan` fue aplicada,
  - **Cuando** se ejecuta `down`,
  - **Entonces** la tabla `plan` y sus tipos asociados desaparecen de PostgreSQL.

- **CA-9** (HU-2, RF-19) — Identificadores estables
  - **Dado** la migración de semilla aplicada en dos bases distintas,
  - **Cuando** se comparan las filas por `slug`,
  - **Entonces** cada plan tiene el mismo UUID en ambas. Esos cuatro UUID están escritos en la migración.

## 6. Reglas de negocio

- **RN-1** (Catálogo oficial, ADR-0016, product-context.md §3). GB y TB de esta tabla son potencias de 1024: 1 MB = 1 048 576 bytes, 1 GB = 1 073 741 824 bytes, 1 TB = 1 099 511 627 776 bytes. La pantalla formatea a Q y a GB. La base y `PlanLimits` guardan centavos y bytes.
  1. **Personal**: Q0.00 (`0` centavos), 15 GB (`16 106 127 360` bytes), máx. 50 MB (`52 428 800` bytes), 0 editores simultáneos (edición solo lectura), 20 consultas agente/mes, 3 versiones retenidas, 7 días en papelera.
  2. **Pro**: Q45.00 (`4500` centavos), 100 GB (`107 374 182 400` bytes), máx. 500 MB (`524 288 000` bytes), 3 editores simultáneos, 500 consultas agente/mes, 30 versiones retenidas, 30 días en papelera.
  3. **Equipo**: Q110.00 (`11000` centavos), 350 GB (`375 809 638 400` bytes), máx. 1 GB (`1 073 741 824` bytes), 5 editores simultáneos, 2 000 consultas agente/mes, 60 versiones retenidas, 60 días en papelera.
  4. **Institucional**: Q450.00 (`45000` centavos), 2 TB (`2 199 023 255 552` bytes), máx. 2 GB (`2 147 483 648` bytes), 5 editores simultáneos, 10 000 consultas agente/mes, 100 versiones retenidas, 90 días en papelera.
- **RN-2**: La tabla se llama `plan`, con columnas `id uuid PRIMARY KEY`, `nombre varchar NOT NULL`, `slug varchar UNIQUE NOT NULL`, `descripcion text`, `precio_centavos integer NOT NULL`, `cuota_bytes bigint NOT NULL`, `max_archivo_bytes bigint NOT NULL`, `max_editores integer NOT NULL`, `consultas_agente_mensual integer NOT NULL`, `versiones_retenidas integer NOT NULL`, `dias_retencion_papelera integer NOT NULL`, `creado_en timestamptz NOT NULL`, `actualizado_en timestamptz NOT NULL`.
- **RN-3**: Los límites entre módulos salen solo de `IPlanLimitsProvider`. Ningún módulo externo ejecuta SQL contra `plan` (Art. VIII).
- **RN-4** (DF-51, opción A, aceptada en ADR-0021 el 2026-09-29): `IPlanLimitsProvider` lo declara `storage` y lo implementa `billing`. `storage` no depende de `billing`. `editing` lo reutiliza desde `storage`, de quien ya depende. Para cumplir esta spec, `billing` no importa entidades de `storage`. Esta aceptación no bloquea el plan de 005: la carga consume el puerto dentro de `storage` y no espera a `IAgentQuota`, a `IIndexQueue` ni a la decisión de las facturas. El uso de `IObjectStorage` para facturas sigue abierto y se cierra en 009.
- **RN-5** (PD-40): 006a no crea filas en `suscripcion`, no consume `identity.client-account-verified` y no expone el catálogo por HTTP. La cuenta nueva recibe los límites de Personal por CA-5. El oyente idempotente, la conciliación de cuentas verificadas sin suscripción y la lectura pública (con marca de plan gratuito) son de la 009. Hasta entonces el registro (001) usa `catalogo-no-disponible`.
- **RN-6**: El identificador de cada plan es un UUID fijo (CA-9), de acuerdo con el Art. IX.6. El slug es la clave de negocio estable.

## 7. Requisitos no funcionales aplicables

| RNF | Cómo aplica aquí | Cómo se verifica |
|---|---|---|
| RNF-10 | Migración versionada con `up` y `down`. | CA-7 |
| RNF-11 | Cobertura ≥ 60 % de `PlanLimits` y del proveedor. | Reporte de Jest |

## 8. Seguridad y privacidad

- ¿Toca contenido de archivos? **No**. Solo metadatos de catálogo y límites.
- ¿Qué acciones van a auditoría (RF-07)? **Ninguna en esta spec**. El alta y la modificación de planes por el Administrador se auditan en la 011.
- ¿Qué operaciones requieren límite de tasa? **Ninguna**. Los límites entre módulos son llamadas internas. No hay ruta pública.
- ¿Qué no debe aparecer en bitácoras? Credenciales, tokens y datos privados de usuarios. Esta spec no los maneja.
- El `userId` de CA-5 no se registra en bitácoras junto con el correo.

## 9. Experiencia de usuario

- **Sin pantallas propias.** El comparador es la spec 008. La gestión del administrador es la spec 011. La lectura pública para el registro es la spec 009 (PD-40). Hasta entonces la 001 muestra `catalogo-no-disponible`.
- Esta spec no formatea precios ni tamaños en una respuesta HTTP.

## 10. Fuera de alcance

- Pantallas de planes o comparador (spec 008).
- Pasarela de pago, cobro simulado y facturas (spec 009).
- Crear o leer `suscripcion`, el oyente de `identity.client-account-verified` y la conciliación de cuentas sin suscripción (PD-40, spec 009).
- Lectura pública del catálogo para el registro: `id`, nombre, precio en centavos, marca de plan gratuito y serialización HTTP de los bytes (PD-40, spec 009). La 006a no abre esa ruta.
- El value object `Money` y el cambio de `transaccion.monto` a centavos (ADR-0016, spec 009). Aquí el precio del plan es `precio_centavos integer`.
- `IAgentQuota` y el contador de consultas. DF-27 sigue abierto.
- Modificación del catálogo por la API de administración (spec 011).
- Formatear quetzales o gigabytes en el backend.
- Varias monedas o cobro prorrateado.

## 11. Preguntas

- [RESUELTA] ¿El plan Personal permite editores simultáneos? → No. La edición es solo lectura (0 editores). (2026-09-27, Fátima)
- [RESUELTA] ¿Qué unidades tienen precios y cuotas? → Centavos de quetzal (`integer`) y bytes (`bigint`). 1 GB = 1024³. ADR-0016. (2026-09-27, Fátima)
- [RESUELTA] ¿`getLimitsForUser` consulta `suscripcion` o asume Personal? → En 006a asume `personal` y no lee `usuario` ni `suscripcion` (CA-5). La 009 conserva la firma y lee la suscripción vigente. No bloquea. (2026-09-27)
- [RESUELTA] ¿La 006a atiende el PD-40? → No. El oyente, la conciliación y el catálogo público pasan a la 009. (2026-09-29)

## 12. Registro de cambios

| Fecha | Cambio | Motivo | Aprobó |
|---|---|---|---|
| 2026-09-27 | Creación inicial en estado Borrador | Inicio de la spec de catálogo y límites | Fátima |
| 2026-09-27 | CA-5 cerrada: sin suscripción se devuelve Personal y no se lee `usuario`. CA-6 lista `retainedVersions` y exige `bigint`. CA-8 catálogo público de solo lectura. CA-9 UUID fijos. RN-1 fija 1 GB = 1024³. RN-4 adopta DF-51 opción A. RN-5 deja la suscripción y el evento para 009. Se quita RNF-06. | El registro (001) necesita leer planes. La suscripción no cabe aquí, y `storage` → `billing` cierra un ciclo | Fátima. RN-4 queda a la espera del architect |
| 2026-09-29 | RN-4 aceptada (ADR-0021). La opción A no bloquea el plan de 005 ni el de 006a. | El ciclo se rompe sin esperar `IAgentQuota`, `IIndexQueue` ni las facturas | Revisión de arquitectura |
| 2026-09-29 | ADR-0016 aceptado: DF-23 y DF-24 cerrados. Se quitan HU-4 y CA-8. El PD-40 (oyente, conciliación y catálogo público) pasa a la 009. | El registro puede seguir con `catalogo-no-disponible`. La 006a se queda en la tabla `plan` y en los límites | Revisión de arquitectura |
