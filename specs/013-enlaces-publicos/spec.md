# Spec 013 — Enlaces públicos (API)

> Qué y por qué, en ≤ 150 líneas. El cómo va en `./plan.md` (obligatorio). La pantalla va en la 013b.

| Campo | Valor |
|---|---|
| Estado | Hecha |
| Dueño | Fátima |
| Fase | 2 |
| Requisitos | RF-17, RNF-08; apoyan RF-05, RF-07, RF-09, RF-18, RNF-05, RNF-06, RNF-07, RNF-17 |
| Depende de | 012 (módulo `sharing`); consume lo integrado de 004, 005, 006, 010 y 011 · Hermana: 013b (pantalla) |
| Última actualización | 2026-11-05 |

## 1. Contexto y objetivo
La 012 deja compartir con otros clientes. Esta spec deja que un propietario genere un enlace público a un **archivo**,
con vencimiento obligatorio y contraseña opcional, para que alguien sin cuenta vea su ficha y lo descargue; que lo
revoque o lo reemplace, y que los intentos de adivinar la contraseña se frenen y queden registrados. Entrega solo la API
y la autorización; la sección «Enlace público» del diálogo «Compartir» y la página pública son la 013b.

## 2. Historias de usuario
- **HU-1** Como propietario, quiero generar un enlace público a un archivo con vencimiento y, si quiero, contraseña, para compartirlo con quien no tiene cuenta.
- **HU-2** Como propietario, quiero ver el enlace vigente de un archivo y revocarlo o reemplazarlo, para dejar de compartirlo cuando ya no corresponda.
- **HU-3** Como visitante sin cuenta, quiero ver qué archivo me compartieron y descargarlo, para obtenerlo sin registrarme.
- **HU-4** Como propietario, quiero que nadie adivine la contraseña probando, y saber cuándo se descargó o se bloqueó mi enlace.
- **HU-5** Como equipo, queremos una suite que falle si un enlace da acceso a algo más que su archivo.

## 3. Criterios de aceptación
> Dado/Cuando/Entonces. Los errores de un nodo ajeno son idénticos a los de uno inexistente (003 D-6), igual que 012.

**Generar (RF-17)**
- **CA-1** (HU-1, RF-17) Dado un archivo mío vivo, cuando genero un enlace con vencimiento de 1, 7 o 30 días (7 si no lo indico) y, opcionalmente, una contraseña, entonces `201` con la URL del enlace (la única vez que se entrega), su vencimiento y si tiene contraseña; queda en mi actividad.
- **CA-2** (HU-1, RF-17) — error: Dado un vencimiento que no es 1, 7 ni 30, o una contraseña fuera de la longitud permitida (S-2), cuando genero, entonces `422` `SHARING_INVALID_REQUEST` con `fields` y no se crea nada.
- **CA-3** (HU-1, RF-05) — error: Dado una carpeta, o un archivo ajeno, inexistente, en la papelera o donde soy Editor o Lector, cuando genero, entonces `404` `STORAGE_NODE_NOT_FOUND` y nada cambia (012 CA-14).
- **CA-4** (HU-2, RF-17) Dado un archivo con un enlace sin revocar (vigente o vencido), cuando genero otro, entonces el anterior deja de servir desde la siguiente petición; queda a lo sumo un enlace activo por archivo y mi actividad registra el reemplazo y la creación.
- **CA-5** (HU-1, 010 RN-6) — error: Dado mi cuenta en solo lectura, cuando genero o reemplazo un enlace, entonces `403` `STORAGE_ACCOUNT_READ_ONLY` y nada cambia; revocar sí se permite.
- **CA-6** (HU-1, RNF-07) — error: Dado que superé el límite de intentos de generar enlaces, cuando lo intento otra vez, entonces `429` `SHARED_TOO_MANY_REQUESTS` con la espera.

