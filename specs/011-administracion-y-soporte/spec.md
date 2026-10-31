# Spec 011 — Administración y soporte

| Campo | Valor |
|---|---|
| Estado | Hecha (2026-10-21: PR-A `586064b` y PR-B #67 `6ea7ebc` integrados en `main`) |
| Dueño | Fátima |
| Fase | 2 |
| Requisitos | RF-06 (principal); RF-05 (matriz), RF-07, RF-19, RF-24, RNF-02, RNF-05, RNF-13, RNF-14 |
| Depende de | 003, 004, 005 (metadatos de archivos), 006 (papelera), 007 (`espacio_usado`), 008 |
| Última actualización | 2026-10-17 |

## 1. Contexto y objetivo
Operar sin romper la privacidad (RF-06): el Administrador gestiona cuentas, altas internas y catálogo y ve métricas; Soporte
y Administrador ven solo metadatos de los archivos de un cliente; ningún rol interno ve contenido ni suplanta, y toda acción
sobre una cuenta ajena queda en la auditoría del cliente (Art. IX, RF-07). Cuota, vigencia y restauración: **011b** (P-8).

## 2. Historias de usuario
- **HU-1** Como Administrador, quiero listar, suspender y reactivar cuentas, para cortar el acceso ante abuso o una baja.
- **HU-2** Como Administrador, quiero dar de alta cuentas internas, para que Soporte y Operación tengan acceso (003 D-3).
- **HU-3** Como Administrador, quiero mantener el catálogo de planes, para cambiar la oferta sin desplegar.
- **HU-4** Como Administrador u Operador, quiero ver métricas agregadas, para conocer el uso sin ver datos de nadie.
- **HU-5** Como Soporte, quiero ver metadatos y estados de los archivos de un cliente, para ayudarle sin ver su contenido.
- **HU-6** Como cliente, quiero ver qué hizo el personal interno sobre mi cuenta, para confiar en el servicio.

## 3. Criterios de aceptación
**Cuentas (HU-1, HU-2)**
- **CA-1** (HU-1, RF-06) Dado un Administrador, cuando lista cuentas o busca por correo, entonces recibe una lista
  paginada con correo, nombre, rol, estado, verificada (sí/no), plan, espacio usado y fecha de alta, sin datos de archivos;
  «—» en plan y espacio de una interna (sin suscripción ni cuota) y en el plan de un cliente sin suscripción (009).
- **CA-2** (HU-1, RF-06, RF-07) Dado una cuenta activa ajena (cliente o interna), cuando el Administrador la suspende,
  entonces queda `suspendida`, se revocan sus sesiones (002 D-10), su inicio de sesión recibe `IDENTITY_ACCOUNT_SUSPENDED`
  y la acción se audita; un token de acceso ya emitido sigue valiendo hasta 15 min (002 D-10).
- **CA-3** (HU-1, RF-06, RF-07) Dado una cuenta suspendida, cuando el Administrador la reactiva, entonces queda
  `activa`, puede volver a iniciar sesión (las sesiones revocadas no vuelven) y la acción se audita.
- **CA-4** (HU-1, RF-06) — error: Dado un Administrador, cuando intenta suspenderse o reactivarse a sí mismo o suspender
  al último Administrador activo, entonces se rechaza con un `code` propio y nada cambia.
- **CA-5** (HU-2, RF-05, RF-06) Dado un Administrador, cuando crea una cuenta Administrador, Soporte u Operador con nombre,
  correo y código de empleado, entonces la cuenta existe, la persona recibe un enlace de un solo uso para fijar su
  contraseña (el Administrador nunca la conoce) y el alta se audita. El enlace reutiliza el mecanismo de la 001
  (`token_cuenta`, hash, un solo uso) con un tipo propio: fija la primera contraseña (solo con la cuenta activa) y no invalida sesiones. La cuenta nace
  con el correo verificado; si el enlace venció, la página indica usar «¿Olvidaste tu contraseña?» (sin reenvío).
- **CA-6** (HU-2, RF-05) — error: Dado un correo que ya tiene cuenta, un código de empleado repetido o el rol Cliente,
  cuando se intenta el alta, entonces se rechaza con un `code` de conflicto o de validación y no se crea nada.
- **CA-7** (HU-2, RF-05) Dado que no existe ningún Administrador activo, cuando alguien con acceso al servidor ejecuta el
  comando de alta inicial (no es una ruta HTTP ni un permiso de rol), entonces se crea el primer Administrador con el
  enlace de CA-5 y se audita como acción del sistema; si ya existe uno activo, se niega y no crea nada.

**Catálogo (HU-3)**
- **CA-8** (HU-3, RF-06, RF-19) Dado un Administrador, cuando abre el catálogo, entonces ve cada plan (activo o no) con
  nombre, descripción, precio, todos sus límites, su estado y cuántas cuentas lo tienen (conteo agregado, sin nombres).
- **CA-9** (HU-3, RF-06, RF-19) Dado un Administrador, cuando crea un plan con nombre, descripción, precio y límites,
  entonces el plan queda activo, se ofrece a contrataciones nuevas y el alta se audita. La web puede llenar el formulario
  con los valores de un plan activo (que no cambia) y, tras crear, ofrecer desactivar ese plan (CA-10).
- **CA-10** (HU-3, RF-06, RF-24) Dado un plan activo distinto de Personal, cuando el Administrador lo desactiva,
  entonces deja de ofrecerse a contrataciones nuevas, quien ya lo tiene lo conserva con sus mismos valores, guarda la
  fecha de desactivación y se audita; un plan desactivado no se reactiva.
- **CA-11** (HU-3, RF-06, RNF-02) — error: Dado el plan Personal, cuando el Administrador intenta desactivarlo, entonces
  se rechaza con un `code` propio y nada cambia. Dado un plan nuevo con nombre repetido, precio negativo, límites no
  positivos (editores admite 0) o máximo por archivo > cuota o > 2 GB, cuando se guarda, entonces `422` con los campos.

**Métricas (HU-4)**
- **CA-12** (HU-4, RF-05, RF-06) Dado un Administrador u Operador, cuando abre el panel de métricas en la app, entonces
  ve solo totales y conteos (cuentas por estado; por plan, solo clientes con suscripción, que pueden sumar menos que el
  total; espacio = suma de `usuario.espacio_usado` de 005/007, sin recalcular desde archivos), nunca filas de una cuenta.

**Metadatos (HU-5)**
- **CA-13** (HU-5, RF-05, RF-07) Dado Soporte o un Administrador, cuando consulta los archivos de un cliente, entonces
  recibe solo nombre, tipo, tamaño, fechas y estado («Disponible» o «En papelera desde…», según la 006; sin cargas
  en curso), nunca contenido, texto, URL ni clave de objeto, y la consulta se audita. — error: un correo inexistente o de
  una cuenta interna recibe el mismo `404` (003 D-6), sin auditoría.

**Roles, aislamiento y auditoría (HU-6)**
- **CA-14** (RF-05, RNF-05) — error: Dado un Cliente o un interno ya no activo (aunque su token siga vigente), cuando llama
  al backoffice, entonces `403` `SHARED_FORBIDDEN`; Soporte y Operador, en lo que la matriz no les da (Operador: solo CA-12).
- **CA-15** (RF-05, RNF-05) Dado la suite de aislamiento, cuando recorre cada acción de esta spec con cada rol interno,
  entonces ninguna respuesta contiene contenido, texto, URL firmada, clave de objeto ni filas de versiones.
- **CA-16** (HU-6, RF-07) Dado acciones internas sobre la cuenta de un cliente, cuando él abre su auditoría (004),
  entonces ve cada una con fecha, el rol de la persona interna (nunca su nombre ni su correo, 004 D-2) y la acción; las de otra cuenta y los cambios de catálogo no aparecen.

**Web**
- **CA-17** (RF-06, RNF-13, RNF-14) Dado Administrador, Soporte u Operador, cuando llega a su área, entonces ve sus
  pantallas con los estados de §6 (cargando y error con «Reintentar» donde se cargan datos; en los formularios, error del
  servidor conservando lo escrito; vacío y éxito donde aplican) y la pantalla común «sin permiso» (003 D-8), usables a
  360 px; el área del Operador solo tiene Métricas hasta la 022b. Desde el menú de su cuenta, cada rol interno abre
  Seguridad (002) y Mi actividad (004) dentro de su marco (matriz §2: su sesión y su propia bitácora).

## 4. Reglas de negocio
- **RN-1** El rol interno nunca da acceso a contenido ni vista previa; no hay suplantación ni «ver como» (Art. IX).
- **RN-2** Toda acción de un rol interno sobre una cuenta ajena se audita y la ve el cliente con el rol de quien la hizo,
  sin su nombre (RF-07, 004 D-2), incluidas las consultas de metadatos (`product-context.md` §5).
- **RN-3** El Operador no opera cuentas (matriz §2): aquí solo ve las métricas agregadas (CA-12). El comando de CA-7 lo
  ejecuta quien tiene acceso al servidor; no es un permiso de ningún rol.
- **RN-4** Un plan no se edita (ni nombre ni descripción) y no existe operación para editarlo: para cambiar la oferta o
  corregir un nombre se crea uno nuevo y se desactiva el anterior, que quien lo tenía conserva (RF-24). El estado sale
  solo de `desactivado_en` (nulo: se ofrece; con fecha: desactivado), sin reactivación ni booleano aparte. Personal no se
  desactiva. Nombres únicos; el identificador corto es el `slug` de 006a, que deriva el servidor (los cuatro de la
  semilla no cambian). Bytes y centavos (ADR-0016); el máximo por archivo nunca supera 2 GB (RNF-02).
- **RN-5** Una cuenta por correo y sin roles acumulados (001 RN-2, Art. IX.5); código de empleado obligatorio y único en internas.
- **RN-6** Suspender no borra datos (la papelera sigue su retención, 006 CA-19). Con una cuenta de cliente suspendida,
  sus comparticiones y enlaces públicos dejan de funcionar y al reactivarla vuelven como estaban (lo aplican 012 y 013).
- **RN-7** Siempre existe al menos un Administrador activo y nadie se suspende ni se reactiva a sí mismo. Un interno
  suspendido no hace ninguna acción del backoffice (`403` `SHARED_FORBIDDEN`, CA-14); suspenderlo o restablecer su contraseña invalida su enlace de alta pendiente y reactivarlo no lo revive («¿Olvidaste tu contraseña?»).

## 5. Seguridad y privacidad
- **Toca datos de clientes: sí** (metadatos de cuentas y archivos, estado) → aislamiento bloqueante (CA-15) y matriz (CA-14).
- **Auditoría (RF-07)**: sobre una cuenta (suspender, reactivar, alta interna, consulta de metadatos) con actor, cuenta
  afectada y recurso por id (DF-12), visible para la cuenta afectada; catálogo (actor e id del plan) y alta inicial (CA-7,
  acción del sistema) sin cuenta afectada: no los ve nadie en «Mi actividad».
- **No va a bitácoras** (RNF-17): correos, nombres de archivo, contenido, contraseñas, tokens ni enlaces de alta.
- **Roles**: Admin → cuentas, altas, catálogo, métricas y metadatos; Soporte → metadatos; Operador → métricas.

## 6. Experiencia de usuario
| Pantalla | Mockup (`docs/design/mockups/…`) | Estados requeridos | Estado del mockup |
|---|---|---|---|
| Admin: cuentas y ficha | `backoffice/admin/` | default, ficha, vacio, cargando, error, confirmar-suspender, suspendida, confirmar-reactivar, propia-cuenta | Aprobado |
| Admin: alta interna | `backoffice/alta-interna/` | default, error-campos, error-conflicto, enviando, exito | Aprobado |
| Admin: catálogo de planes | `backoffice/catalogo/` | default, cargando, error, creando, error-campos, exito, confirmar-desactivar, desactivado | Aprobado |
| Admin y Operador: métricas | `backoffice/metricas/` | default, cargando, error, con-plan-inactivo, operador | Aprobado |
| Invitada: crear tu contraseña | sin mockup: patrón de `restablecer-contrasena` (002), con Cielo Sereno (P-15) | default, enviando, error-campos, enlace-vencido, enlace-invalido, exito | Decisión explícita |
| Interna: Seguridad y Mi actividad | sin mockup: páginas de 002 y 004 en el marco interno (P-18) | los de 002 y 004 | Decisión explícita |
| Soporte: metadatos de un cliente | `backoffice/soporte/` | inicial, default, vacio, cargando, no-encontrado, error, desde-admin | Aprobado |

- Cielo Sereno (`design-cielo-sereno.md`) con los tonos AA corregidos de `ui-guidelines.md` §2 (Art. XIII.2).
- Mensajes clave: «Esta cuenta quedó suspendida y se cerraron sus sesiones.» · «Los planes no se editan: crea uno nuevo y
  desactiva el anterior.» · el aviso de metadatos de P-5 (los textos completos, en el README de cada mockup).

## 7. Fuera de alcance
- **011b**: cuota, vigencia y restauración por Soporte con su motivo (004 D-6) (P-8). **022b** (RF-37): bitácoras técnicas,
  trabajos y reintentos para los tres roles (P-9). Comparador y contratación (008, 009) y cambio de plan (010).
- Fuera de la matriz: sesiones ajenas (PD-75), «cambiar plan» y «cerrar sesiones» sin suspender (P-10). Suplantación,
  «ver como», vistas previas o descargas para internos (Art. IX); limpieza de cuentas no verificadas (001 D-21); borrar
  cuentas, roles configurables, organizaciones, prorrateo y dinero real (§9).

## 8. Preguntas
- [RESUELTA] (2026-10-03, Fátima) **P-1** panel propio · **P-2** → 011b: extra sobre el plan, bajo lo usado, con fecha de
  fin · **P-3** → 011b: solo extender, quita la solo lectura, no aplica a Personal · **P-4** crear y desactivar (RN-4) ·
  **P-5** metadatos con nombre · **P-6** enlace de un uso; primer Admin por comando · **P-7** `/mockup` · **P-8** 011 y 011b
  · **P-9** → 022b (PD-74) · **P-10** la matriz manda · **P-11** sin autosuspensión ni último Admin; sí internas · **P-13**
  suspender congela comparticiones y enlaces (PD-78) · **P-14** código único · (2026-10-07) **P-12** solo el rol (004 D-2)
  · **P-15** patrón de `restablecer-contrasena` · **P-16** búsqueda por inicio del correo · **P-17** conteo por plan ·
  **P-18** Seguridad y Mi actividad en el área interna · **P-19** un interno suspendido no actúa.

## 9. Registro de cambios
| Fecha | Cambio | Motivo | Aprobó |
|---|---|---|---|
| 2026-10-03 | Creación; P-1…P-14; 011b y 022b; «verificada»; Operador ve métricas; estados de los 5 mockups | Respuestas de la dueña, división de 022 y mockups | Fátima; aprobado por Adrián (2026-10-08) |
| 2026-10-06 | 006 y 007 en «Depende de»; `slug` y `desactivado_en`; un plan no se edita; auditoría de catálogo sin cliente; `token_cuenta` con tipo propio; CA-7 sin rol; CA-11, CA-13, CA-17, CA-9 y CA-2 | Revisiones de Adrián y del `reviewer` | Fátima; aprobado por Adrián (2026-10-08) |
| 2026-10-07 | CA-5 y CA-8; §6 «Crear tu contraseña» y área interna con Seguridad y Mi actividad; solo el rol (004 D-2); RN-6 con la papelera; RN-7/CA-4 sin autorreactivación ni acciones de un interno suspendido; correos fuera de bitácoras | Preguntas del plan, contradicciones con 002, 004 y 006, y `architect` | Fátima; aprobado por Adrián (2026-10-08) |
| 2026-10-14 | CA-1 y CA-12: un cliente sin suscripción muestra «—» y no cuenta en ningún plan; RN-5 más corta (sin cambio) | Acuerdo con Juan Marcos al planificar la 009 | Fátima; aprobado por Adrián (2026-10-15) |
| 2026-10-17 | CA-5 y RN-7: el enlace de alta solo sirve con la cuenta activa; suspender o restablecer la contraseña lo invalida (plan §2 y §5, bitácoras) | Auditoría de seguridad del PR-A (SEC-1, SEC-3, SEC-4) | Fátima; aprobado por Adrián (PR-A, 2026-10-17) |
