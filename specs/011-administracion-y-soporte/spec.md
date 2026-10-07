# Spec 011 — Administración y soporte

| Campo | Valor |
|---|---|
| Estado | Borrador |
| Dueño | Fátima |
| Fase | 2 |
| Requisitos | RF-06 (principal); RF-05 (matriz: Administrador, Soporte y Operador), RF-07, RNF-05, RNF-13, RNF-14 |
| Depende de | 003, 004, 005 (metadatos de archivos), 006 (papelera), 007 (`espacio_usado`), 008 |
| Última actualización | 2026-10-06 |

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
- **HU-4** Como Administrador u Operador, quiero ver métricas agregadas, para conocer el uso del servicio sin ver datos de nadie.
- **HU-5** Como Soporte, quiero ver metadatos y estados de los archivos de un cliente, para ayudarle sin ver su contenido.
- **HU-6** Como cliente, quiero ver qué hizo el personal interno sobre mi cuenta, para confiar en el servicio.

## 3. Criterios de aceptación
**Cuentas (HU-1, HU-2)**
- **CA-1** (HU-1, RF-06) Dado un Administrador, cuando lista cuentas o busca por correo, entonces recibe una lista
  paginada con correo, nombre, rol, estado, verificada (sí/no), plan, espacio usado y fecha de alta, sin datos de archivos;
  en cuentas internas plan y espacio no aplican («—»): no tienen suscripción ni cuota.
- **CA-2** (HU-1, RF-06, RF-07) Dado una cuenta activa ajena (cliente o interna), cuando el Administrador la suspende,
  entonces queda `suspendida`, se revocan sus sesiones (002 D-10), su inicio de sesión recibe `IDENTITY_ACCOUNT_SUSPENDED`
  y la acción se audita.
- **CA-3** (HU-1, RF-06, RF-07) Dado una cuenta suspendida, cuando el Administrador la reactiva, entonces queda
  `activa`, puede volver a iniciar sesión (las sesiones revocadas no vuelven) y la acción se audita.
- **CA-4** (HU-1, RF-06) — error: Dado un Administrador, cuando intenta suspenderse a sí mismo o suspender al último
  Administrador activo, entonces se rechaza con un `code` propio y nada cambia.
- **CA-5** (HU-2, RF-05, RF-06) Dado un Administrador, cuando crea una cuenta Administrador, Soporte u Operador con nombre,
  correo y código de empleado, entonces la cuenta existe, la persona recibe un enlace de un solo uso para fijar su
  contraseña (el Administrador nunca la conoce) y el alta se audita. El enlace reutiliza el mecanismo de la 001
  (`token_cuenta`, hash, un solo uso) con un tipo propio: fija la primera contraseña y no invalida sesiones.
- **CA-6** (HU-2, RF-05) — error: Dado un correo que ya tiene cuenta, un código de empleado repetido o el rol Cliente,
  cuando se intenta el alta, entonces se rechaza con un `code` de conflicto o de validación y no se crea nada.
- **CA-7** (HU-2, RF-05) Dado que no existe ningún Administrador activo, cuando el Operador ejecuta el comando de alta
  inicial en el servidor (no es una ruta HTTP), entonces se crea el primer Administrador con el enlace de CA-5; si ya
  existe uno activo, el comando se niega y no crea nada.

**Catálogo (HU-3)**
- **CA-8** (HU-3, RF-06, RF-19) Dado un Administrador, cuando abre el catálogo, entonces ve cada plan (activo o no) con
  nombre, descripción, precio, todos sus límites y su estado.
- **CA-9** (HU-3, RF-06, RF-19) Dado un Administrador, cuando crea un plan con nombre, descripción, precio y límites,
  entonces el plan queda activo, se ofrece a contrataciones nuevas y el alta se audita.
- **CA-10** (HU-3, RF-06, RF-24) Dado un plan activo distinto de Personal, cuando el Administrador lo desactiva,
  entonces deja de ofrecerse a contrataciones nuevas, quien ya lo tiene lo conserva con sus mismos valores, guarda la
  fecha de desactivación y se audita; un plan desactivado no se reactiva.
- **CA-11** (HU-3, RF-06, RNF-02) — error: Dado un intento de editar cualquier dato de un plan existente, desactivar
  Personal, nombre repetido, precio negativo, límites no positivos (editores simultáneos admite 0: solo lectura) o máximo
  por archivo mayor que la cuota o que 2 GB, cuando se guarda, entonces `422` con los campos y el catálogo no cambia.

