# Spec 012 — Compartición y accesos

> Qué y por qué, en ≤ 150 líneas. El cómo va en `./plan.md` (obligatorio).

| Campo | Valor |
|---|---|
| Estado | Borrador |
| Dueño | Fátima (4) |
| Fase | 2 |
| Requisitos | RF-16, RF-18 (principales; caso de uso 31); aplican RF-05, RF-07, RF-09, RF-11, RF-12, RF-13, RF-14, RF-23, RF-38, RNF-05, RNF-07, RNF-13, RNF-14, RNF-17 |
| Depende de | 003 y 006 (hechas: `Actor`, `accessibleNodes`, RLS, carpetas y papelera); 004 (auditoría), 005 (descarga), 014 (reemplazo de versiones; enmiendas en §8), 011 (suspensión, RN-6 de 011) y 010 (solo lectura, RN-6 y RN-11 de 010, en Borrador) |
| Módulo | M3b `sharing`; completa `accessibleNodes(actor)` de M3a `access` (rama de comparticiones directas y heredadas) |
| DF | DF-31 (RN-1), DF-40 / ADR-0011 opción A (RN-3), DF-32 (se completa aquí); PD-78 (CA-23), PD-114 y PD-20 (§8) |
| Última actualización | 2026-10-17 |

## 1. Contexto y objetivo
Hoy cada cliente solo ve lo suyo: `accessibleNodes` tiene únicamente la rama de propiedad. RF-16 pide compartir archivos y
carpetas con otras personas como Lector o Editor, y RF-18 que el propietario vea y revoque quién tiene acceso. Resultado
observable: el propietario comparte por correo, cambia el nivel y revoca; el destinatario encuentra lo compartido en
«Compartido conmigo», navega dentro de las carpetas compartidas y trabaja según su nivel; nadie más ve ni infiere recursos ajenos.

## 2. Historias de usuario
- **HU-1** Como propietario, quiero compartir un archivo o una carpeta con otra persona de Nimbo como Lector o Editor, para trabajar con ella.
- **HU-2** Como propietario, quiero ver quién tiene acceso a un recurso, cambiar su nivel y revocarlo, para controlar lo mío.
- **HU-3** Como destinatario, quiero ver lo que me compartieron separado de mis archivos, trabajar según mi nivel y poder salirme.
- **HU-4** Como equipo, queremos que nadie vea ni infiera recursos que no le compartieron, ni siquiera el personal interno.

## 3. Criterios de aceptación
> Los códigos nuevos (`SHARING_*`) y las cifras de límite de tasa los fija el plan. «404 idéntico» = mismo estado y cuerpo salvo `correlationId` (003 D-6).

### Compartir (HU-1, RF-16)
- **CA-1** (HU-1) Dado un archivo o carpeta propios fuera de la papelera y el correo de una cuenta de cliente verificada y activa, cuando el propietario lo comparte como Lector o Editor, entonces la persona aparece en la lista de accesos con ese nivel y el recurso aparece en su «Compartido conmigo». No se envía correo (RN-11). — error: con la cuenta del propietario en solo lectura (RN-14), `403` `STORAGE_ACCOUNT_READ_ONLY` con el mensaje de 010 CA-13 y no se crea nada.
- **CA-2** (HU-1) — error: Dado un correo sin cuenta, de una cuenta sin verificar, suspendida o interna, cuando se comparte, entonces la respuesta es la misma en los cuatro casos, con «No pudimos compartir con {correo}. Revisa que sea el correo de una cuenta de Nimbo activa.», y no se crea nada.
- **CA-3** (HU-1, DF-31) — error: Dado el correo propio, un correo mal formado o un nivel distinto de Lector o Editor (incluido Propietario), cuando se comparte, entonces se rechaza sin cambios: el propio con «Este elemento ya es tuyo.»; los demás con `400` y el campo en falla.
- **CA-4** (HU-1) — error: Dada una persona que ya tiene acceso directo al recurso, cuando se vuelve a compartir con ella, entonces no se duplica ni cambia su nivel, y se responde «{persona} ya tiene acceso. Cambia su nivel en la lista.»
- **CA-5** (HU-1, RNF-07) — error: Dados más intentos de compartir que el límite configurado por cuenta, cuando se envía otro, entonces `429` con `Retry-After` y «Hiciste muchos intentos. Espera {n} minutos y vuelve a intentarlo.»