**Ver y revocar (RF-17, RF-18)**
- **CA-7** (HU-2, RF-18) Dado un archivo mío, cuando pido su enlace, entonces recibo el que no está revocado con vencimiento, si tiene contraseña, estado (`active` o `expired`) y fecha de creación, sin la URL ni el token; `null` si no tiene. Ajeno, inexistente, en la papelera o como Editor o Lector: `404` `STORAGE_NODE_NOT_FOUND`.
- **CA-8** (HU-2, RF-17) Dado un enlace mío sin revocar, aunque el archivo esté en la papelera, cuando lo revoco, entonces `204`, desde la siguiente petición deja de servir y queda en mi actividad. — error: ajeno, inexistente o ya revocado da `404` `SHARING_LINK_NOT_FOUND`.

**Lo que alcanza el visitante (RF-17, RF-09, RNF-06)**
- **CA-9** (HU-3, RF-17) Dado un enlace disponible, cuando un visitante sin sesión lo abre, entonces ve la ficha: nombre y tamaño del archivo, nombre visible de quien lo compartió, vencimiento y si pide contraseña; nada más (ni ids, ni carpeta, ni correo, ni otros archivos).
- **CA-10** (HU-3, RF-09, RNF-06) Dado un enlace disponible sin contraseña, o con la contraseña correcta, cuando el visitante pide descargar, entonces recibe una URL de 5 minutos a la versión vigente de ese archivo, con descarga forzada; la actividad del propietario registra la descarga.
- **CA-11** (HU-3, RF-17, 011 RN-6) — error: Dado un token inexistente, mal formado, revocado, reemplazado o vencido, un archivo en la papelera o un propietario suspendido, cuando el visitante abre o descarga, entonces `404` `SHARING_LINK_UNAVAILABLE` con el mismo cuerpo en todos los casos (P-1). Al restaurar el archivo o reactivar al propietario vuelve a servir si no venció; con la eliminación definitiva desaparece.
- **CA-12** (HU-4, RNF-08) — error: Dado un enlace con contraseña, cuando el visitante descarga sin ella o con una incorrecta, entonces `403` `SHARING_LINK_PASSWORD_INVALID` y no recibe URL. Sin contraseña (ausente o vacía, `""`), el intento no cuenta para el bloqueo ni se registra; una contraseña incorrecta cuenta y queda en la bitácora técnica (`password_failed`), sin la contraseña ni la IP.
- **CA-13** (HU-4, RNF-08, RNF-07) — error: Dado que desde una IP se fallaron N contraseñas de un enlace en la ventana (S-1), cuando vuelve a intentar con ese enlace, entonces `429` `SHARED_TOO_MANY_REQUESTS` con la espera, aunque la contraseña sea correcta; otra IP sigue pudiendo, tras la espera se vuelve a intentar, y el bloqueo queda una vez en la actividad del propietario. Igual `429` si una IP supera el límite general de las rutas públicas.
- **CA-14** (HU-3, 010 RN-6) Dado el propietario en solo lectura, cuando el visitante abre o descarga, entonces el enlace sigue sirviendo (descargar es lectura).

**Auditoría, roles y aislamiento (RF-07, RF-05, RNF-05, RNF-17)**
- **CA-15** (HU-4, RF-07, RNF-17) Dado generar, revocar o reemplazar, una descarga o un bloqueo, entonces «Mi actividad» del propietario registra `public_link.created`, `public_link.revoked` (motivo `revoked` o `replaced`), `public_link.downloaded` o `public_link.locked` sobre el archivo; las líneas de negocio y la auditoría no llevan token, contraseña, IP, nombre de archivo ni correo (como 002 CA-18), y cada línea lleva su `correlationId`. La línea técnica de acceso `http.request` (de `shared`) conserva la IP como en todas las rutas, para investigar abusos (RNF-08).
- **CA-16** (HU-5, RF-05) Dado un Administrador, Soporte u Operador, cuando llama a generar, ver o revocar, entonces `403` `SHARED_FORBIDDEN`; sin token, `401` `SHARED_UNAUTHENTICATED`. Las rutas del visitante no usan la sesión: con o sin ella responden igual.
- **CA-17** (HU-5, RNF-05) Dado los clientes A, B y C, y A genera un enlace a un archivo, cuando B, C o un anónimo usan ese token, entonces solo alcanzan la ficha y la versión vigente de ese archivo; ningún token da otro archivo, una carpeta ni versiones anteriores; B no ve ni revoca enlaces de A; la base de datos lo niega aunque la consulta olvide filtrar. Las rutas del visitante aceptan solo el token y la contraseña: un id en el cuerpo (de otro archivo de A, por ejemplo) da el `404` de CA-11 y nunca lo alcanza. `pnpm test:isolation` falla ante cualquier fuga.
- **CA-18** (HU-4, RF-07) Dado una descarga o un bloqueo de un visitante, cuando el propietario mira «Mi actividad», entonces `public_link.downloaded` y `public_link.locked` salen con `trigger` `public_link`, para que la 013b los muestre como «Alguien con el enlace» y no como acciones suyas.

