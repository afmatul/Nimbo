# Spec 011 — Administración y soporte

| Campo | Valor |
|---|---|
| Estado | Borrador |
| Dueño | Fátima |
| Fase | 2 |
| Requisitos | RF-06 (principal); RF-05 (matriz: Administrador y Soporte), RF-07, RNF-05, RNF-13, RNF-14 |
| Depende de | 003, 004, 005 (metadatos de archivos), 008 |
| Última actualización | 2026-10-03 |

## 1. Contexto y objetivo
Operar la plataforma sin romper la privacidad: el Administrador gestiona cuentas, altas internas y el catálogo de planes
y ve métricas agregadas (RF-06); Soporte y el Administrador ven solo metadatos y estados de los archivos de un cliente.
Ningún rol interno ve contenido, no hay suplantación y toda acción sobre una cuenta ajena queda en la auditoría que ve el
cliente (Art. IX, RF-07). Al terminar, Administrador y Soporte tienen su área real en la web en lugar del marcador de la
003 (D-5). Ajuste de cuota, ajuste de vigencia y restauración de papelera por Soporte quedan en la **011b** (P-8).

## 2. Historias de usuario
- **HU-1** Como Administrador, quiero listar, suspender y reactivar cuentas, para cortar el acceso ante abuso o una baja.
- **HU-2** Como Administrador, quiero dar de alta cuentas internas, para que Soporte y Operación tengan acceso (003 D-3).
- **HU-3** Como Administrador, quiero mantener el catálogo de planes, para cambiar la oferta sin desplegar.
- **HU-4** Como Administrador, quiero ver métricas agregadas, para conocer el uso del servicio sin ver datos de nadie.
- **HU-5** Como Soporte, quiero ver metadatos y estados de los archivos de un cliente, para ayudarle sin ver su contenido.
- **HU-6** Como cliente, quiero ver qué hizo el personal interno sobre mi cuenta, para confiar en el servicio.

## 3. Criterios de aceptación
**Cuentas (HU-1, HU-2)**
- **CA-1** (HU-1, RF-06) Dado un Administrador, cuando lista cuentas o busca por correo, entonces recibe una lista
  paginada con correo, nombre, rol, estado, plan, espacio usado y fecha de alta, sin datos de archivos.
- **CA-2** (HU-1, RF-06, RF-07) Dado una cuenta activa ajena (cliente o interna), cuando el Administrador la suspende,
  entonces queda `suspendida`, se revocan sus sesiones (002 D-10), su inicio de sesión recibe `IDENTITY_ACCOUNT_SUSPENDED`
  y la acción se audita.
- **CA-3** (HU-1, RF-06, RF-07) Dado una cuenta suspendida, cuando el Administrador la reactiva, entonces queda
  `activa`, puede volver a iniciar sesión (las sesiones revocadas no vuelven) y la acción se audita.
- **CA-4** (HU-1, RF-06) — error: Dado un Administrador, cuando intenta suspenderse a sí mismo o suspender al último
  Administrador activo, entonces se rechaza con un `code` propio y nada cambia.
- **CA-5** (HU-2, RF-05, RF-06) Dado un Administrador, cuando crea una cuenta Administrador, Soporte u Operador con nombre,
  correo y código de empleado, entonces la cuenta existe, la persona recibe un enlace de un solo uso para fijar su
  contraseña (el Administrador nunca la conoce) y el alta se audita.
- **CA-6** (HU-2, RF-05) — error: Dado un correo que ya tiene cuenta, un código de empleado repetido o el rol Cliente,
  cuando se intenta el alta, entonces se rechaza con un `code` de conflicto o de validación y no se crea nada.
- **CA-7** (HU-2, RF-05) Dado que no existe ningún Administrador activo, cuando el Operador ejecuta el comando de alta
  inicial en el servidor, entonces se crea el primer Administrador con el mismo enlace de CA-5; si ya existe uno activo,
  el comando se niega y no crea nada.

**Catálogo (HU-3)**
- **CA-8** (HU-3, RF-06, RF-19) Dado un Administrador, cuando abre el catálogo, entonces ve cada plan (activo o no) con
  nombre, descripción, precio, todos sus límites y su estado.
- **CA-9** (HU-3, RF-06, RF-19) Dado un Administrador, cuando crea un plan con nombre, descripción, precio y límites,
  entonces el plan queda activo, se ofrece a contrataciones nuevas y el alta se audita.
