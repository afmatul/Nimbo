# ADR-0005 — Autorización dentro de la consulta con RLS de PostgreSQL como segunda barrera

| Campo | Valor |
|---|---|
| Estado | Aceptado (2026-09-26, Adrián) (barrera 2 y trabajo del `worker` enmendados por ADR-0021, Propuesto, 2026-09-28: RLS también en `carga` y mantenimiento sin actor con función `SECURITY DEFINER` mínima) |
| Fecha | 2026-09-26 |
| Decisores | Adrián (architect), equipo Nimbo |
| Specs relacionadas | 003 (R-5 a R-7, D-1, D-6, D-7, D-9, D-11; CA-10 a CA-15); 005; 012; 019; suite `test/isolation` |

## Contexto

Todas las cuentas comparten una sola base de datos, y las comparticiones (RF-16) cruzan cuentas: un archivo de A
puede ser visible para B como editor o lector, directamente o por herencia de carpeta. La promesa central (RF-05,
RNF-05, Art. IX.1-2) es que nadie ve lo ajeno, ni siquiera el personal de Nimbo, y `CLAUDE.md` prohíbe filtrar
después de consultar. El contenido vive en MinIO; en la base, lo que da acceso a él es `version_archivo.clave_objeto`,
a partir de la cual se firma una URL (RNF-06). Proteger esas filas es proteger el contenido.

Habrá unos veinte repositorios escritos por cuatro personas en diez semanas. Basta que uno olvide su `WHERE` para
que una cuenta vea a otra. Hoy (000) la API y las migraciones usan la misma `DATABASE_URL` con el superusuario del
contenedor (`compose.yml`), y un superusuario ignora RLS aunque la tabla tenga `FORCE`.

## Opciones consideradas

1. **Dos barreras: filtro en la consulta con `accessibleNodes(actor)` y RLS como red de seguridad** (elegida)
   - Pros: la regla está escrita en el código y se revisa en el SQL generado (CA-10); si un repositorio olvida
     filtrar, la base niega las filas. Lo ajeno sale como «no encontrado» y encaja con el 404 de D-6.
   - Contras: dos roles de BD, transacción por operación, políticas que mantener y probar.
2. **Solo en código, sin RLS**
   - Contras: la seguridad depende de que nadie olvide un filtro. Viola Art. IX.2, que exige RLS como segunda barrera.
     Un error de TypeORM (`find` sin `where`, relación cargada de más) se convierte en una fuga.
3. **Traer y filtrar después de consultar**
   - Contras: se olvida con facilidad. Además filtra datos por los conteos, los totales y la paginación: una página de
     20 que llega con 3 revela que hay 17 ajenos. Lleva filas ajenas a memoria y a las bitácoras, y no escala a la
     búsqueda ni al agente (Art. IX.3 exige el filtro antes del `ORDER BY embedding`).
4. **Una base o un esquema por cliente**
   - Contras: las comparticiones cruzan cuentas, así que `accessibleNodes` tendría que unir N esquemas. Cada migración
     correría N veces (RNF-10), con un índice vectorial por esquema en un servidor de 8 GB. Resuelve un aislamiento que
     el producto rompe a propósito.
5. **Solo RLS, sin filtro en la consulta**
   - Contras: la regla queda oculta en la base y el código no la expresa. PostgreSQL evalúa la política antes que las
     condiciones que usan funciones no `LEAKPROOF`, lo que puede impedir usar índices; los conteos, la paginación y
     el filtro previo del agente dependen de un plan que no se controla. Los errores son menos claros: un `UPDATE`
     sobre una fila invisible afecta 0 filas en silencio, y un `WITH CHECK` violado sale como error genérico, no como
     `DomainError`.
6. **Posponer RLS a la Fase 3**
   - Contras: se agregaría sobre consultas y trabajos que ya corren sin actor, que de pronto verían 0 filas justo antes
     del Avance 3. D-7 de 003 lo descartó.

## Decisión

Opción 1.

**Barrera 1: autorización dentro de la consulta.**
- Todo método de servicio sobre datos de un usuario recibe `actor: Actor` como primer parámetro (DF-01, D-9). El
  `Actor` sale solo del token verificado (D-11).
- `access.accessibleNodes(actor)` es la única definición de «qué puede ver este actor» (DF-32). Es un subquery o CTE
  que el repositorio une en su SQL (`JOIN` o `IN`), nunca una lista que se trae y se filtra en TypeScript.
- Los repositorios de datos de cliente solo exponen `findAccessible(actor, …)`. `PermissionResolver.can(actor,
  nodeId, action)` valida acciones sobre un recurso puntual. Para los roles internos, las acciones sobre contenido
  devuelven `false` sin consultar (CA-9).
- Un recurso ajeno o inexistente responde el mismo 404; la falta de rol, 403 (D-6).

**Barrera 2: RLS.**
- Tablas: `archivo` y `version_archivo`, con `ENABLE` y `FORCE ROW LEVEL SECURITY`, desde las migraciones de 005.
  `fragmento` entra con 019.
- Roles de BD: `nimbo_app` (`LOGIN`, `NOSUPERUSER`, `NOBYPASSRLS`, no dueño) para `api` y `worker`. El rol dueño,
  que crea las tablas, solo lo usan las migraciones. Una migración reversible concede a `nimbo_app`
  `SELECT/INSERT/UPDATE/DELETE` con `ALTER DEFAULT PRIVILEGES`.