### Ver, cambiar y revocar (HU-2, RF-18)
- **CA-6** (HU-2) Dado un recurso propio, cuando el propietario abre su lista de accesos, entonces ve primero su propia fila («(tú)», Propietario, sin controles) y luego cada persona con nombre, correo, nivel y fecha: las directas, y las heredadas agrupadas por la carpeta de la que vienen, con «Gestionar en «{carpeta}»», porque solo se cambian o revocan en esa carpeta.
- **CA-7** (HU-2) Dado un acceso directo, cuando el propietario elige Lector ↔ Editor (el cambio se aplica al elegirlo, sin «Guardar»), entonces el nuevo nivel rige desde la siguiente operación del destinatario, sin revocar ni cambiar la fecha. — error: con la cuenta del propietario en solo lectura, Lector → Editor se rechaza como en CA-1 y el nivel no cambia; Editor → Lector sí se aplica (RN-14).
- **CA-8** (HU-2) Dado un acceso directo, cuando el propietario lo revoca («Quitar», con la confirmación «Quitar acceso»), entonces la persona deja de ver el recurso y lo que heredaba de él: listados, descarga y vista previa (cuando exista, 017) responden `404` idéntico al de un recurso inexistente. Revocar se permite aunque la cuenta del propietario esté en solo lectura (RN-14).
- **CA-9** (HU-2) — error: Dado un Editor o Lector, cuando pide la lista de accesos, cambia un nivel, revoca o comparte, entonces se rechaza (`403`) sin revelar quién más tiene acceso; un cliente sin acceso recibe `404` idéntico.

