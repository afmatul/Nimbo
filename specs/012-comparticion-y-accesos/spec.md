# Spec 012 — Compartición y accesos (API)

> Qué y por qué, en ≤ 150 líneas. El cómo va en `./plan.md` (obligatorio). La pantalla va en la 012b.

| Campo | Valor |
|---|---|
| Estado | En curso (plan aprobado por Adrián, 2026-10-30) |
| Dueño | Fátima |
| Fase | 2 |
| Requisitos | RF-16, RF-18; apoyan RF-05, RF-07, RF-33, RNF-05, RNF-07, RNF-17 |
| Depende de | 003, 006 (consume lo integrado de 004, 005, 010, 014, 016, 019 y 020) · Hermana: 012b (pantalla) |
| Última actualización | 2026-10-30 |

## 1. Contexto y objetivo
Hoy cada cliente solo alcanza lo suyo. Esta spec deja que un propietario comparta un archivo o una carpeta con otro
cliente como Lector o Editor, vea quién tiene acceso (directo o heredado) y lo revoque, y que el destinatario alcance
exactamente lo compartido, con el poder de su nivel y nada más. Entrega solo la API y la autorización; el diálogo
«Compartir» y la lista de accesos son la 012b. Los enlaces públicos son la 013.

## 2. Historias de usuario
- **HU-1** Como propietario, quiero compartir un archivo o carpeta con otro cliente por su correo como Lector o Editor, para trabajar juntos sin copiar archivos.
- **HU-2** Como propietario, quiero cambiar el nivel de alguien con quien ya compartí, para ajustar lo que puede hacer.
- **HU-3** Como propietario, quiero ver quién tiene acceso a un recurso y de dónde le viene, para saber quién lo ve.
- **HU-4** Como propietario, quiero revocar un acceso, para dejar de compartir cuando ya no corresponda.
- **HU-5** Como destinatario, quiero abrir lo compartido conmigo según mi nivel, para colaborar sin poder dañar lo ajeno.
- **HU-6** Como equipo, queremos una suite que falle si una cuenta alcanza lo que nadie le compartió.
- **HU-7** Como destinatario, quiero listar lo que me compartieron y salir de ello, para encontrarlo sin enlace y dejar de verlo.

## 3. Criterios de aceptación
> Dado/Cuando/Entonces. «Nodo» = archivo o carpeta. Los errores de un nodo ajeno son idénticos a los de uno inexistente (003 D-6).

**Compartir (RF-16)**
- **CA-1** (HU-1, RF-16) Dado un nodo mío vivo y el correo de otro cliente verificado y activo, cuando lo comparto como `VIEWER` o `EDITOR`, entonces responde `201` con la entrada (destinatario, nivel, origen `direct`) y queda en mi auditoría.
- **CA-2** (HU-1, RF-16) — error: Dado el nivel `OWNER` (DF-31) o uno desconocido, cuando comparto, entonces `422` `SHARING_INVALID_LEVEL` y no se crea nada.
- **CA-3** (HU-1, RF-16) — error: Dado un correo sin cuenta de cliente verificada y activa (no existe, es interna, sin verificar o suspendida), cuando comparto, entonces `422` `SHARING_RECIPIENT_NOT_FOUND`, igual en los cuatro casos; con mi propio correo, `422` `SHARING_CANNOT_SHARE_WITH_SELF`; con un correo mal formado, el `422` de validación con `fields`.
- **CA-4** (HU-1, RF-16) — error: Dado un nodo ajeno, inexistente, en la papelera o donde soy Editor o Lector, cuando intento compartirlo, entonces `404` `STORAGE_NODE_NOT_FOUND` y nada cambia.
- **CA-5** (HU-2, RF-16) Dado un acceso directo, cuando comparto otra vez con la misma persona con otro nivel, entonces `200`, cambia el nivel sin duplicar y se audita el cambio; con el mismo nivel, `200` sin evento nuevo.
- **CA-6** (HU-1, RF-16) — error: Dado mi cuenta en solo lectura (010 RN-6), cuando comparto con alguien nuevo o subo a alguien de `VIEWER` a `EDITOR`, entonces `403` `STORAGE_ACCOUNT_READ_ONLY` y nada cambia; revocar y bajar a `VIEWER` se permiten.
- **CA-7** (HU-1, RNF-07) — error: Dado que superé el límite de intentos de compartir, cuando lo intento otra vez, entonces `429` `SHARED_TOO_MANY_REQUESTS` con la espera, sin decir si el correo existe.

