# ADR-0021 — Mantenimiento sin actor bajo RLS: función `SECURITY DEFINER` mínima y RLS también en `carga`

| Campo | Valor |
|---|---|
| Estado | Propuesto (2026-09-28); falta el acuerdo del equipo. **Enmienda ADR-0005** (barrera 2: tablas con RLS y trabajos de mantenimiento) |
| Fecha | 2026-09-28 |
| Decisores | Adrián (architect), equipo Nimbo. Opción B decidida por el usuario el 2026-09-28 |
| Specs relacionadas | 005 (D-6, CA-9, CA-16), 006 (purga de la papelera), 007 (conciliación de `espacio_usado`); DF-52, DF-38; PD-19 |

## Contexto

ADR-0005 hace que `api` y `worker` usen `nimbo_app` (sin `BYPASSRLS`, no dueño) y que las políticas fallen cerradas: sin
`app.actor_id` no hay filas. Un trabajo sobre un archivo actúa como su dueño (viene en el payload), pero los trabajos de
mantenimiento que recorren varias cuentas no tienen actor. Sin un mecanismo, el barrido de cargas de 24 h (005, CA-9), la
purga de la papelera (006) y la conciliación de `espacio_usado` (007) verían 0 filas y terminarían «con éxito» sin hacer nada.
Hay que resolverlo sin dar a `nimbo_app` privilegios de omisión.

Además, `carga` guarda `nombre` (dato del cliente), `clave_objeto` y `upload_id`: es contenido sensible por referencia y
debe tener la misma protección que `archivo` y `version_archivo`, aunque una carga no sea un nodo del árbol (no entra en
`accessibleNodes`). ADR-0005 solo listaba `archivo`, `version_archivo` y `fragmento`.

Restricciones: equipo de 4, 10 semanas, un solo servidor de 8 GB, prueba de aislamiento bloqueante en el CI y tres consumidores
del patrón (005, 006, 007).

## Opciones consideradas

1. **A. Actor de sistema explícito** (`app.actor_role = 'SYSTEM'`, fijado solo por el procesador vía `withActor`)
   - Pros: un solo mecanismo (`withActor`); las políticas del actor de sistema se leen en el mismo lugar que las de clientes.
   - Contras: cada tabla necesita una política adicional para `SYSTEM`, y esa política ve filas de **todas** las cuentas
     mientras dura la transacción; `SYSTEM` debe poder leer `clave_objeto` para borrar el objeto. Es más superficie
     que una función que devuelve dos identificadores, y un error en el procesador que fije `SYSTEM` de más expone todo.
2. **B. Dos fases: función `SECURITY DEFINER` mínima + `withActor` por dueño** (elegida)
   - Pros: la única capacidad sin actor es una función de solo lectura que devuelve `(id, propietario_id)`; la parte que toca datos
     (abortar el multipart, borrar el objeto, cambiar el estado) corre con RLS normal como el dueño de cada fila. `nimbo_app` sigue
     viendo 0 filas por consulta directa. Se puede probar de forma exhaustiva y sirve de plantilla para 006 y 007.
   - Contras: una función por tipo de mantenimiento; `SECURITY DEFINER` con `FORCE` RLS es fácil de configurar mal (política del dueño,
     `search_path`, `EXECUTE` a `PUBLIC`); el trabajo debe fabricar un actor con `createActor(propietario_id, CLIENT)`.
3. **C. Rol de BD aparte con `BYPASSRLS` para mantenimiento**
   - Contras: es el criterio de error de ADR-0005 («si las políticas obligan a usar un rol con `BYPASSRLS`»); otra credencial en el
     `worker`, y un fallo del código con ese rol lee todas las cuentas. Descartada.
4. **D. Solo vencimiento perezoso, sin barrido**
   - Pros: sin trabajo ni función.
   - Contras: la reserva ya ignora las vencidas, pero las partes y los objetos de cargas abandonadas se quedarían en MinIO para
     siempre (CA-9 exige limpiar). No resuelve 006 ni 007. Se conserva como complemento, no como solución.
5. **E. Posponer**
   - Contras: 005 no puede cerrar CA-9 ni DF-52 (spec 005); 006 y 007 heredarían el problema sin diseño.

## Decisión

Opción B, con estas reglas.