### Compartido conmigo (HU-3)
- **CA-10** (HU-3, RF-12) Dado un destinatario, cuando abre «Compartido conmigo», entonces ve los recursos con compartición directa vigente (nombre, tipo, propietario, nivel efectivo, fecha), paginados y de lo más reciente a lo más antiguo; nada de eso aparece en «Mis archivos», en su papelera ni en su medidor de espacio.
- **CA-11** (HU-3) Dada una carpeta compartida, cuando el destinatario la abre, entonces ve sus subcarpetas y archivos fuera de la papelera con su nivel efectivo, y las migas empiezan en «Compartido conmigo» y la carpeta compartida, sin carpetas superiores del propietario; lo compartido nunca expone una carpeta superior no compartida (`parentId` vacío).
- **CA-12** (HU-3, RF-09) Dado un recurso compartido, cuando el Lector o el Editor lo ve o lo descarga, entonces funciona con las reglas de 005 (URL firmada de 5 min a un solo objeto).
- **CA-13** (HU-3, RF-13) Dado un archivo compartido con él como Editor, cuando sube una nueva versión desde «Compartido conmigo», entonces pasa a ser la actual con el Editor como autor y el archivo conserva su `id` y nombre. La cuota, el máximo por archivo y la retención son los del plan del propietario: el espacio suma en su cuenta, la poda sigue 014 CA-13 y, si el archivo está en el límite, antes de confirmar se avisa exactamente «Se eliminará la versión más antigua para guardar esta.» (§5: sin datos del plan del propietario). Se audita como el reemplazo de 014 (CA-19), con el propietario como afectado (RN-12).
- **CA-14** (HU-3, RF-12, RF-14) — error: Dada una nueva versión del Editor, cuando se inicia o completa, entonces se rechaza y la versión actual no cambia, con un mensaje por causa: supera la cuota libre del propietario → `STORAGE_QUOTA_EXCEEDED` con «La cuenta de quien lo compartió no tiene espacio para esta versión. Avísale para que libere espacio.» (sin mostrar su espacio libre); supera el máximo por archivo de su plan → `STORAGE_FILE_TOO_LARGE` con «El archivo supera el máximo por archivo del plan de quien lo compartió.» (sin la cifra); contradice su extensión o es un ejecutable → `STORAGE_INVALID_FILE_TYPE` con los mensajes de 005 (CA-11 y CA-24) tal cual, como 014 CA-3; la cuenta del propietario está en solo lectura (RN-14) → `403` con el código y el mensaje que el plan acuerda con 010 (§8), sin revelar la causa ni el plan del propietario.
- **CA-15** (HU-3) — error: Dado un Editor o Lector, cuando intenta subir un archivo nuevo, crear una carpeta, renombrar, mover, eliminar, crear un enlace (013), ver el historial o restaurar o descargar una versión anterior, o un Lector intenta subir una nueva versión, entonces se rechaza y nada cambia: con `404` `STORAGE_NODE_NOT_FOUND` idéntico, salvo la nueva versión del Lector (`403`), porque el Lector sí ve el archivo.
- **CA-28** (HU-3) — error: Dada una carga de nueva versión de un Editor en curso, cuando pierde el acceso (CA-8, CA-16, CA-21, CA-23) y la completa, entonces se rechaza con el mismo `404` idéntico y la versión actual no cambia.
- **CA-16** (HU-3) Dado un acceso directo, cuando el destinatario usa «Salir de la compartición» y confirma, entonces deja de ver el recurso (como CA-8) y desaparece de la lista del propietario, también con la cuenta del propietario en solo lectura (RN-14). Un recurso que solo hereda no ofrece «Salir»; intentarlo se rechaza sin cambios.
- **CA-17** (HU-3, RF-38) Dado un recurso compartido vigente, cuando el destinatario lo fija o lo abre (reglas de 006 CA-27 y CA-28), entonces aparece en sus «Accesos rápidos» con su ícono, sin pantallas nuevas; al perder el acceso (CA-8, CA-16, CA-21, CA-23) deja de aparecer.

### Herencia y precedencia (HU-1, HU-3)
- **CA-18** (HU-1) Dada una carpeta compartida, cuando el propietario sube, crea o mueve algo dentro, entonces el destinatario lo ve con el nivel heredado; cuando lo mueve fuera, deja de verlo salvo que tenga acceso directo o heredado por otra ruta.
- **CA-19** (HU-1) Dada una compartición directa, cuando el propietario mueve el recurso, entonces esa compartición no cambia.
- **CA-20** (HU-1) Dados accesos directo y heredados al mismo recurso, cuando se resuelve el nivel, entonces gana el mayor (Editor sobre Lector); revocar uno deja vigente el otro.

### Papelera, purga y suspensión
- **CA-21** (RF-11) Dado un recurso compartido (o dentro de una carpeta compartida), cuando el propietario lo manda a la papelera, entonces los destinatarios dejan de verlo (`404` idéntico); al restaurarlo vuelven a verlo con su nivel anterior; al purgarlo, sus comparticiones se eliminan.
- **CA-22** (RN-7 de 006) — error: Dado un destinatario, cuando intenta ver, restaurar o purgar desde la papelera del propietario, entonces `404` idéntico.
- **CA-23** (PD-78, RN-6 de 011) Dado un propietario o destinatario suspendido, cuando cualquiera usa sus comparticiones, entonces no funcionan (para el otro, `404` idéntico); al reactivarlo vuelven igual; suspender no borra ninguna. En la lista del propietario el acceso de un destinatario suspendido se ve igual, sin indicar la suspensión, y se puede revocar.