**Accesos vigentes (RF-18)**
- **CA-8** (HU-3, RF-18) Dado un nodo mío, cuando pido sus accesos, entonces recibo cada persona con nombre, correo, nivel y fecha, y su origen: `direct` (con `shareId`) o `inherited` (con la carpeta que lo comparte, sin `shareId`).
- **CA-9** (HU-3, RF-18) — error: Dado un nodo ajeno, inexistente o donde soy Editor o Lector, cuando pido sus accesos, entonces `404` `STORAGE_NODE_NOT_FOUND`; un rol interno recibe `403` `SHARED_FORBIDDEN`.
- **CA-10** (HU-4, RF-18) Dado un acceso directo vigente, cuando lo revoco, entonces `204` y desde la siguiente petición esa persona recibe `404` sobre el nodo (y sobre su contenido si es carpeta); queda auditado.
- **CA-11** (HU-4, RF-18) — error: Dado un `shareId` ajeno, inexistente o ya revocado, cuando intento revocarlo, entonces `404` `SHARING_SHARE_NOT_FOUND` y nada cambia.

**Lo que alcanza el destinatario (RF-16, RF-05, RNF-05)**
- **CA-12** (HU-5, RF-16) Dado un archivo compartido conmigo, cuando abro su ficha o pido descargarlo (URL de 5 min), entonces lo obtengo; no aparece en la raíz de «Mis archivos», no cuenta en mi espacio usado y no toca mi cuota.
- **CA-13** (HU-5, RF-16) Dado una carpeta compartida conmigo, cuando la abro, entonces veo su contenido actual y futuro con su nivel (el mayor si también tengo un acceso directo), las migas empiezan en ella, y un archivo que sale de la carpeta o la papelera de la carpeta dejan de verse; al restaurar, vuelven.
- **CA-14** (HU-5, RF-05) — error: Dado un nodo compartido conmigo, cuando intento lo que mi nivel no permite (renombrar, mover, eliminar, restaurar, subir dentro de la carpeta, reemplazar, ver su historial de versiones; y, como Editor, compartir, ver accesos o crear enlaces), entonces `404` `STORAGE_NODE_NOT_FOUND` y nada cambia.
- **CA-15** (HU-5, RF-16) Dado un `.docx` compartido como `EDITOR`, cuando lo abro para editar, entonces se crea la sesión (016) y mi nombre figura en los participantes de lo que se guarde; como `VIEWER` se abre solo lectura. Si me revocan con la sesión abierta, en la siguiente verificación (016 CA-16) salgo de la sala y no puedo guardar.
- **CA-16** (HU-5, RF-33) Dado un archivo indexado compartido conmigo, cuando pregunto al agente, entonces puede citarlo (020 CA-5); tras revocarme, la siguiente pregunta ya no lo cita.
- **CA-17** (HU-5, RF-16) Dado un propietario suspendido (011 RN-6), cuando sus destinatarios piden lo compartido, entonces `404`; al reactivarlo, las comparticiones vuelven como estaban sin recrearse.
- **CA-18** (HU-4, RF-18) Dado un nodo compartido, cuando se elimina definitivamente (006), entonces sus comparticiones desaparecen; en la papelera se conservan y vuelven al restaurar.

**Compartidos conmigo y Salir (RF-16; decisión de Adrián, 2026-10-30, 012b P-1)**
- **CA-22** (HU-7, RF-16) Dado accesos directos vigentes conmigo, cuando pido lo compartido conmigo, entonces recibo cada uno con `shareId`, tipo y nombre del nodo, nombre visible del propietario, mi nivel y fecha, más recientes primero, y `[]` si no hay; sin accesos heredados, sin nodos en la papelera ni de propietarios suspendidos; con un rol interno `403` `SHARED_FORBIDDEN`.
- **CA-23** (HU-7, RF-16, 010 RN-6) Dado un acceso directo mío como destinatario, cuando salgo, entonces `204`, desde la siguiente petición recibo `404` sobre el nodo, el propietario ya no me ve en sus accesos y queda auditado; se permite aunque mi cuenta esté en solo lectura. — error: un `shareId` ajeno, inexistente o ya revocado da `404` `SHARING_SHARE_NOT_FOUND`.