- **CA-10** (HU-3, RF-06, RF-24) Dado un plan activo distinto de Personal, cuando el Administrador lo desactiva,
  entonces deja de ofrecerse a contrataciones nuevas, quien ya lo tiene lo conserva con sus mismos valores y se audita.
- **CA-11** (HU-3, RF-06, RNF-02) — error: Dado un intento de editar precio o límites de un plan existente, desactivar
  Personal, precio negativo, límites no positivos o máximo por archivo mayor que la cuota o que 2 GB, cuando se
  guarda, entonces `422` con los campos y el catálogo no cambia.

**Métricas (HU-4)**
- **CA-12** (HU-4, RF-06) Dado un Administrador, cuando abre el panel de métricas en la app, entonces ve solo totales y
  conteos (cuentas por estado y por plan, espacio total usado), nunca filas de una cuenta.

**Metadatos (HU-5)**
- **CA-13** (HU-5, RF-05, RF-07) Dado Soporte o un Administrador, cuando consulta los archivos de un cliente, entonces
  recibe solo nombre, tipo, tamaño, fechas y estado (nunca contenido, texto, URL ni clave de objeto) y la consulta se audita.

**Roles, aislamiento y auditoría (HU-6)**
- **CA-14** (RF-05, RNF-05) — error: Dado un Cliente u Operador, cuando llama a cualquier acción de esta spec, entonces
  `403` `SHARED_FORBIDDEN`; Soporte recibe lo mismo en las acciones exclusivas del Administrador.
- **CA-15** (RF-05, RNF-05) Dado la suite de aislamiento, cuando recorre cada acción de esta spec con cada rol interno,
  entonces ninguna respuesta contiene contenido, texto, URL firmada, clave de objeto ni filas de versiones.
- **CA-16** (HU-6, RF-07) Dado acciones internas sobre la cuenta de un cliente, cuando él abre su auditoría (004),
  entonces ve cada una con fecha, nombre y rol de la persona interna y la acción; las de otra cuenta no las ve.

**Web**
- **CA-17** (RF-06, RNF-13, RNF-14) Dado Administrador o Soporte, cuando llega a su área, entonces ve sus pantallas con
  estados vacío, cargando, error con «Reintentar», éxito y sin permiso, usables a 360 px; el Operador sigue con el marcador (022).

## 4. Reglas de negocio
- **RN-1** El rol interno nunca da acceso a contenido ni vista previa; no hay suplantación ni «ver como» (Art. IX).
- **RN-2** Toda acción de un rol interno sobre una cuenta ajena se audita y la ve el cliente con nombre y rol de quien la
  hizo (RF-07), incluidas las consultas de metadatos (`product-context.md` §5).
- **RN-3** El Operador no opera cuentas (matriz §2); su única acción aquí es el comando de alta inicial (CA-7), en el servidor.
- **RN-4** Los planes son inmutables en precio y límites: para cambiar la oferta se crea un plan nuevo y se desactiva el
  anterior, y quien lo tenía lo conserva (RF-24). Personal no se desactiva. Bytes y centavos (ADR-0016); el máximo por
  archivo nunca supera 2 GB (RNF-02).
- **RN-5** Un correo pertenece a una sola cuenta y un usuario no acumula roles (001 RN-2, Art. IX.5). El código de
  empleado es obligatorio y único solo en cuentas internas.
- **RN-6** Suspender nunca borra datos. Mientras una cuenta de cliente está suspendida, sus comparticiones y enlaces
  públicos dejan de funcionar; al reactivarla vuelven como estaban (la regla la aplican 012 y 013).
- **RN-7** Siempre existe al menos un Administrador activo, y nadie se suspende a sí mismo.

## 5. Seguridad y privacidad
- **Toca datos de clientes: sí** (metadatos de cuentas y archivos, estado) → aislamiento bloqueante (CA-15) y matriz (CA-14).
- **Auditoría (RF-07)**: suspender, reactivar, alta interna, alta inicial, cambios de catálogo y consulta de metadatos;
  actor (nombre y rol), cuenta afectada y recurso por identificador (DF-12).
- **No va a bitácoras** (RNF-17): nombres de archivo, contenido, contraseñas, tokens ni enlaces de alta.
- **Roles**: Admin → cuentas, altas, catálogo, métricas, metadatos; Soporte → metadatos; Operador → solo CA-7; Cliente → `403`.

