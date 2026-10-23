# ADR-0034 — Escrituras internas acotadas: funciones `SECURITY DEFINER` para la cuenta y RLS por estado para la papelera

| Campo | Valor |
|---|---|
| Estado | Propuesto (2026-10-22) |
| Fecha | 2026-10-22 |
| Numeración | 0034 desde 2026-10-23: el 0033 queda reservado por el ADR de compartición de la 012 (PR #61) |
| Decisores | `architect`, Fátima (dueña de 011/011b), Adrián (aprueba) |
| Specs relacionadas | 011b (RF-05, RF-06, RF-12, RF-22, RF-23, RF-24); hereda 004, 006, 009, 010 y 011 |

## Contexto

La 011 dejó fuera dos escrituras de un rol interno sobre datos de un cliente: el Administrador ajusta la cuota extra y la
vigencia de una cuenta, y Soporte restaura una raíz de la papelera con un motivo. Hasta hoy, `backoffice` solo lee: la
política `suscripcion_administracion` es `SELECT` y las de `archivo`/`carpeta` para roles internos también
(`archivo_metadatos_internos`, `carpeta_metadatos_internos`), todas bajo `FORCE ROW LEVEL SECURITY`. `TrashService`
(006) no sirve: exige `WritableAccountPolicy`, consulta con `ownedTrashedNodes(actor)` —vacío para un actor interno— y
audita fuera de la transacción contra el propio actor.

Fuerzas: sin suplantación (regla dura del proyecto), autorización resuelta en la consulta y RLS como segunda barrera
(ADR-0005), auditoría y cambio en la misma transacción (004 D-5), y el cliente debe ver el motivo sin que aparezca en
logs. La 011b es la primera escritura interna sobre `storage` de un cliente.

## Opciones consideradas

1. **A. Políticas `UPDATE` directas para `ADMIN` y `SUPPORT` sobre `nimbo_app`.**
   - Pros: una sola migración de políticas y SQL directo desde los repositorios; sin funciones.
   - Contras: abre `suscripcion` y las tablas de nodos a escrituras directas de cualquier consulta con ese rol; la
     autorización quedaría solo en el código y la política no distingue una raíz de papelera de un nodo vivo.
2. **B. Funciones `SECURITY DEFINER` para `suscripcion` y políticas `UPDATE` limitadas al estado de papelera para `storage`.**
   - Pros: mantiene cerradas las escrituras directas del Administrador (patrón de ADR-0021, ya usado por 009/010); para
     Soporte, la política solo alcanza filas con `eliminado_en IS NOT NULL` y el `WITH CHECK` solo permite sacarlas de la
     papelera; el resto de la autorización (correo, propietario, raíz, retención) se resuelve en la consulta.
   - Contras: dos mecanismos distintos; la política de Soporte es amplia dentro de las filas en papelera y depende de que
     exista un único camino de código; suma SQL `SECURITY DEFINER` que hay que probar con un dueño sin `SUPERUSER`.
3. **C. Reutilizar los servicios del cliente fabricando un `Actor` del dueño.**
   - Contras: es suplantación, prohibida por la constitución y por la 011; además perdería el rol `SUPPORT` en la auditoría.
4. **D. Posponer.**
   - Contras: la matriz de roles de la 011 ya define estas operaciones y la Fase 3 las necesita.

## Decisión

**Opción B**, con estas reglas:

1. **Cuota y vigencia (Administrador):** `suscripcion` no gana políticas de escritura. Dos funciones
   `SECURITY DEFINER` propiedad del rol que migra, con `REVOKE ALL … FROM PUBLIC` y `EXECUTE` solo para `nimbo_app`,
   comprueban `nimbo_actor_role() = 'ADMIN'` y operan una fila por `usuario_id`:
   `bloquear_suscripcion_cliente` (devuelve plan, estado, `vence_en` y el extra con `FOR UPDATE`) y
   `ajustar_suscripcion_cliente` (guarda cuota y vigencia y resetea los avisos). Se llaman dentro de
   `InternalActionService.run`, así que el evento y el cambio son atómicos.
2. **Restauración (Soporte):** `archivo` y `carpeta` ganan una política `FOR UPDATE TO nimbo_app` con
   `USING (nimbo_actor_role() = 'SUPPORT' AND eliminado_en IS NOT NULL)` y `WITH CHECK (nimbo_actor_role() = 'SUPPORT')`. No se concede
   `INSERT` ni `DELETE` a Soporte, ni acceso a `version_archivo`, `carga` o `clave_objeto`. Un único servicio de
   `storage` (`SupportTrashService`) resuelve el cliente por correo, filtra `propietario_id`,
   `eliminado_con_carpeta_id IS NULL` y `purgar_en > ahora`, bloquea la raíz con `FOR UPDATE` y reutiliza la semántica de
   006 (carpeta original, renombrado, raíz, profundidad). No se usa `accessibleNodes(actor)` ni se fabrica un actor.
3. **Auditoría:** `node.restored` admite `note` (1 a 500) en el catálogo; cuota y vigencia suman
   `account.quota_adjusted` y `account.validity_adjusted`. El motivo no sale de `evento_auditoria`: ni logs, ni
   respuestas de listado, ni nombres de archivo.
4. **Prohibiciones:** Soporte no purga, vacía, descarga ni previsualiza; Administración no restaura; el Operador no hace
   ninguna de las tres. La restauración se permite en cuentas en solo lectura y no toca `espacio_usado`.

## Consecuencias

- Positivas: ninguna escritura directa nueva del Administrador sobre `suscripcion`; la restauración solo puede tocar
  filas que ya están en papelera; el evento con motivo es atómico y visible para el cliente; se conserva la semántica de
  006 sin duplicarla.
- Negativas / deuda aceptada: conviven dos mecanismos (funciones y política por estado); la política de Soporte no puede
  expresar «solo la cuenta indicada» en SQL, así que la defensa es el único servicio, el filtro por `propietario_id`, la
  transacción y la prueba de aislamiento. `cuota_extra_hasta` y `vence_en` se apartan del E-R (`fin`), que se redibuja en
  `pendientes.md` como el resto de la 009.
- Cómo sabremos si fue un error: si aparece una escritura de Soporte fuera de `SupportTrashService`; si una prueba permite
  restaurar o ajustar otra cuenta, un nodo vivo o una raíz vencida; si el motivo aparece en un log; o si el
  `SECURITY DEFINER` necesita crecer más allá de una fila y cuatro columnas.
