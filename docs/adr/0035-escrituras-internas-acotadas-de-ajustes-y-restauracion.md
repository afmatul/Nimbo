# ADR-0035 — Escrituras internas acotadas: funciones `SECURITY DEFINER` para la cuenta y la papelera

| Campo | Valor |
|---|---|
| Estado | Propuesto (2026-10-22; corregido el 2026-10-24 tras la auditoría de Adrián). **Enmienda ADR-0005 y ADR-0021**; delimita ADR-0032 regla 3. Se acepta antes del código del PR-A |
| Fecha | 2026-10-22 |
| Numeración | 0035 desde 2026-10-24: el 0034 lo usa la ADR de SDD express en `main`; el 0033 lo usa la 019 |
| Decisores | `architect`, Fátima (dueña de 011/011b), Adrián (aprueba `storage`/`identity`/`audit`), Juan Marcos (dueño de `billing`) |
| Specs relacionadas | 011b (RF-05, RF-06, RF-07, RF-12, RF-22, RF-23, RF-24); hereda 004, 006, 009, 010 y 011 |

## Contexto

La 011 dejó fuera dos escrituras de un rol interno sobre datos de un cliente: el Administrador ajusta la cuota extra y la
vigencia de una cuenta, y Soporte restaura una raíz de la papelera con un motivo. Hasta hoy, `backoffice` solo lee: la
política `suscripcion_administracion` es `SELECT` y las de `archivo`/`carpeta` para roles internos también
(`archivo_metadatos_internos`, `carpeta_metadatos_internos`), todas bajo `FORCE ROW LEVEL SECURITY`. `TrashService`
(006) no sirve: exige `WritableAccountPolicy`, consulta con `ownedTrashedNodes(actor)` —vacío para un actor interno— y
audita fuera de la transacción contra el propio actor.

Una política RLS **no puede limitar columnas ni comparar el valor viejo con el nuevo**. La política de Soporte que
proponía el primer plan (`USING` filas en papelera, `WITH CHECK` solo rol) dejaba cambiar `propietario_id`,
`version_actual_id`, `tamano_bytes`, `tipo`, `purgar_en` o la carpeta de un archivo en papelera; como
`version_archivo_cliente` da acceso a las versiones a través de `archivo`, el dueño nuevo podía ver y descargar el
contenido del anterior. Un `GRANT` por columna tampoco sirve: `nimbo_app` es el mismo rol de BD para el cliente y para
Soporte, así que limitaría también al cliente.

Además, la restauración de 006 reubica `ruta` y `profundidad` **después** de sacar el subárbol de la papelera. Con una
política de Soporte limitada a filas en papelera, esas filas ya estarían vivas y el `UPDATE` afectaría a 0 filas sin
error: el árbol quedaría roto y el límite de profundidad se podría saltar. En `suscripcion`, `FORCE RLS` somete también
al dueño de la tabla; sin una política `UPDATE` para el dueño, una función `SECURITY DEFINER` actualizaría 0 filas y el
servicio creería que guardó. Por eso las funciones de cuenta son `VOLATILE` (no `STABLE`) y la política del dueño se
declara explícitamente.

Fuerzas: sin suplantación (regla dura del proyecto), autorización resuelta en la consulta y RLS como segunda barrera
(ADR-0005), auditoría y cambio en la misma transacción (004 D-5), y el cliente debe ver el motivo sin que aparezca en
logs. La 011b es la primera escritura interna sobre `storage` de un cliente.

## Opciones consideradas

1. **A. Políticas `UPDATE` directas para `ADMIN` y `SUPPORT` sobre `nimbo_app`.**
   - Pros: una sola migración de políticas y SQL directo desde los repositorios; sin funciones.
   - Contras: abre `suscripcion` y las tablas de nodos a escrituras directas de cualquier consulta con ese rol; la
     política no puede limitar columnas, así que la autorización quedaría solo en el código y un `UPDATE` directo podría
     cambiar el dueño, el tamaño o la retención. Descartada por seguridad (SEC-1, SEC-3).
