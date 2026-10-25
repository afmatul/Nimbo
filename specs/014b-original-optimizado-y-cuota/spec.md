# Spec 014b — Original optimizado y cuota

> Qué y por qué, en ≤ 150 líneas. El cómo va en `./plan.md` (obligatorio).

| Campo | Valor |
|---|---|
| Estado | En curso |
| Dueño | Adrián (1) |
| Fase | 3 |
| Requisitos | RF-36, RF-13, RF-12 (principales); aplican RF-11, RF-07, RF-29, RNF-05, RNF-17 |
| Depende de | 014 (registro único de versiones, poda, restauración), 007 (contador y conciliación de `espacio_usado`), 006 (papelera y purga), 006a (`PlanLimits`: retención en papelera y versiones retenidas) |
| Módulo | M2 `storage` (dueño del ciclo de vida de versiones, DF-17, ADR-0012) |
| DF | DF-21 (Abierto, «requiere decisión de producto»; esta spec es la propuesta), DF-38; [ADR-0013](../../docs/adr/0013-politica-del-original-en-el-optimizador.md) Aceptado |
| Última actualización | 2026-10-25 |

## 1. Contexto y objetivo

RF-36 pide que el optimizador (021) reduzca un PDF o una imagen **conservando el original**. Con las reglas de 014 eso
no funciona: toda versión cuenta en el espacio (014 RN-3) y registrar una versión nueva valida cuota libre, así que con
la cuenta llena el optimizador fallaría con `STORAGE_QUOTA_EXCEEDED` justo cuando más falta hace, y con espacio libre el
uso subiría mientras dura la conservación. Esta spec define, del lado de `storage`, qué pasa con el original cuando se
registra una versión de origen `optimizacion`: deja de contar en el espacio en el mismo momento, sigue restaurable durante
la retención en papelera del plan y después se purga solo. 021 queda fuera; aquí se prueba con un doble del origen
`optimizacion`, como 014 CA-5.

## 2. Historias de usuario

- **HU-1** Como cliente, quiero que optimizar un archivo libere espacio de inmediato, aunque mi cuenta esté llena.
- **HU-2** Como cliente, quiero poder recuperar el original durante un tiempo y saber hasta cuándo.
- **HU-3** Como cliente, quiero que el original conservado se elimine solo al vencer, sin ocupar mi espacio mientras tanto.
- **HU-4** Como equipo, queremos que el contador, el medidor, la papelera y la conciliación digan lo mismo.
- **HU-5** Como equipo, queremos que la conservación no abra una vía para guardar bytes gratis ni exponga datos ajenos.

## 3. Criterios de aceptación

> Plazos de `PlanLimits` (retención en papelera: Personal 7, Pro 30, Equipo 60, Institucional 90 días; versiones
> retenidas: 3/30/60/100). El origen `optimizacion` se ejercita con un doble (021 no existe aún).

### Registrar la versión optimizada (HU-1)
- **CA-1** (HU-1, RF-36, RF-12) Dado un archivo cuya versión actual mide X bytes, cuando se registra una versión `optimizacion` de Y < X bytes, entonces esa pasa a ser la actual, la anterior queda como **original conservado** hasta (fecha de registro + días de retención en papelera del plan) y `espacio_usado` cambia en Y − X en la misma transacción.
- **CA-2** (HU-1, RF-12) Dado una cuenta con `espacio_usado` igual o mayor que su cuota, cuando se registra una versión `optimizacion` menor que el original, entonces se registra sin `STORAGE_QUOTA_EXCEEDED` y `espacio_usado` baja.
- **CA-3** (HU-5, RF-12) — error: Dado una versión `optimizacion` que no es menor que el original, cuando se intenta registrar, entonces se rechaza y no cambian la versión actual, el original ni `espacio_usado`.

### Historial y restauración (HU-2, HU-5)
- **CA-4** (HU-2, RF-29, RF-13) Dado un original conservado, cuando el propietario pide el historial, entonces esa versión trae su fecha de conservación (`keptUntil`) y las demás no; sigue pudiéndose descargar con las reglas de 014 CA-8.
- **CA-5** (HU-5, RF-13, RF-12) Dado un original conservado, cuando se restaura, entonces aplica 014 CA-9 (versión nueva de origen `restauracion`, que **sí** cuenta y suma su tamaño) y 014 CA-12 (`422` `STORAGE_QUOTA_EXCEEDED` si no cabe); el original conserva su fecha y sigue sin contar.

### Vencimiento y poda (HU-3)
- **CA-6** (HU-3, RF-36, RF-13) Dado un original conservado cuya fecha ya pasó y un archivo vivo, cuando corre la pasada programada de mantenimiento, entonces se borran su objeto y su registro, `espacio_usado` no cambia y la versión deja de aparecer en el historial.
- **CA-7** (HU-3) — error: Dado que falla el borrado del objeto de un original vencido, entonces su registro y `espacio_usado` no cambian, el error se registra sin nombres ni claves y la pasada siguiente lo reintenta (patrón de 014 CA-14).
- **CA-8** (HU-3, RF-13) Dado un original conservado, cuando la poda por versiones retenidas lo alcanza antes de su fecha, entonces se poda como cualquier versión (objeto y registro) **sin** restar de `espacio_usado`.

### Papelera y coherencia del espacio (HU-4)
- **CA-9** (HU-4, RF-11) Dado un archivo con original conservado que va a la papelera, entonces el original se conserva y su plazo sigue corriendo, pero no se purga por plazo mientras el archivo esté en la papelera; si se restaura con el plazo vencido, la pasada siguiente lo purga; si el archivo se purga, se borran todas sus versiones y `espacio_usado` baja solo en lo que contaba.
- **CA-10** (HU-4, RF-12) Dado una cuenta con originales conservados, cuando corre la conciliación de 007, entonces `espacio_usado` no cambia; el desglose del medidor y el tamaño mostrado en la papelera tampoco suman los originales conservados.