**Auditoría, roles y aislamiento (RF-07, RF-05, RNF-05, RNF-17)**
- **CA-19** (HU-1, RF-07, RNF-17) Dado compartir, cambiar nivel o revocar, entonces «Mi actividad» del propietario registra `share.granted`, `share.level_changed` o `share.revoked` con tipo de nodo y nivel, sin nombre de archivo ni correo; los logs tampoco los llevan y la petición conserva su `correlationId`.
- **CA-20** (HU-6, RF-05) Dado un Administrador, Soporte u Operador, cuando llama a cualquiera de las rutas, entonces `403` `SHARED_FORBIDDEN`; sin token, `401` `SHARED_UNAUTHENTICATED`.
- **CA-21** (HU-6, RNF-05) Dado los clientes A, B y C, y A comparte un nodo con B, cuando cada uno consulta, entonces C no alcanza nada de A, B solo alcanza ese nodo (y su subárbol si es carpeta) y A no alcanza nada de B; la base de datos lo niega aunque la consulta olvide filtrar. `pnpm test:isolation` falla ante cualquier fuga.

## 4. Reglas de negocio
- **RN-1** Solo el propietario comparte, ve los accesos y revoca (acciones `SHARE` y `VIEW_ACCESS_LIST` de 003, tabla de niveles de `product-context.md` §2).
- **RN-2** Se asignan `VIEWER` (Lector) y `EDITOR`; `OWNER` nace de la propiedad y no se asigna (DF-31). Una persona tiene a lo sumo un acceso directo por nodo.
- **RN-3** El destinatario es otro cliente verificado y activo, identificado por su correo. No hay invitaciones a correos sin cuenta ni a cuentas internas.
- **RN-4** Compartir una carpeta alcanza todo su subárbol, actual y futuro, por ubicación; el acceso heredado se revoca en la carpeta que lo da. Con varios accesos al mismo nodo manda el nivel más alto.
- **RN-5** Lo compartido sigue siendo del propietario: ocupa su espacio y su plan, y su solo lectura manda sobre lo compartido (010 RN-6, RN-11).
- **RN-6** Revocar, suspender o enviar a la papelera corta el acceso en la siguiente petición; no hay caché de permisos.
- **RN-7** Los planes no limitan cuántas comparticiones tiene una cuenta (el catálogo de `product-context.md` §3 no define un tope).
- **RN-8** Ninguna respuesta revela si un correo tiene cuenta fuera de CA-3, y CA-3 es igual para todos los motivos.

## 5. Seguridad y privacidad
- **Toca datos de un cliente: sí** → pruebas de aislamiento bloqueantes (CA-21) y la revisión del `security-auditor`.
- **Auditoría (RF-07):** CA-19, en la actividad del propietario. **Nunca** en bitácoras ni auditoría: nombres de archivo o carpeta, correos, contenido, URLs firmadas ni claves de objeto.
- **Roles internos:** ninguno comparte, ve comparticiones ni alcanza contenido (CA-20; el fragmento de nodos accesibles les devuelve vacío, 003 CA-9).
- **Enumeración de cuentas:** compartir revela, con un mensaje único, si un correo tiene cuenta. Se acota con el límite de intentos por propietario (CA-7) y solo lo ve quien es dueño de un nodo.
- **Riesgo central:** ampliar los nodos accesibles no debe dar a Editor o Lector las escrituras que hoy asumen propiedad (CA-14).

## 6. Experiencia de usuario
Sin interfaz en esta spec: la pantalla es la 012b. Para el `ui-designer`, estos son los estados que la API alimenta:

| Pantalla (012b) | Mockup | Estado → CA → mensaje clave |
|---|---|---|
| Compartir y accesos (`ui-guidelines.md` §7, fila «Compartir y accesos») | `docs/design/mockups/sharing/compartir/` (Borrador: default) | lista con directos y heredados (CA-8) · compartiendo/éxito (CA-1) · nivel cambiado (CA-5) · destinatario no encontrado (CA-3) · contigo mismo (CA-3) · nivel inválido (CA-2) · nodo no encontrado (CA-4, CA-9) · solo lectura (CA-6) · demasiados intentos (CA-7) · confirmar revocar y revocado (CA-10) · acceso ya inexistente (CA-11) |

- Mensajes clave (código → texto): `SHARING_RECIPIENT_NOT_FOUND` «No encontramos una cuenta de Nimbo con ese correo. Revisa que esté bien escrito o pídele que se registre.» · `SHARING_CANNOT_SHARE_WITH_SELF` «Este elemento ya es tuyo. Escribe el correo de otra persona.» · `SHARING_INVALID_LEVEL` «Elige si la persona puede ver o editar.» · `SHARING_SHARE_NOT_FOUND` «Este acceso ya no existe. Actualiza la lista.»