2. **B. Funciones `SECURITY DEFINER` para la cuenta y para la restauración, con políticas del dueño acotadas.**
   - Pros: `nimbo_app` no gana escrituras directas; una fila por `usuario_id` en la cuenta; la restauración valida dueño,
     raíz, retención y destino dentro de la misma transacción; el orden de `ruta`/`profundidad` queda dentro de la
     función, antes de sacar el subárbol de la papelera; un solo mecanismo para las dos operaciones.
   - Contras: más SQL `SECURITY DEFINER` que probar con un dueño sin `SUPERUSER`; la función de restauración toca varias
     filas del subárbol y debe comprobar conteos; el dueño de la tabla necesita políticas `TO CURRENT_USER` que solo usa
     la función.
3. **C. Mixta: función para `suscripcion` y políticas `UPDATE` por estado para `storage`.**
   - Pros: menos SQL en `storage`.
   - Contras: mantiene dos mecanismos y no resuelve la restricción por columnas ni el orden de la reubicación; la política
     sigue siendo amplia dentro de la papelera. Descartada tras B-1/B-2.
4. **D. Reutilizar los servicios del cliente fabricando un `Actor` del dueño.**
   - Contras: es suplantación, prohibida por la constitución y por la 011; además perdería el rol `SUPPORT` en la auditoría.
5. **E. Posponer.**
   - Contras: la matriz de roles de la 011 ya define estas operaciones y la Fase 3 las necesita.

## Decisión

**Opción B**, con estas reglas:

1. **Cuota y vigencia (Administrador).** `suscripcion` no gana escrituras directas de `nimbo_app`. Dos funciones
   `SECURITY DEFINER` propiedad del rol que migra, `VOLATILE`, `plpgsql`, con `SET search_path = pg_catalog, pg_temp`,
   `REVOKE ALL … FROM PUBLIC` y `EXECUTE` solo para `nimbo_app`, comprueban `public.nimbo_actor_role() = 'ADMIN'`,
   bloquean `usuario` y `suscripcion` con `FOR UPDATE` y operan una fila por `usuario_id`:
   - `ajustar_cuota_extra(p_usuario, p_extra, p_hasta)` es la fuente de verdad de las reglas que dependen del estado.
     `PUT` exige `p_extra > 0` y `p_hasta > now()`; `DELETE` llama con `0`/`NULL`, única vía para quitar. Exige
     `plan + p_extra <= 2^53-1` y `plan + p_extra >= espacio_usado`; no toca `vence_en`, `estado` ni los avisos. La
     fecha se captura como día en `America/Guatemala` y el adaptador la convierte al inicio del día siguiente en UTC.
   - `extender_vigencia(p_usuario, p_vence)` exige plan de pago, `p_vence > vence_en` y `p_vence > now()`; **calcula** el
     `estado` (`solo_lectura` → `vigente`) y no toca avisos, `plan_pendiente_id` ni `renovacion_automatica`. La fecha
     sigue la misma conversión de día.

   Las funciones devuelven un **código de resultado** (`ok`, `quota_invalid`, `quota_below_usage`,
   `validity_not_extended`, `personal`, `account_not_found`, `no_subscription`) y la vista nueva; el repositorio traduce
   el código a errores de dominio. Los fallos esperados no se lanzan como excepciones arbitrarias; solo un rol distinto
   de `ADMIN` (`SQLSTATE 42501`) o un conteo interno inesperado hace `RAISE`. Una política
   `suscripcion_ajuste_administracion FOR UPDATE TO CURRENT_USER` con `USING`/`WITH CHECK` de rol `ADMIN` permite que la
   función escriba bajo `FORCE RLS`; `nimbo_app` no la usa. El `SELECT … FOR UPDATE` de la función también necesita esa
   política. No se reinician `aviso_previo_para` ni `aviso_vencida_para`: la 010 los compara con `vence_en` y el `vence_en`
   nuevo ya define el periodo siguiente; reiniciarlos reenviaría correos del periodo anterior.