**Métricas (HU-4)**
- **CA-12** (HU-4, RF-05, RF-06) Dado un Administrador u Operador, cuando abre el panel de métricas en la app, entonces
  ve solo totales y conteos (cuentas por estado y por plan; espacio total usado = suma de `usuario.espacio_usado`, el
  contador de 005/007, sin recalcular desde los archivos), nunca filas de una cuenta.

**Metadatos (HU-5)**
- **CA-13** (HU-5, RF-05, RF-07) Dado Soporte o un Administrador, cuando consulta los archivos de un cliente, entonces
  recibe solo nombre, tipo, tamaño, fechas y estado («Disponible» o «En papelera desde…», según la 006; sin cargas
  en curso), nunca contenido, texto, URL ni clave de objeto, y la consulta se audita.

**Roles, aislamiento y auditoría (HU-6)**
- **CA-14** (RF-05, RNF-05) — error: Dado un Cliente, cuando llama a cualquier acción de esta spec, entonces `403`
  `SHARED_FORBIDDEN`; Soporte y Operador reciben lo mismo en todo lo que la matriz no les da (Operador: solo CA-7 y CA-12).
- **CA-15** (RF-05, RNF-05) Dado la suite de aislamiento, cuando recorre cada acción de esta spec con cada rol interno,
  entonces ninguna respuesta contiene contenido, texto, URL firmada, clave de objeto ni filas de versiones.
- **CA-16** (HU-6, RF-07) Dado acciones internas sobre la cuenta de un cliente, cuando él abre su auditoría (004),
  entonces ve cada una con fecha, nombre y rol de la persona interna y la acción; las de otra cuenta y los cambios de
  catálogo no aparecen.

**Web**
- **CA-17** (RF-06, RNF-13, RNF-14) Dado Administrador, Soporte u Operador, cuando llega a su área, entonces ve sus
  pantallas con los estados de §6 (cargando y error con «Reintentar» en todas; vacío y éxito donde aplican) y la
  pantalla común «sin permiso», usables a 360 px; el área del Operador solo tiene Métricas hasta la 022b.

## 4. Reglas de negocio
- **RN-1** El rol interno nunca da acceso a contenido ni vista previa; no hay suplantación ni «ver como» (Art. IX).
- **RN-2** Toda acción de un rol interno sobre una cuenta ajena se audita y la ve el cliente con nombre y rol de quien la
  hizo (RF-07), incluidas las consultas de metadatos (`product-context.md` §5).
- **RN-3** El Operador no opera cuentas (matriz §2): aquí solo ve las métricas agregadas (CA-12) y ejecuta el comando
  de alta inicial (CA-7) en el servidor.
- **RN-4** Un plan no se edita (ni nombre ni descripción): para cambiar la oferta o corregir un nombre se crea uno
  nuevo y se desactiva el anterior, que quien lo tenía conserva (RF-24). El estado sale solo de `desactivado_en` (nulo:
  se ofrece; con fecha: desactivado), sin reactivación ni booleano aparte. Personal no se desactiva. Nombres únicos; el
  identificador corto es el `slug` de 006a, que deriva el servidor (los cuatro de la semilla no cambian). Bytes y
  centavos (ADR-0016); el máximo por archivo nunca supera 2 GB (RNF-02).
- **RN-5** Un correo pertenece a una sola cuenta y un usuario no acumula roles (001 RN-2, Art. IX.5). El código de
  empleado es obligatorio y único solo en cuentas internas.
- **RN-6** Suspender nunca borra datos. Mientras una cuenta de cliente está suspendida, sus comparticiones y enlaces
  públicos dejan de funcionar; al reactivarla vuelven como estaban (la regla la aplican 012 y 013).
- **RN-7** Siempre existe al menos un Administrador activo, y nadie se suspende a sí mismo.

## 5. Seguridad y privacidad
- **Toca datos de clientes: sí** (metadatos de cuentas y archivos, estado) → aislamiento bloqueante (CA-15) y matriz (CA-14).
- **Auditoría (RF-07)**: sobre una cuenta (suspender, reactivar, alta interna, alta inicial, consulta de metadatos) con
  actor, cuenta afectada y recurso por id (DF-12), visible para ese cliente; cambios de catálogo con actor e id del plan,
  sin cuenta afectada ni visibles para ningún cliente.
- **No va a bitácoras** (RNF-17): nombres de archivo, contenido, contraseñas, tokens ni enlaces de alta.
- **Roles**: Admin → cuentas, altas, catálogo, métricas, metadatos; Soporte → metadatos; Operador → métricas y CA-7; Cliente → `403`.