### Aislamiento, roles, auditoría e interfaz (HU-4)
- **CA-24** (HU-4, RNF-05) Dados clientes A (propietario), B (destinatario) y C (ajeno) con contenido casi idéntico, cuando C pide cualquier recurso de A, y B pide hermanos, carpetas superiores o recursos no compartidos de A, entonces `404` idéntico; la autorización está en la consulta y la segunda barrera de la base de datos deja leer lo compartido sin permitir lo que el nivel no da. Se añade a `pnpm test:isolation`, con CA-8, CA-15, CA-21 y CA-23.
- **CA-25** (HU-4, RF-05) Dado un Administrador, Soporte u Operador, cuando llama cualquier ruta de esta spec, entonces `403` `SHARED_FORBIDDEN` (sin token, `401`); por compartición nunca reciben nodos ni contenido (CA-9 de 003).
- **CA-26** (RF-07, RNF-17) Dadas las acciones de compartir, cambiar nivel, revocar y salir, cuando se revisan auditoría y bitácoras, entonces cada acción deja un evento con actor, afectado (RN-12), tipo y UUID del recurso, UUID del destinatario, nivel y `correlationId`, y nunca nombres de archivos o carpetas, correos ni contenido.
- **CA-27** (RNF-13, RNF-14) Dadas las pantallas de §6, cuando se usan a 360 y 1440 px, entonces cada estado existe en español, con causa y acción correctiva, contraste AA y sin violaciones serias de axe.

## 4. Reglas de negocio
- **RN-1** Solo el propietario comparte, cambia el nivel, revoca y ve la lista de accesos. Solo se asignan Lector o Editor; Propietario nace de la propiedad y nunca se asigna (DF-31).
- **RN-2** Solo se comparte con cuentas de cliente registradas, verificadas y activas, identificadas por su correo. No con cuentas internas, ni con uno mismo, ni con correos sin cuenta (no hay invitaciones).
- **RN-3** Cada compartición apunta exactamente a un archivo o a una carpeta (DF-40, ADR-0011 opción A), y hay a lo sumo una directa por recurso y destinatario; el nivel solo cambia desde la lista.
- **RN-4** Lector: ver, previsualizar, descargar y consultar al agente. Editor: lo mismo, más editar y subir nuevas versiones de archivos existentes. Historial y restauración de versiones son solo del propietario (014 RN-7). Ninguno sube archivos nuevos, crea carpetas, renombra, mueve, elimina ni crea enlaces: decisión de 012, que precisa la tabla de niveles de `product-context.md` §2.
- **RN-5** El acceso heredado se calcula por la ubicación actual del recurso: dentro de una carpeta compartida se gana, fuera se pierde. Las directas no cambian al mover.
- **RN-6** Con varios accesos al mismo recurso rige el mayor: Propietario > Editor > Lector.
- **RN-7** Lo compartido no cuenta en la cuota del destinatario, sino en la del propietario, incluidas las versiones que suba un Editor, que usan el máximo por archivo y la retención del plan del propietario.
- **RN-8** «Salir de la compartición» borra solo el acceso directo propio; lo heredado se deja saliendo de la carpeta de origen.
- **RN-9** La papelera no borra comparticiones: las deja sin efecto hasta restaurar (006 RN-2 y RN-3). La purga sí las borra. Solo el propietario usa la papelera (006 RN-7).
- **RN-10** Una cuenta de cliente suspendida (propietario o destinatario) deja sin efecto sus comparticiones; al reactivarla vuelven igual; no se borran datos ni se revela la suspensión a la otra parte (011 RN-6, PD-78).
- **RN-11** Sin aviso por correo al destinatario y sin límite de comparticiones por plan (no está en el catálogo §3).
- **RN-12** En la auditoría, el afectado de compartir, cambiar nivel, revocar, salir y de la nueva versión de un Editor es el propietario del recurso (004 RN-1); el destinatario no recibe eventos propios de estas acciones en 012.
- **RN-13** Lo compartido vigente puede estar en los «Accesos rápidos» del destinatario (RF-38) y sale de ellos al perder el acceso.
- **RN-14** Con la cuenta del propietario en solo lectura manda su cuenta (010 RN-6/RN-11, Borrador): se rechazan compartir, subir Lector → Editor y las nuevas versiones del Editor; se permiten quitar accesos, bajar Editor → Lector y «Salir de la compartición», porque reducen la exposición y el propietario siempre puede retirar lo que compartió (decisión de Fátima). Ver y descargar siguen como en CA-12.