### Aislamiento, roles y auditoría (HU-5)
- **CA-11** (HU-5, RNF-05) Dado dos clientes A y B, cuando B pide el historial de un archivo de A, entonces `404` idéntico (014 CA-17); la pasada de mantenimiento de la cuenta A nunca borra ni lee versiones de B. Se añade a `pnpm test:isolation`.
- **CA-12** (HU-5, RF-05) Roles internos y llamadas sin token en las rutas de versiones: igual que 014 CA-18 (`403` `SHARED_FORBIDDEN`, `401` `SHARED_UNAUTHENTICATED`).
- **CA-13** (HU-3, RF-07, RNF-17) Dado la purga de un original (por plazo o por poda), cuando se revisan auditoría y bitácoras, entonces queda un evento por `IAuditLogger` con UUID del archivo y de la versión, número y bytes, y **nunca** nombres de archivo, contenido, URLs firmadas ni claves de objeto.

## 4. Reglas de negocio

- **RN-1** Excepción a 014 RN-3: al registrar una versión `optimizacion`, el original (la versión actual en ese momento) deja de contar en `espacio_usado`; el registro suma la optimizada y resta el original en una sola transacción. Por eso no exige cuota libre.
- **RN-2** La versión `optimizacion` debe ser estrictamente menor que el original (CA-3): el cambio neto del espacio nunca es positivo.
- **RN-3** El plazo de conservación es la retención en papelera del plan (`PlanLimits`, nunca en código), contado desde el registro de la optimización.
- **RN-4** Excepción acotada a 014 RN-10: además de la poda por retención y la purga del archivo, el vencimiento del plazo borra el original conservado.
- **RN-5** El original conservado ocupa un lugar de las versiones retenidas (014 RN-1 sin cambios).
- **RN-6** Restaurar el original no es gratis: valida cuota y la versión restaurada cuenta (014 CA-12, RN-9).
- **RN-7** Un original que ya no cuenta nunca se resta dos veces: ni la poda, ni la purga, ni la conciliación lo descuentan.
- **RN-8** Tamaños en `bigint`; la clave de objeto nunca sale de la API (014 RN-8).

## 5. Seguridad y privacidad

- **¿Toca datos de un cliente?** Sí: metadatos y objetos de versiones → aislamiento en `pnpm test:isolation` (CA-11). La pasada de mantenimiento actúa como cada dueño bajo RLS, sin acceso global, igual que la conciliación de 007.
- **Auditoría (RF-07):** la purga del original (CA-13). Registrar la versión optimizada lo auditará 021. **Nunca** en bitácoras: nombres, contenido, URLs firmadas ni claves de objeto.
- **Roles internos:** igual que 014 (CA-12); ningún rol interno ve, descarga ni restaura versiones.
- **Integridad:** el original no se toca hasta su purga (Art. XI); la conservación no permite guardar bytes sin cuota (RN-2, RN-6).

## 6. Experiencia de usuario

- Sin interfaz en esta spec: hasta 021 no existe ninguna versión `optimizacion` real que mostrar. El dato queda en el contrato del historial (CA-4); la marca «Original conservado hasta {fecha} · no ocupa tu espacio» en la ficha y la explicación llegan con la UI de 021 (fila «Ficha de archivo» de `ui-guidelines.md` §7, estado nuevo por agregar al mockup en esa spec).

## 7. Fuera de alcance

- Estimar, optimizar, validar integridad, la tabla `optimizacion` y la UI del optimizador (021, RF-35, RF-36).
- La fachada que 021 usará para registrar la versión optimizada y la comprobación de que la versión de origen sigue siendo la actual al terminar el trabajo (registrador de 021, como `EditedVersionRegistrar` de 016).
- Bloquear la optimización con la cuenta en solo lectura (PD-121, 021).
- Cambiar la fecha de conservación al cambiar de plan; «proteger» o alargar un original a mano.

## 8. Supuestos

- **S-1** El plazo se fija al registrar con la retención del plan vigente en ese momento; un cambio de plan posterior no lo recalcula.
- **S-2** La purga por plazo corre en la pasada programada de mantenimiento (por defecto una vez al día), así que un original puede durar hasta un intervalo más tras su fecha, sin ocupar espacio.
- **S-3** Optimizar otra vez la versión actual conserva a su vez la anterior con su propia fecha; cada original vence por separado.
- **S-4** La purga del original reutiliza el evento de auditoría de la poda de 014 (`file.version_pruned`) con los mismos atributos.
- **S-5** RN-5 sigue la petición de Adrián («si la poda por cantidad lo alcanza antes, se poda como cualquier versión»), que solo es posible si el original ocupa un lugar en las retenidas.

## 9. Preguntas

- [RESUELTA 2026-10-25: sí, Adrián pidió implementarla; ADR-0013 `Aceptado`] ¿Adrián acepta esta política para DF-21 (original sin contar desde la optimización, plazo = retención en papelera, purga automática)? — bloquea: no para el plan, que se aprueba con ella; sí para `Lista`, que espera a ADR-0013 `Aceptado`.

## 10. Registro de cambios

| Fecha | Cambio | Motivo | Aprobó |
|---|---|---|---|
| 2026-10-25 | Creación en `Borrador` con plan y tareas (ADR-0034) | Prerrequisito de 021 (DF-21, ADR-0013) | — |
| 2026-10-25 | Plan aprobado, ADR-0013 `Aceptado`; pasa a `En curso` | Adrián pidió comenzar la implementación | Adrián |