## 6. Experiencia de usuario
| Pantalla | Mockup (`docs/design/mockups/…`) | Estados requeridos | Estado del mockup |
|---|---|---|---|
| Admin: cuentas y ficha | `backoffice/admin/` | default, ficha, vacio, cargando, error, confirmar-suspender, suspendida, confirmar-reactivar, propia-cuenta | Borrador |
| Admin: alta interna | `backoffice/alta-interna/` | default, error-campos, error-conflicto, enviando, exito | Borrador |
| Admin: catálogo de planes | `backoffice/catalogo/` | default, cargando, error, creando, error-campos, exito, confirmar-desactivar, desactivado | Borrador |
| Admin y Operador: métricas | `backoffice/metricas/` | default, cargando, error, con-plan-inactivo, operador | Borrador |
| Soporte: metadatos de un cliente | `backoffice/soporte/` | inicial, default, vacio, cargando, no-encontrado, error, desde-admin | Borrador |

- Mockups con Cielo Sereno (`design-cielo-sereno.md`); donde un tono no cumpla AA, se usa el corregido de
  `ui-guidelines.md` §2 (Art. XIII.2).
- Mensajes: «Esta cuenta quedó suspendida y se cerraron sus sesiones.» · «La administración muestra metadatos de los
  archivos (nombre, tipo, tamaño, fechas y estado), nunca su contenido.» · «Los planes no se editan: crea uno nuevo y desactiva el anterior.»

## 7. Fuera de alcance
- **011b**: ajuste de cuota y de vigencia, restauración de papelera por Soporte (P-8). **022b** (RF-37): bitácoras
  técnicas, trabajos y reintentos, una sola pantalla para Admin, Soporte y Operador (P-9).
- Fuera de la matriz: ver o cerrar sesiones ajenas (PD-60), «cambiar plan» y «cerrar sesiones» sin suspender (P-10).
- Suplantación, «ver como», vistas previas o descargas para roles internos (Art. IX); limpieza de cuentas nunca
  verificadas (001 D-21, YAGNI); borrar cuentas, roles configurables, organizaciones, prorrateo y dinero real (§9).
- Comparador y contratación (008, 009), cambio de plan por el cliente (010) y la pantalla de auditoría del cliente (004).

## 8. Preguntas
- [RESUELTA] (2026-10-03, Fátima) **P-1** métricas: panel propio (A) · **P-2** cuota → 011b: extra sumado al plan (A),
  puede quedar bajo lo usado (1.b), con fecha de fin (2.b) · **P-3** vigencia → 011b: solo extender, quita la solo
  lectura, no aplica a Personal · **P-4** catálogo: crear y desactivar (D); 0 editores permitido, identificador del
  servidor, `desactivado_en` sin reactivar · **P-5** metadatos con nombre (A) · **P-6** enlace de un uso; primer Admin
  por comando · **P-7** mockups con `/mockup` · **P-8** se divide en 011 y 011b · **P-9** bitácoras y trabajos → 022b
  (PD-59) · **P-10** se respeta la matriz · **P-11** sin autosuspensión ni último Admin; sí internas · **P-12** nombre
  y rol en la auditoría · **P-13** suspensión congela comparticiones y enlaces · **P-14** código de empleado
  obligatorio y único · Operador ve métricas (matriz §2).
- Van al plan: DF-04 (fachadas), DF-36 (controlador por rol), PD-31/DF-27 (`INodeMetadataReader`), DF-15, `desactivado_en`.

## 9. Registro de cambios
| Fecha | Cambio | Motivo | Aprobó |
|---|---|---|---|
| 2026-10-03 | Creación en estado Borrador | Inicio de la spec 011 (RF-06) | — |
| 2026-10-03 | P-1…P-14 resueltas; cuota, vigencia y restauración pasan a 011b; 005 en «Depende de» | Respuestas de la dueña | Fátima (pendiente Adrián) |
| 2026-10-03 | CA-1 con «verificada»; bitácoras y trabajos → 022b; fuera: sesiones ajenas y limpieza de no verificadas | División de 022 (Adrián) y revisión de 001/002 | Fátima (pendiente Adrián) |
| 2026-10-03 | Operador ve métricas; catálogo (0 editores, identificador, `desactivado_en`); estado de metadatos; CA-17 y §6 con los 5 mockups | Mockups y matriz §2 | Fátima (pendiente Adrián) |
| 2026-10-06 | 006 y 007 en «Depende de»; `slug` y `desactivado_en` como única fuente; un plan no se edita; auditoría de catálogo sin cliente; tipo propio en `token_cuenta`; internas sin plan ni espacio; espacio total = suma de `espacio_usado` | Revisión de la spec (hallazgos 1–8) | Fátima (pendiente Adrián) |