**1. RLS en `carga`** (además de `archivo` y `version_archivo`, ADR-0005): `ENABLE` y `FORCE`; política `carga_cliente` para `nimbo_app`
(`nimbo_actor_role() = 'CLIENT' AND propietario_id = nimbo_actor_id()`, `USING` y `WITH CHECK`). Sin política para roles internos.
Las cargas no entran en `accessibleNodes`: se filtran con `propietario_id = actor.id` en la consulta **y** por RLS.

**2. Función de mantenimiento** (patrón; el ejemplo es el de 005):

```sql
CREATE POLICY carga_mantenimiento ON carga FOR SELECT TO CURRENT_USER USING (estado = 'activa');
CREATE FUNCTION carga_expiradas(p_ahora timestamptz, p_limite integer)
  RETURNS TABLE (id uuid, propietario_id uuid)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS
  $$ SELECT c.id, c.propietario_id FROM public.carga c
     WHERE c.estado = 'activa' AND c.expira_en <= LEAST(p_ahora, now())
     ORDER BY c.expira_en LIMIT LEAST(GREATEST(p_limite, 0), 1000) $$;
REVOKE ALL ON FUNCTION carga_expiradas(timestamptz, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION carga_expiradas(timestamptz, integer) TO nimbo_app;
```

- `FORCE` también somete al dueño de la tabla y `SECURITY DEFINER` ejecuta como el dueño de la función (el rol que migra,
  `DATABASE_MIGRATION_URL`), así que la función necesita su propia política atada a ese rol (`TO CURRENT_USER` al crearla). Todas las
  migraciones corren con el mismo rol en todo ambiente; cambiarlo exige una migración nueva.
- **Un superusuario ignora RLS incluso con `FORCE`**: en local y en el CI el dueño suele ser el superusuario del contenedor y la política
  es inerte. La prueba de mantenimiento no puede pasar en vacío: corre con un dueño `NOSUPERUSER` (o, si no es viable, se ejecuta en staging).
- La función devuelve solo identificadores (sin nombre, clave ni `upload_id`), solo de cargas activas y **vencidas** (el llamador no puede
  adelantar el reloj), con tope de filas, `search_path` cerrado y `EXECUTE` solo para `nimbo_app`.
- Fase 2: `withActor(createActor(propietario_id, Role.CLIENT), …)` por dueño; un error por fila se registra y no frena el lote; el trabajo
  falla al final si hubo errores para activar los reintentos.

**3. Enumeración aceptada.** Una API comprometida (que usa `nimbo_app`) puede llamar la función y enumerar pares
`(carga_id, usuario_id)` de cargas vencidas y no limpiadas. Son UUID sin contenido ni nombres; se acepta porque la alternativa (actor de sistema)
expone más. Toda función `SECURITY DEFINER` nueva (006, 007) se revisa con la misma lista: solo lectura, solo identificadores, filtro de
antigüedad no controlable por quien llama, tope, `search_path` cerrado, `REVOKE … FROM PUBLIC`.

**4. Pruebas** (`test/isolation/storage-maintenance.iso-spec.ts`): `nimbo_app` sin actor ve 0 filas de `carga` por consulta directa; la función devuelve solo
`(id, propietario_id)` de activas vencidas; no devuelve vigentes aunque se le pase una fecha futura; `PUBLIC` no puede ejecutarla; `pg_policies` y `pg_proc` muestran
que la política y la función pertenecen al dueño de la tabla.

## Consecuencias

- Positivas: el `worker` no necesita privilegios de omisión; ADR-0005 se mantiene entero; hay un patrón revisable para 006 y 007; la limpieza de 005 se
  puede demostrar en la exposición («el worker tampoco ve filas ajenas»). Las cargas (nombre, clave, `upload_id`) quedan tan protegidas como los archivos.
- Negativas / deuda aceptada: una función y una política del dueño por tipo de mantenimiento; la política `carga_mantenimiento` solo importa cuando el dueño no es
  superusuario, lo que exige una prueba con dueño restringido; enumeración de UUID descrita arriba; las migraciones deben usar siempre el mismo rol.
- Cómo sabremos si fue un error: si 006 o 007 necesitan una función que devuelva algo más que identificadores, o si aparece la tentación de dar `BYPASSRLS` para que un
  trabajo funcione; si `storage-maintenance.iso-spec.ts` deja de fallar al quitar la política en staging; o si la enumeración de UUID resulta inaceptable en la auditoría de seguridad.