2. **Restauración (Soporte).** `archivo` y `carpeta` no ganan `UPDATE` para `nimbo_app`. Una función
   `restaurar_raiz_papelera(p_usuario, p_tipo, p_nodo)` `SECURITY DEFINER` y `VOLATILE`, con el mismo `search_path` y
   `EXECUTE` solo para `nimbo_app`, comprueba rol `SUPPORT`, que la raíz pertenece a `p_usuario`, que
   `eliminado_con_carpeta_id IS NULL` y que `purgar_en > now()`. Bloquea primero `usuario` (mismo orden que la 006) y
   después la raíz; resuelve el destino como una carpeta viva del mismo dueño o la raíz, y el primer nombre libre.
   Si es carpeta, reubica `ruta` y `profundidad` de todo el subárbol **mientras sigue en papelera** y después saca de la
   papelera solo lo arrastrado. Escribe únicamente `eliminado_en`, `purgar_en`, `eliminado_con_carpeta_id`, `nombre`,
   `carpeta_padre_id`/`carpeta_id`, `ruta`, `profundidad` y `actualizado_en`; nunca `propietario_id`,
   `version_actual_id`, `tamano_bytes`, `tipo` ni `creado_en`. Comprueba los conteos y hace `RAISE` si no cuadran. Devuelve
   `outcome`, nombre original y final, destino, cantidad y bytes. Las políticas `TO CURRENT_USER` de `SELECT` (raíz y
   destino) y `UPDATE` (raíz y subárbol) solo las usa la función; `archivo_mantenimiento`/`carpeta_mantenimiento` ya
   cubren la lectura de las filas en papelera. No se concede `INSERT`, `DELETE` ni acceso a `version_archivo`, `carga` o
   `clave_objeto`.
3. **Auditoría.** `node.restored` admite `note` (1 a `AUDIT_NOTE_MAX_LENGTH`) solo en ese evento, no en
   `NODE_ATTRIBUTES`; cuota y vigencia suman `account.quota_adjusted` y `account.validity_adjusted`. `recordLine` omite
   los atributos de texto libre (`note`, `reason`) y registra solo sus claves. El motivo no sale de `evento_auditoria`:
   ni logs, ni respuestas de listado, ni nombres de archivo.
4. **Prohibiciones.** Soporte no purga, vacía, descarga ni previsualiza; Administración no restaura; el Operador no hace
   ninguna de las tres. La restauración se permite en cuentas en solo lectura y no toca `espacio_usado`.
5. **Enmiendas.** Este ADR enmienda ADR-0005 (barrera 2: ahora hay escrituras internas por función) y ADR-0021 (sus
   funciones eran de solo lectura y devolvían solo identificadores; estas escriben y devuelven plan, estado, `vence_en` y
   el extra). La lista de control es: una fila por `usuario_id` en la cuenta; columnas fijas; rol comprobado dentro de la
   función; `search_path` cerrado; `VOLATILE`; `REVOKE`/`GRANT`; política del dueño; prueba con dueño `NOSUPERUSER`.
   Delimita ADR-0032 regla 3: la restauración de Soporte es una escritura permitida en solo lectura. **No se edita
   ADR-0032**, que está Aceptada: al aceptarse este ADR, su prueba añade
   `POST /backoffice/client-trash/:nodeId/restore` a la lista de rutas permitidas y lo deja fuera de la de bloqueadas.
   `architecture.md` §6.5 y §6.6 se actualizan para incluir `SupportTrashService` y la función de restauración, y para
   decir que expone nombres de carpeta y la ruta original sin contenido, versiones, claves ni URLs.

## Consecuencias

- Positivas: ninguna escritura directa nueva de `nimbo_app` sobre `suscripcion` ni sobre los nodos; la restauración no
  puede cambiar el dueño, el tamaño, el tipo ni la retención; el orden de `ruta`/`profundidad` es correcto; un solo
  mecanismo (`SECURITY DEFINER`) para las dos operaciones; el evento con motivo es atómico y visible para el cliente.
- Negativas / deuda aceptada: hay políticas `TO CURRENT_USER` que solo usa la función; la función de restauración es más
  grande que las de cuenta y toca un subárbol; hay que probar con un dueño sin `SUPERUSER` y con SQL directo de Soporte;
  `cuota_extra_hasta` y `vence_en` se apartan del E-R (`fin`), que se redibuja en `pendientes.md` (PD-96) como el resto
  de la 009.
- Cómo sabremos si fue un error: si aparece una escritura directa de `nimbo_app` sobre `suscripcion`, `archivo` o
  `carpeta`; si una prueba permite restaurar o ajustar otra cuenta, un nodo vivo, una raíz vencida o cambiar una columna
  prohibida; si el motivo aparece en un log; o si una restauración deja `ruta`/`profundidad` inconsistentes en el
  subárbol. Si la función necesita crecer más allá de las columnas y filas declaradas, se revisa este ADR.