## 4. Reglas de negocio
- **RN-1** Solo el propietario genera, ve y revoca (acción `CREATE_PUBLIC_LINK` de 003; `product-context.md` §2: Editor y Lector no crean enlaces).
- **RN-2** Solo archivos. Vencimiento obligatorio de 1, 7 o 30 días desde que se genera (7 por omisión); contraseña opcional (RF-17).
- **RN-3** Un enlace activo por archivo: generar uno nuevo revoca el anterior. La URL con el token se entrega solo al generarlo; Nimbo guarda su hash y no puede volver a mostrarla (DF-09): para volver a compartirla se genera otra.
- **RN-4** El visitante ve la ficha y descarga la versión vigente al momento de pedirla; no navega, no ve versiones, accesos ni vista previa (`product-context.md` §2, fila «Enlace público»).
- **RN-5** Un enlace está disponible si no está revocado ni vencido, el archivo está vivo y la cuenta propietaria está activa. Papelera y suspensión lo pausan sin borrarlo (011 RN-6, igual que 012 CA-17 y CA-18); la eliminación definitiva lo borra.
- **RN-6** Con la cuenta propietaria en solo lectura no se genera ni se reemplaza; se revoca y el enlace sigue sirviendo (010 RN-6).
- **RN-7** El bloqueo por contraseñas fallidas es por enlace e IP: no inhabilita el enlace para otros visitantes. La IP de los límites cuenta por red (/32 en IPv4, /64 en IPv6), así rotar direcciones dentro de un /64 no lo evade.
- **RN-8** La contraseña del enlace se guarda solo como hash (DF-10, RNF-04); nunca se devuelve ni se registra.

## 5. Seguridad y privacidad
- **Toca datos de un cliente: sí** → pruebas de aislamiento bloqueantes (CA-17) y revisión del `security-auditor` (CLAUDE.md, 013).
- **Riesgo central:** el visitante no tiene sesión y la base niega todo sin actor. El camino del token al archivo es explícito, mínimo y probado (plan §1, ADR-0039 propuesto).
- **Indistinguibilidad (CA-11):** ninguna respuesta pública dice si un token existió, se revocó, venció, está en la papelera o es de una cuenta suspendida. El token tiene 256 bits: no se enumera.
- **El token** viaja solo en la URL entregada al propietario, en el fragmento (`#`), y del navegador a la API en el cuerpo: no llega a rutas, cadenas de consulta, `Referer` ni bitácoras. Respuestas públicas con `Cache-Control: no-store` y `Referrer-Policy: no-referrer`.
- **Auditoría (RF-07):** CA-15 y CA-18, en la actividad del propietario. Los fallos sueltos no van a la auditoría: solo a la bitácora técnica `password_failed` (RNF-08), sin contraseña, token ni IP; el bloqueo sí (`public_link.locked`).
- **Roles internos:** no generan, ven ni revocan (CA-16). Si un interno recibe un enlace, es un visitante más por decisión explícita del propietario (Art. IX.1): la ruta pública no lee su sesión.
- **La ficha se ve sin contraseña** (S-7): quien tiene el token ve nombre y tamaño; la contraseña protege la descarga.