## 6. Experiencia de usuario
| Pantalla | Mockup (`docs/design/mockups/…`) | Estados requeridos | Estado del mockup |
|---|---|---|---|
| Admin: cuentas y ficha | `backoffice/admin/` | default, vacio, cargando, error, confirmar-suspender, suspendida | Borrador (default) |
| Admin: alta interna | — | default, error-campos, exito | Falta (`/mockup`) |
| Admin: catálogo de planes | — | default, creando, confirmar-desactivar, error-campos, exito | Falta (`/mockup`) |
| Admin: métricas agregadas | — | default, cargando, error | Falta (`/mockup`) |
| Soporte: metadatos de un cliente | `backoffice/soporte/` | default, vacio, cargando, no-encontrado | Pendiente (`/mockup`) |

- Mockups con Cielo Sereno (`design-cielo-sereno.md`); donde un tono no cumpla AA, se usa el corregido de
  `ui-guidelines.md` §2 (Art. XIII.2).
- Mensajes: «Esta cuenta quedó suspendida y se cerraron sus sesiones.» · «La administración muestra metadatos de los
  archivos, nunca su contenido.» · «Los planes no se editan: crea uno nuevo y desactiva el anterior.»

## 7. Fuera de alcance
- Ajuste de cuota, ajuste de vigencia y restauración de papelera por Soporte: **011b** (P-8).
- Consultar bitácoras técnicas y trabajos, y reintentar procesos: **022** (RF-37), una sola pantalla para Admin, Soporte
  y Operador (P-9).
- «Cambiar plan» y «cerrar sesiones» sin suspender: no están en la matriz (P-10).
- Suplantación, «ver como», vistas previas o descargas para roles internos (Art. IX).
- Borrar cuentas, roles configurables, organizaciones con administración delegada, prorrateo y dinero real (§9).
- Comparador y contratación (008, 009), cambio de plan por el cliente (010) y la pantalla de auditoría del cliente (004).

## 8. Preguntas
- [RESUELTA] **P-1** Métricas → panel propio en la app (A) (2026-10-03, Fátima).
- [RESUELTA] **P-2** Ajuste de cuota → se traslada a 011b: bytes extra sumados al plan (A); puede quedar bajo el espacio
  usado sin borrar nada (1.b); con fecha de fin (2.b) (2026-10-03, Fátima).
- [RESUELTA] **P-3** Vigencia → se traslada a 011b: solo extender; quita la solo lectura al momento; no aplica a Personal (a) (2026-10-03, Fátima).
- [RESUELTA] **P-4** Catálogo → planes inmutables; crear y desactivar (D) (2026-10-03, Fátima).
- [RESUELTA] **P-5** Metadatos → nombre, tipo, tamaño, fechas y estado (A) (2026-10-03, Fátima).
- [RESUELTA] **P-6** Alta interna → enlace de un uso (A); primer Admin por comando de servidor (A) (2026-10-03, Fátima).
- [RESUELTA] **P-7** Mockups → se crean con `/mockup` (2026-10-03, Fátima).
- [RESUELTA] **P-8** Tamaño → se divide en 011 y 011b (B) (2026-10-03, Fátima).
- [RESUELTA] **P-9** Bitácoras, trabajos y reintentos → 022, anotado en PD-59 (2026-10-03, Fátima).
- [RESUELTA] **P-10** Se respeta la matriz; quedan fuera (2026-10-03, Fátima).
- [RESUELTA] **P-11** Sin autosuspensión, sin suspender al último Admin, sí se suspenden internas (A, A, A) (2026-10-03, Fátima).
- [RESUELTA] **P-12** La auditoría del cliente muestra nombre y rol (2026-10-03, Fátima).
- [RESUELTA] **P-13** Suspensión → comparticiones y enlaces dejan de funcionar; los datos se conservan (A) (2026-10-03, Fátima).
- [RESUELTA] **P-14** Código de empleado obligatorio y único en cuentas internas (2026-10-03, Fátima).
- Van al plan (no son de negocio): DF-04 (fachadas de `identity` y `billing`), DF-36 (un controlador por rol), PD-31 y
  DF-27 (`INodeMetadataReader` sin ciclo), DF-15 (rutas de catálogo en backoffice), columna `activo` en `plan` (RN-4).

## 9. Registro de cambios
| Fecha | Cambio | Motivo | Aprobó |
|---|---|---|---|
| 2026-10-03 | Creación en estado Borrador | Inicio de la spec 011 (RF-06) | — |
| 2026-10-03 | P-1…P-14 resueltas; cuota, vigencia y restauración pasan a 011b; 005 en «Depende de» | Respuestas de la dueña | Fátima (pendiente Adrián) |