## 5. Seguridad y privacidad
- **¿Toca datos de un cliente?** Sí: amplía quién ve contenido ajeno y quién escribe versiones. Aislamiento obligatorio (CA-24); actúa el `security-auditor`. La autorización vive en `accessibleNodes(actor)` dentro de la consulta (RNF-05), nunca filtrando después; la segunda barrera RLS se amplía a lo compartido solo en lo que el nivel permite (`architecture.md` §6).
- **Enumeración de cuentas:** todo fallo por la cuenta destino responde igual (CA-2) y hay límite de tasa (CA-5). Se aceptan dos deducciones indirectas y poco probables: un éxito confirma que la cuenta existe (inherente a compartir con cuentas registradas), y compartir con una cuenta suspendida da el error genérico (CA-2) mientras esa persona sigue apareciendo igual en la lista de otro recurso (CA-23).
- **Auditoría (RF-07):** CA-26 y, para versiones del Editor, 014 CA-19. **Nunca en bitácoras:** nombres de archivos o carpetas, correos, contenido, tokens ni URLs firmadas.
- **Roles internos:** `403` en todo (CA-25); no comparten ni reciben (RN-2); `accessibleNodes` sigue vacío para ellos; sus vistas de metadatos (011) no muestran comparticiones.
- **Datos visibles al destinatario:** nombre del propietario y el recurso compartido con su contenido; nunca otros destinatarios, rutas superiores, ni el plan del propietario, su retención, su máximo por archivo o su espacio libre (CA-9, CA-11, CA-13, CA-14); ante la solo lectura del propietario, el Editor solo sabe que no puede subir la versión (CA-14).

## 6. Experiencia de usuario
| Pantalla | Mockup (`docs/design/mockups/…`) | Estados requeridos | Estado del mockup |
|---|---|---|---|
| Diálogo «Compartir» y lista de accesos (desde el menú de la fila en «Mis archivos») | `sharing/compartir/` | menu-fila, cargando, sin-accesos, con-accesos (directos y heredados), con-accesos-carpeta, agregando, compartido, error-correo-generico, error-propio, ya-tiene-acceso, cambiando-nivel, confirmar-revocar, demasiados-intentos, error con «Reintentar» | Borrador (2026-10-17), 14 estados, capturas 360/1440; sin «externos» ni enlace público (013) |
| «Compartido conmigo» (entrada en la barra lateral y página) | `sharing/compartido-conmigo/` | lista (con «Cargar más»), cargando-mas, carpeta-abierta con migas, vacio, cargando, error, ya-no-disponible, menu-fila-lector, menu-fila-editor («Subir nueva versión»), subiendo-version, version-subida, aviso-de-poda, error-espacio-propietario, error-tamano-propietario, error-tipo, confirmar-salir, cajon-abierto | Borrador (2026-10-17), 17 estados, capturas 360/1440 |

- Mensajes clave: vacío «Aún no te han compartido nada.» / «Cuando alguien comparta un archivo o una carpeta contigo, aparecerá aquí.» · quitar acceso (botón «Quitar», confirmación «Quitar acceso») «{persona} dejará de ver «{nombre}».», con « y lo que contiene» solo si es una carpeta · salir «Dejarás de ver «{nombre}». Para recuperarlo, quien lo compartió tendrá que compartirlo de nuevo.» · ya-no-disponible «Este elemento ya no está disponible. Puede que hayan dejado de compartirlo contigo.» con «Volver a Compartido conmigo» · además los de CA-2 a CA-5 y CA-14 (el de solo lectura de CA-14 lo fija el plan).
- Solo lectura del propietario (RN-14; CA-1, CA-7, CA-14): sin mockup hasta que 010 tenga su aviso de solo lectura (010 §6); se dibuja antes de las tareas de UI de 012 (PD-108).
- Los mockups son guía visual: la spec manda. La entrada se llama «Compartido conmigo».