- Contexto por transacción: `SELECT set_config('app.actor_id', $1, true), set_config('app.actor_role', $2, true)`
  equivale a `SET LOCAL`, pero admite parámetros enlazados (`SET LOCAL` no, y concatenar el valor abre inyección).
  El valor desaparece al terminar la transacción, así que no pasa a la siguiente petición que use la misma conexión
  del pool (CA-12).
- Las políticas fallan cerradas: sin actor, `nullif(current_setting('app.actor_id', true), '')` es `NULL` y no hay
  filas (CA-14). `CLIENT` ve sus filas; con 012, también las compartidas. `OPERATOR` no ve ninguna fila. `ADMIN` y
  `SUPPORT` solo leen `archivo` (metadatos) y no obtienen filas de `version_archivo`, que contiene `clave_objeto`.
  Como RLS no oculta columnas, lo que ven de `archivo` lo acota `INodeMetadataReader`. El detalle se fija en el plan
  de 005 (D-7).
- Soporte «Limitado» (D-4, 011): una política de `UPDATE` exclusiva de `SUPPORT` con `USING` (fila en papelera) y
  `WITH CHECK` (fila restaurada). El motivo y la auditoría visible van en la aplicación (RF-07).

**Encaje con TypeORM (hoy `SharedModule` y `buildDataSourceOptions`).**
- Un ayudante único en `shared/infrastructure/persistence`, `withActor(actor, trabajo)`, sobre
  `DataSource.transaction`. Fija las dos variables como primera sentencia y publica el `EntityManager` en un
  `AsyncLocalStorage` de Node (el mismo patrón que ya usa `correlationId`, sin dependencias nuevas).
- Los repositorios de datos de cliente toman el `EntityManager` de ese contexto y lanzan un error si no existe. Si
  alguien consulta fuera del ayudante, obtiene un error o 0 filas, nunca filas ajenas.
- Descartado: un interceptor que abra una transacción por petición. Retendría una conexión del pool (10 por defecto)
  durante las firmas de MinIO, las llamadas a Gemini y las respuestas en streaming. La transacción abarca el caso de
  uso, no la petición.
- `DATABASE_URL` pasa a ser la de `nimbo_app`. Una variable nueva (p. ej. `DATABASE_MIGRATION_URL`) la leen solo
  `migrations/data-source.cli.ts` y `scripts/migrate.ts`, fuera del esquema de entorno de `api` y `worker`. En
  staging solo la recibe el paso de migración, y `pnpm env:check` la cubre.

**Worker.** Usa el mismo `nimbo_app`, sin `BYPASSRLS`. Un trabajo sobre un archivo actúa como el dueño que trae su
payload: la petición que lo encoló ya pasó la autorización. Los trabajos de mantenimiento que recorren varias cuentas
(purga de la papelera) se diseñan en el plan de 005 sin dar privilegios de omisión al rol de aplicación.

**Qué entrega cada spec.** 003: guards, `Actor`, contratos de `access`, `withActor`, los dos roles en compose y
staging, y el arnés de aislamiento (CA-12, CA-13, CA-15). 005: la consulta de propiedad de `accessibleNodes`, las
políticas de `archivo` y `version_archivo` y la vista de metadatos de los roles internos (CA-10, CA-11, CA-14).
012: las comparticiones y la herencia por `carpeta.ruta`, en el CTE y en la política. Si la regla se duplica, se
extrae a una función SQL `STABLE` versionada que usan los dos (Art. VI). 019: RLS en `fragmento` y filtro previo del
agente (DF-14).

## Consecuencias

- Positivas: una fuga exige dos errores independientes. La defensa se puede demostrar en la exposición: se quita el
  `JOIN` de una consulta en una prueba y la base sigue negando. Los módulos (005, 012, 016, 019) reutilizan un solo
  mecanismo en vez de escribir su propia autorización. El 404 de lo ajeno sale naturalmente del filtro.
- Negativas / deuda aceptada:
  - Rendimiento: la política se evalúa por fila y la de `version_archivo` consulta `archivo`. Hacen falta índices
    en la columna de dueño de `archivo`, en `version_archivo(archivo_id)`, en `comparticion` por destinatario y
    nodo (012) y en `carpeta.ruta` para los prefijos. Cada consulta nueva de listado o búsqueda se revisa con
    `EXPLAIN` y se mide en k6 (Fase 3).
  - Pruebas: más complejas. `pnpm test:isolation` usa Testcontainers con los dos roles reales, dos clientes con
    datos casi idénticos y una cuenta de cada rol interno. Prueba la misma conexión con dos actores (CA-12), el dueño
    de las tablas (CA-13) y una consulta sin filtro bajo RLS (CA-14). Si una prueba se conecta como superusuario,
    pasa aunque haya fugas; el arnés debe impedirlo.
  - Pool: un `SET` sin `LOCAL`, o `set_config(..., false)`, contaminaría la conexión para la siguiente petición.
    Solo `withActor` escribe esas variables, y una regla de lint prohíbe `set_config` y `SET app.` fuera de él.
  - Operación: dos roles y dos cadenas de conexión en `.env.example`, compose (script de inicio de Postgres),
    GitHub Environments y la documentación de ambientes. Las filas que crea el worker quedan sujetas a RLS.
- Cómo sabremos si fue un error: si las políticas obligan a desactivar RLS o a usar un rol con `BYPASSRLS` para que
  un flujo funcione; si alguna consulta de listado supera el p95 de RNF-01 (300 ms) por culpa de la política según
  `EXPLAIN`; o si el CTE y la política divergen y la suite no lo detecta.