## 6. Experiencia de usuario
Sin interfaz en esta spec: la pantalla es la 013b. Para el `ui-designer`, estos son los estados que la API alimenta:

| Pantalla (013b) | Mockup | Estado → CA |
|---|---|---|
| Sección «Enlace público» del diálogo Compartir (`ui-guidelines.md` §7, fila «Enlace público») | `docs/design/mockups/sharing/compartir/` | sin enlace (CA-7) · generando/generado con «Copiar» una sola vez (CA-1) · vigente con o sin contraseña (CA-7) · vencido (CA-7) · reemplazar (CA-4) · confirmar revocar y revocado (CA-8) · validación (CA-2) · solo lectura (CA-5) · demasiados intentos (CA-6) · enlace ya inexistente (CA-8) |
| Página pública | `docs/design/mockups/sharing/enlace-publico/` (Borrador: con-contrasena) | ficha sin contraseña (CA-9) · requiere contraseña (CA-9) · contraseña incorrecta (CA-12) · bloqueado con espera (CA-13) · descargando (CA-10) · no disponible (CA-11; incluye «Expirado» y «Revocado» si P-1 queda como se recomienda) |

- Mensajes clave (código → texto): `SHARING_LINK_UNAVAILABLE` «Este enlace ya no está disponible. Pide a quien te lo compartió uno nuevo.» · `SHARING_LINK_PASSWORD_INVALID` «La contraseña no es correcta. Revísala y vuelve a intentarlo.» · `SHARING_LINK_NOT_FOUND` «Este enlace ya no existe. Actualiza para ver el estado actual.» · `SHARED_TOO_MANY_REQUESTS` «Hiciste demasiados intentos. Espera {n} minutos y vuelve a intentarlo.»
- Para 013b y `/mockup`: el mockup de `compartir` dice «exige clave»; manda RF-17 (contraseña opcional). El estado «Archivo abierto» (vista previa) no entra (017). «Te quedan 4 intentos» depende de P-3.

## 7. Fuera de alcance
- Enlaces a carpetas, varios enlaces por archivo, cambiar vencimiento o contraseña de un enlace existente (se genera otro: S-6).
- Vista previa en la página pública (017) y descargar versiones anteriores.
- Lista de «todos mis enlaces», contador de descargas, avisos por correo al propietario.
- Una tabla de intentos fallidos (el bloqueo vive en Redis).
- La pantalla (013b).

## 8. Supuestos
- **S-1** Los límites son técnicos (RNF-07, RNF-08) y configurables por entorno, como 012 S-4; el plan fija los valores (por omisión, 5 fallos en 15 min por enlace e IP y 15 min de espera, como el inicio de sesión de 002 D-5).
- **S-2** La contraseña del enlace mide de 8 a 128 caracteres, sin la política de complejidad de la cuenta (P-2).
- **S-3** Ninguna tabla guarda la IP ni su red: el bloqueo y el límite viven en Redis, con el hash de la red (RN-7), y caducan con la ventana.
- **S-4** El vencimiento se cuenta en horas exactas desde la creación (1, 7 o 30 × 24 h) con el reloj del servidor.
- **S-5** Si el propietario sube una versión nueva, el enlace sirve la nueva (RN-4).
- **S-6** Para cambiar la contraseña o el vencimiento se genera un enlace nuevo (CA-4).
- **S-7** La ficha (CA-9) no pide contraseña (decisión de Fátima, 2026-10-30); el mockup la muestra junto al campo de contraseña.
- **S-8** Generar enlaces tiene su propio límite por propietario, con el mismo valor que compartir (012 CA-7).