## 7. Fuera de alcance
- Enlaces públicos, su contraseña e intentos (013; DF-09, DF-10, PD-20).
- Invitaciones a correos sin cuenta y avisos por correo o notificaciones al destinatario (decisiones de 012: RN-2, RN-11); compartir con grupos u organizaciones (`product-context.md` §3 y §9: planes por cuenta, sin organizaciones).
- Que el Editor suba archivos nuevos, cree carpetas, renombre, mueva o elimine; por eso «Eliminado por» y «Eliminados por mí» (que 006 §7 difirió a 012) no aplican. Historial y restauración de versiones para Editor o Lector.
- Límites de comparticiones por plan; historial de accesos pasados (RF-18 pide los vigentes); indicador de «compartido» en «Mis archivos»; eventos de auditoría para el destinatario.
- Edición `.docx` en línea y su límite de editores (016); vista previa (017); búsqueda (018) y agente (020) heredan lo compartido por `accessibleNodes` sin trabajo aquí.

## 8. Preguntas
- [RESUELTA] P-0 → mockups `sharing/compartir/` y `sharing/compartido-conmigo/` hechos con `/mockup` (§6); pendientes de la aprobación de Adrián junto con la spec (2026-10-17, Fátima)
- [RESUELTA] P-1 → A: el Editor sube nuevas versiones con el plan del propietario; historial y restauración solo del propietario (CA-13, CA-14, RN-4, RN-7) (2026-10-17, Fátima)
- [RESUELTA] P-2 → las comparticiones vuelven al restaurar y la purga las borra (CA-21, RN-9) · P-3 → la lista muestra heredados con su carpeta (CA-6) · P-4 → volver a compartir se rechaza (CA-4) · P-6 → solo el propietario es afectado (RN-12) · P-7 → lo compartido entra en Accesos rápidos (CA-17, RN-13) · P-8 → la suspensión no se muestra en la lista (CA-23) (2026-10-17, Fátima)
- [RESUELTA] P-5 → con la cuenta del propietario en solo lectura lo fijan 010 RN-6 y RN-11 (pendiente de aprobar con la 010); lo que 010 no dice lo decide Fátima: quitar, bajar a Lector y salir se permiten; compartir, subir a Editor y las versiones del Editor se rechazan (RN-14; CA-1, CA-7, CA-8, CA-14, CA-16) (2026-10-17, Fátima)

**Notas para el plan y otras specs** (los riesgos técnicos, como el filtro por nivel en `storage` y la RLS, se detallan en el plan):
- Enmiendas a 014 (RN-7, CA-15) y 006 (CA-27) que piden CA-13, CA-17 y RN-4: **PD-114**, resuelto (2026-10-17).
- **PD-20** (contraseña de enlaces): la arista `sharing → identity` se decide una vez en ADR-0030; la 012 no usa contraseñas. ADR-0011 aceptado (DF-40 cerrado, 2026-10-17); DF-31 pasa a `Aceptado` con la aprobación del plan (RN-1).
- Dueña de `sharing`: corregida (Abel → Fátima) en este PR en `apps/api/src/modules/sharing/README.md` y en `docs/sdd/design-model.md` (fila M3b).
- El plan necesitará al `architect`: `sharing` debe resolver correo → cuenta (verificada, activa, suspendida o interna) y mostrar nombre y correo, que son de `identity`, y ADR-0010 no permite `sharing → identity`; RN-10 exige que `accessibleNodes` considere la suspensión; el `SharingController` de M3b no tiene cambiar nivel, salir ni «Compartido conmigo». El plan abrirá el siguiente DF libre en `main` al escribirlo (DF-69 y DF-70 quedan reservados por 009 y 010); la arista `sharing → identity` se decide una vez con PD-20.
- **Coordinación con 010 (Juan Marcos):** el mensaje de 010 CA-13 habla de «tu suscripción» y no sirve para el Editor; el plan define con 010 el de CA-14, sin revelar el plan del propietario, 010 RN-6 debería nombrar las excepciones de RN-14, y el mensaje de 010 CA-13 que reutilizan CA-1 y CA-7 debería cubrir compartir.
- CA-23 usa la suspensión de 011 (`suspend`/`reactivate`, en `main` desde su PR-A; las rutas llegan con su PR-B).