## 7. Fuera de alcance
- Enlaces públicos (013, RF-17) e invitaciones a correos sin cuenta.
- Avisos al destinatario (correo o en la aplicación) y que el destinatario vea el cambio en su actividad.
- Comparticiones con vencimiento (PD-138). La pantalla «Compartidos conmigo» es de la 012b; su API es CA-22 y CA-23.
- Que Editor o Lector vean el historial de versiones, restauren o reemplacen por carga, o suban a una carpeta compartida (014 RN-7; PD-139 y PD-140).
- Grupos, organizaciones, administración delegada y excepciones de permiso dentro de una carpeta (`product-context.md` §9).
- Transferir la propiedad.

## 8. Supuestos
- **S-1** Se comparten archivos y carpetas (E-R `comparticion` con una FK a `archivo` o a `carpeta`, ADR-0011).
- **S-2** Volver a compartir con la misma persona cambia su nivel; no hay un endpoint aparte de «cambiar nivel».
- **S-3** La lista de accesos de un recurso no se pagina (la define el propietario); si crece, se pagina después.
- **S-4** El límite de intentos de CA-7 es técnico (RNF-07), configurable por entorno; el valor lo fija el plan.
- **S-5** La auditoría es solo del propietario (CA-19); el destinatario no recibe aviso (PD-138).
- **S-6** Revocar no corta una sesión de edición al instante: se detecta en la siguiente verificación (015 P-2, 016 CA-16).
- **S-7** El mockup `sharing/compartir` existe en `Borrador` con el estado `default`; los demás estados los crea `/mockup` en la 012b.
- **S-8** La lista de CA-22 no se pagina (como S-3). Salir se audita como `share.revoked` en la actividad del propietario, sin correo ni nombres (CA-19).

## 9. Preguntas
- [ABIERTA] P-1 ¿El destinatario recibe un aviso (correo o en la aplicación) al compartirle, y ve en su actividad que ganó o perdió un acceso? Sin RF que lo pida; se asume que no (S-5) — bloquea: no
- [ABIERTA] P-2 ¿Se acepta revelar con un mensaje único que un correo tiene o no cuenta (CA-3), acotado por el límite de CA-7, o se prefiere una respuesta neutra que nunca lo diga? Solo cambiaría CA-3 y la 012b — bloquea: no
- [RESUELTA 2026-10-30: sí, Adrián autoriza] P-3 ¿Adrián autoriza a Fátima a cambiar `access`, `storage`, `identity` y `audit` en los archivos que nombra el plan (precedente 011, 2026-10-07/08), o los hace él? Va en el plan §8 — bloquea: no
- [RESUELTA 2026-10-30: entra, Adrián; API en esta spec, pantalla en la 012b] P-4 El «Salir» que la 010 RN-6 permite al destinatario: ¿entra en la 012b o se descarta? — bloquea: no

## 10. Registro de cambios
| Fecha | Cambio | Motivo | Aprobó |
|---|---|---|---|
| 2026-10-30 | Creación en `Borrador` desde cero (sin la rama antigua de 012); partida en 012 (API) y 012b (pantalla) | Más de una pantalla y de 12 archivos | Pendiente (Adrián) |
| 2026-10-30 | CA-22 y CA-23 (listar lo compartido conmigo y salir), HU-7, S-8; P-4 resuelta; plan y tareas con delta mínimo (rutas, política `DELETE` del destinatario, T-11). El plan §8 no se toca | Decisión de Adrián sobre 012b P-1: la vista entra; su API vive en `sharing` | Adrián (decisión); delta del plan por confirmar en el resumen |
| 2026-10-30 | **Propuesta (developer, T-04), sin aplicar:** CA-12 pide que el destinatario «abra la ficha» de un archivo, pero la API no tiene ficha propia: la de la web (`/archivos/archivo/:id`) se alimenta de `GET /files/:id/versions`, que CA-14 y el plan (014 RN-7, PD-139) dejan solo al propietario. Propuesta: una ruta de lectura `GET /files/:fileId` → `{ file: FileSummary, accessLevel }` con `findAccessibleById` (o, alternativa, abrir el historial con solo la versión vigente, que cambia CA-14). Mientras se decide, T-04 entrega contenido, migas, descarga y `accessLevel` en `GET /folders/contents` | Contradicción CA-12 ↔ CA-14 al implementar T-04 | Pendiente (Adrián) |