## 9. Preguntas
- [RESUELTA 2026-10-30: recomendación aceptada, Fátima] P-1 ¿El visitante distingue «vencido» de «no disponible»? Recomendación: no; un único `SHARING_LINK_UNAVAILABLE` (no revela que el token existió ni su fecha) y la 013b funde «Expirado» y «Revocado» del mockup en «No disponible». Si se decide que sí, solo cambia CA-11 y un código — bloquea: no
- [RESUELTA 2026-10-30: recomendación aceptada, Fátima] P-2 ¿Longitud de la contraseña del enlace? Recomendación: 8 a 128 caracteres, sin mayúscula, número ni símbolo obligatorios (la comparte el propietario de palabra; el bloqueo de CA-13 frena la fuerza bruta). Se construye con S-2 — bloquea: no
- [RESUELTA 2026-10-30: recomendación aceptada, Fátima] P-3 ¿La respuesta a una contraseña incorrecta dice cuántos intentos quedan (el mockup muestra «Te quedan 4 intentos»)? Recomendación: no (revela el umbral y no lo pide RF-17); la 013b ajusta el mockup — bloquea: no
- [RESUELTA 2026-10-31: autorizada por Adrián en PR #87, plan §8] P-4 ¿Adrián autoriza a Fátima a cambiar `shared`, `identity`, `storage` y `audit` en los archivos que nombra el plan §8 (precedente 012 P-3), o los hace él? — bloquea: no

## 10. Registro de cambios
| Fecha | Cambio | Motivo | Aprobó |
|---|---|---|---|
| 2026-10-30 | Creación en `Borrador` con plan y tareas (ADR-0034); partida en 013 (API) y 013b (pantalla) | Decisiones de producto de Fátima (archivos, contraseña opcional, vencimiento 1/7/30, un enlace activo, ficha y descarga, bloqueo por enlace e IP, actividad); más de una pantalla | Pendiente (Adrián) |
| 2026-10-30 | Correcciones de la revisión de documentos (B-1, I-1…I-5, S-1…S-13): CA-8 revoca en la papelera, CA-15 acota bitácoras (IP solo en `http.request`), RN-7 cuenta la IP por red, §5 fallos sueltos fuera de la auditoría | Revisión de documentos; I-1 y S-11 decididos por Fátima | Pendiente (Adrián) |
| 2026-10-31 | Auditoría de Adrián en PR #87 (M-1…M-4, m-1…m-4, m-6): CA-12 aclara qué cuenta, CA-17 sin ids en el cuerpo, CA-18 nuevo (`trigger` `public_link`), S-3 sin tabla de intentos | Decisiones de Fátima sobre la auditoría | Pendiente (Adrián) |
| 2026-10-31 | Segunda revisión de Adrián en PR #87 (N-1, N-3, n-1): merge de `main` (011b y 018); el pendiente del token opaco pasa a PD-155 y se quita el de la tabla de intentos (PD-145 y PD-146 ya eran de la 018); ADR-0010 sin `intento_acceso` | Choque de numeración con la 018 | Pendiente (Adrián) |
| 2026-10-31 | Pasa a `Lista`: plan y ADR-0039 aprobados | Acuerdo de Adrián en PR #87, con la condición de que el actor derivado del dueño solo exista dentro de `PublicLinkAccessService` y que las acciones del visitante se sigan distinguiendo como tales (`trigger: 'public_link'`, CA-18) | Adrián |
| 2026-10-31 | CA-12: una contraseña vacía (`""`) cuenta como ausente (`403`, no cuenta ni se registra) | Implementación de T-02: el cuerpo acepta `password` como texto libre; el campo vacío del formulario no debe gastar intentos | Fátima |
| 2026-11-03 | P-4 marcada resuelta; PD-156 de la 013 renumerado a PD-174 (choque con el PD-156 de la 021); PD-175 y PD-176 abiertos | Revisión final (`review.md`: I-2, SEC-4, S-1, S-2) | Fátima |
| 2026-11-04 | `consumeOrThrow` en `shared` para los límites de `sharing`, prueba de arquitectura del actor derivado y PD-177 (separar la política de contraseña y bloqueo) | Auditoría de Adrián en el PR #93 (M-2, M-3, M-6, m-1, m-4) | Fátima |
| 2026-11-05 | Estado «Hecha»; DF-90 aceptado; PD-175 planificado antes de exponer la API (dueña: Fátima) | Squash merge del PR #93 (`f3f487f0`) y decisiones de Adrián en el PR | Adrián |