## 9. Registro de cambios
| Fecha | Cambio | Motivo | Aprobó |
|---|---|---|---|
| 2026-10-17 | Creación en `Borrador` con las decisiones de producto de Fátima como reglas (RN-1 a RN-11) y P-0 a P-8 abiertas (P-0 y P-1 bloqueantes) | `/spec 012` | — |
| 2026-10-17 | Decisiones de Fátima sobre P-1…P-8 (acepta las recomendaciones): nuevos CA-13, CA-14 y CA-17; ajustes en CA-4, CA-6, CA-15, CA-23; RN-3, RN-4, RN-7, RN-9, RN-10 y RN-12 precisadas; RN-13 nueva; CA renumerados; §9 «Para Adrián»; quedan abiertas P-0 (mockups) y P-5 (010) | Respuesta de Fátima | Fátima |
| 2026-10-17 | Ajustes tras mockups: mensajes sin género (CA-3, CA-14, salir); «Quitar» / «Quitar acceso» y «y lo que contiene» solo en carpetas (CA-8, §6); poda sin número de versión para el Editor (CA-13); fila «(tú)», nivel sin «Guardar» y heredados por carpeta con «Gestionar en…» (CA-6, CA-7); estados y estado de ambos mockups en §6; P-0 resuelta | Mockups de `/mockup` | Fátima |
| 2026-10-17 | Ajustes tras la revisión (B-2, I-1, I-2, I-3): CA-14 con un mensaje por causa (cuota, máximo por archivo, tipo); §5 acepta la deducción indirecta por suspensión; se quita «Para Adrián» y queda una lista corta en §8 (enmiendas, `architect`, DF desde DF-69); RF-11 y RF-14 en requisitos; §7 y RN-4 citan decisiones de 012; CA-8 con vista previa cuando exista (017); sin repetir RN-1 en RN-4 ni accesos rápidos en CA-8 | Revisión de la rama | Fátima |
| 2026-10-17 | Ajustes tras la revisión de Adrián (M-1, M-2, privacidad, redacción): §8 remite a PD-114 y PD-20 y pasa a «Notas para el plan y otras specs»; dos estados de error en §6 (17); CA-13 y CA-14 sin datos del plan del propietario y §5 lo dice; concordancia «Dada/Dados/Dadas» en los CA | Revisión de Adrián | Fátima |
| 2026-10-17 | Ajustes tras la revisión de la rama (P-5 con 010, DF reservados, PD-106/107): P-5 resuelta con RN-14 y errores en CA-1, CA-7 y CA-14; RF-23 y 010 en la cabecera; coordinación con 010 en §8 | Revisión de la rama | Fátima |
| 2026-10-17 | Pasada final de la revisión: CA-14 sin `STORAGE_ACCOUNT_READ_ONLY` para el Editor (código y mensaje los acuerda el plan con 010, sin revelar la causa); §6 con los estados de solo lectura pendientes (PD-108); coordinación con 010 también para el mensaje de compartir | Revisión de la rama | Fátima |
| 2026-10-17 | Ajustes del plan (D-5, D-9, CA-11, carga en curso): CA-15 con `404` idéntico, CA-13 y RN-12 con el propietario como afectado de la versión del Editor, CA-11 sin carpetas superiores, CA-28 nuevo | `/plan 012` | Fátima |
| 2026-10-17 | PD-105 renumerado a PD-114 (choque con 009); CA-15 cita 013 | Revisión del plan y las tareas | Fátima |
| 2026-10-17 | Adrián aprueba spec y mockups (2026-10-17); plan y tareas en revisión. PD-114 resuelto; PD-20 se decide en ADR-0030 | Revisión de Adrián | Adrián |
