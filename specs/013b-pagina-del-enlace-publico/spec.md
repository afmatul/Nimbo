# Spec 013b — Página del enlace público (web) y techo global de fallos

> Qué y por qué, en ≤ 150 líneas. El cómo va en `./plan.md` (obligatorio). La sección del diálogo es la 013c.

| Campo | Valor |
|---|---|
| Estado | Hecha |
| Dueño | Fátima |
| Fase | 2 |
| Requisitos | RF-17, RNF-08, RNF-13, RNF-14; apoyan RF-07, RNF-05, RNF-07 |
| Depende de | 013 (API integrada, PR #93; PD-177 en PR #98) · Hermana: 013c (sección «Enlace público» del diálogo) |
| Última actualización | 2026-11-08 |

## 1. Contexto y objetivo
La 013 dejó la API del enlace público: quien recibe `…/enlace#<token>` hoy llega a una ruta que no existe. Esta spec
entrega la página pública donde un visitante sin cuenta ve la ficha del archivo y lo descarga, con contraseña si el
enlace la pide. Antes de exponer esa API fuera de local resuelve PD-175: un techo global de fallos de contraseña por
enlace, para que muchas redes juntas no puedan probar contraseñas sin fin (SEC-4 de la revisión de 013). También
corrige el texto de ayuda de la contraseña (S-3 de 013). La sección del diálogo «Compartir» es la 013c.

## 2. Historias de usuario
- **HU-1** Como visitante sin cuenta, quiero abrir el enlace y ver qué archivo me compartieron y quién, para decidir si lo descargo.
- **HU-2** Como visitante, quiero descargar el archivo escribiendo la contraseña si el enlace la pide, y saber qué hacer si algo falla.
- **HU-3** Como propietario, quiero que nadie adivine la contraseña de mi enlace aunque pruebe desde muchas redes, y enterarme si pasa.

## 3. Criterios de aceptación
> Dado/Cuando/Entonces. «Visitante» = cualquiera que abre `/enlace#<token>`, con o sin sesión (013 CA-16).

**Página pública (RF-17, RNF-13, RNF-14)**
- **CA-1** (HU-1, RF-17, RNF-14) Dado un enlace disponible sin contraseña, cuando el visitante abre la página, entonces ve primero un indicador de carga y luego «<Nombre visible> compartió un archivo contigo», el ícono del tipo, el nombre, el tamaño («2,4 MB»), «Vence el 14 nov 2026, 14:30» (fecha absoluta y hora de Guatemala) y «Descargar»; nada más (013 CA-9).
- **CA-2** (HU-1, RF-17) Dado un enlace con contraseña, cuando el visitante abre la página, entonces ve la misma ficha sin escribir nada (013 S-7) y, antes de «Descargar», el campo «Contraseña del enlace» con la ayuda «No es la de tu cuenta: te la da quien compartió el enlace.» asociada al campo.
- **CA-3** (HU-2, RF-17, RNF-14) Dado la ficha, sin contraseña o con la correcta, cuando pulsa «Descargar», entonces la descarga empieza en la misma pestaña (URL de 5 minutos, 013 CA-10). Si tarda más de 2 s, el botón dice «Preparando descarga…» y no acepta otro clic. Después se anuncia el aviso de éxito «Tu descarga comenzó. Si no empieza, vuelve a intentarlo.» y el botón vuelve a estar disponible.
- **CA-4** (HU-2, RNF-08) — error: Dado una contraseña incorrecta, cuando descarga, entonces ve «La contraseña no es correcta. Revísala y vuelve a intentarlo.», sin decir cuántos intentos quedan (013 P-3), con el campo vacío, marcado como inválido y con el foco. Con el campo vacío, «Escribe la contraseña del enlace.» y no se envía nada.
- **CA-5** (HU-2, RNF-07, RNF-08) — error: Dado un `429` al descargar (bloqueo por red, techo global o límite general), entonces ve un aviso que se anuncia «Hubo demasiados intentos con este enlace. Espera {n} minutos e inténtalo de nuevo.», con {n} de la espera de la API, sin decir cuál de los tres motivos fue (RN-1), sin cuenta regresiva, con la ficha visible y con el campo de contraseña vacío. Un `429` al abrir muestra el mismo texto en lugar de la ficha, con «Reintentar».
- **CA-6** (HU-1, RF-17) — error: Dado un token inexistente, mal formado, revocado, reemplazado o vencido, un archivo en la papelera, un propietario suspendido, un fragmento vacío (sin llamar a la API) o un `404` al descargar, entonces el visitante ve solo «Este enlace ya no está disponible. Pide a quien te lo compartió uno nuevo.», sin ficha ni motivo (013 CA-11, P-1).
- **CA-7** (HU-2, RNF-14) — error: Dado que la red falla o la API responde 5xx, cuando abre, entonces ve «No pudimos cargar el archivo compartido. Revisa tu conexión e inténtalo de nuevo.» con «Reintentar», distinto de CA-6. Si pasa al descargar, ve sobre la ficha, que se mantiene, un aviso con el diseño de «bloqueado» que dice «No pudimos iniciar la descarga. Revisa tu conexión e inténtalo de nuevo.», con «Reintentar».
- **CA-8** (HU-1, RF-17) Dado la página abierta, cuando el visitante recarga, entonces vuelve a ver la ficha: el token sigue en el fragmento de la barra. El token nunca va en la ruta, en la consulta, en el título ni en una petición a `web`, y el título de la pestaña es «Archivo compartido · Nimbo» (sin el nombre del archivo).
- **CA-9** (HU-1, RNF-07, RNF-08) Dado cualquier petición de la página, entonces sale del navegador directo a la API pública (`API_PUBLIC_URL`, por Traefik), sin cookies ni `Authorization`. Ningún servidor de `web` la reenvía, así el límite por red cuenta la red de cada visitante (SEC-6 de 013).
- **CA-10** (HU-1, 013 CA-16) Dado un visitante con sesión de cliente o de un rol interno, cuando abre el enlace, entonces la página se ve y responde igual que sin sesión, y nada se agrega a su cuenta.
- **CA-11** (HU-1, RNF-13) Dado la página en cualquiera de sus estados (§6), entonces axe no da violaciones y los errores se anuncian; además se usa sin desplazamiento horizontal a 360 px, cumple el contraste AA a 360 y 1440 px y la animación respeta «reducir movimiento». Axe en jsdom no evalúa el viewport ni el contraste: esa parte se verifica a mano (T-09) y en los mockups (T-05).

**Techo global de fallos por enlace (PD-175, RNF-08)**
- **CA-12** (HU-3, RNF-08) — error: Dado que un enlace acumuló en la última hora el techo de contraseñas incorrectas (100 por omisión) sumando todas las redes, cuando cualquiera intenta descargar, entonces recibe `429` `SHARED_TOO_MANY_REQUESTS` con la espera, aunque la contraseña sea correcta, falte o venga de una red nueva, durante 60 minutos desde que se activó.
- **CA-13** (HU-3, RF-17) Dado el techo activo, entonces el enlace no se revoca ni cambia, la ficha se sigue abriendo y, pasada la espera, se vuelve a descargar. Un acierto antes de llegar al techo no reinicia la cuenta. El bloqueo por enlace y red de 013 CA-13 sigue igual.
- **CA-14** (HU-3, RF-07) Dado el intento que activa el techo, entonces «Mi actividad» del propietario registra `public_link.locked` una sola vez, con `trigger` `public_link` (como 013 CA-13 y CA-18), también con fallos simultáneos y aunque en ese mismo intento se active el bloqueo por red. Ni la bitácora ni la auditoría llevan token, contraseña ni IP.
- **CA-15** (HU-3, RNF-05) Dado el techo activo en un enlace de A, entonces otro enlace de A, uno de B y uno sin contraseña siguen sirviendo. Los enlaces sin contraseña nunca cuentan fallos.

**Texto de ayuda (S-3 de 013)**
- **CA-16** (HU-3, RF-17) — error: Dado una contraseña de menos de 8 o más de 128 caracteres al generar un enlace, entonces el `422` de 013 CA-2 dice «Escribe una contraseña de 8 a 128 caracteres.», sin «o deja el campo vacío» (`""` sigue rechazado; el formulario de 013c omite el campo).

## 4. Reglas de negocio
- **RN-1** Un solo «No disponible» para todo motivo y un solo texto de `429`; nunca se dicen el motivo ni los intentos restantes (013 P-1, P-3). Los minutos de espera del `429` salen de la API (CA-5) y pueden variar según el motivo; eso se acepta porque no da acceso ni dice cuántos intentos quedan (SEC-7 de la revisión, pendiente de que Adrián lo confirme).
- **RN-2** La ficha no pide contraseña: la contraseña protege la descarga (013 S-7).
- **RN-3** Techo global por enlace: suma los fallos de todas las redes en una ventana móvil de 60 minutos. Al llegar al techo, `429` para todos durante 60 minutos. No inhabilita el enlace, un acierto no lo reinicia y convive con el bloqueo por enlace y red (013 RN-7).
- **RN-4** La página no usa la sesión: todos los visitantes son iguales (013 CA-16).

## 5. Seguridad y privacidad
- **Toca datos de un cliente: sí** (la ficha y el archivo del propietario) → aislamiento de CA-15 sumado a la suite de 013 (`public-links.iso-spec.ts`).
- **Token:** solo en el fragmento. No va en rutas ni consultas, y tampoco en el `Referer` (el fragmento nunca viaja), en el título, en el almacenamiento del navegador ni en bitácoras. `web` no lo recibe (CA-8, CA-9).
- **SEC-6:** el navegador llama a la API por Traefik, así cada visitante gasta su propio límite. La configuración de Traefik de staging queda para la 022 y la 000 (§7).
- **Auditoría (RF-07):** CA-14 reutiliza `public_link.locked`; los fallos sueltos siguen solo en la bitácora `password_failed` (013 §5). Nada nuevo con IP.
- **Roles internos:** no hay ruta propia; con sesión son visitantes y la página no la lee (CA-10, Art. IX.1).
- **Indexación:** la página no se indexa en buscadores (S-5).

## 6. Experiencia de usuario
| Pantalla | Mockup | Estados requeridos | Estado del mockup |
|---|---|---|---|
| Página pública `/enlace` (`ui-guidelines.md` §7, fila «Enlace público (página)») | `docs/design/mockups/sharing/enlace-publico/` | cargando (CA-1) · sin-contrasena (CA-1) · con-contrasena (CA-2) · contrasena-incorrecta (CA-4) · bloqueado (CA-5, CA-12) · descargando (CA-3) · descarga-iniciada (CA-3) · no-disponible (CA-6) · error-carga (CA-7; el `429` al abrir usa este diseño en tono de advertencia) | Aprobado (Adrián, 2026-11-07, T-05): 11 HTML y 22 PNG (360 y 1440 px), generados con `_generadores/enlace-publico/generar.js`: los 9 estados más dos variantes con HTML propio, error-carga-limite (el `429` al abrir, con el diseño de error-carga en tono de advertencia) y descarga-error-red (la red falla al descargar: aviso de advertencia sobre la ficha con «Reintentar», CA-7). Axe sin violaciones y sin desplazamiento horizontal a 360 px. El HTML anterior pasa a `enlace-publico--propuesta.html` |

- Mensajes clave: los de CA-4 a CA-7 y CA-16. El `429` usa el texto neutro propio de la página de CA-5, no el genérico «Hiciste demasiados intentos…». Botón «Descargar»; campo «Contraseña del enlace».
- Correcciones al mockup actual: «Ver archivo» → «Descargar»; «clave» → «contraseña». El README dice que pide la clave antes de mostrar el archivo, y no es así (S-7). Lleva la cabecera pública real (Planes / Iniciar sesión) y el color del botón corregido (DF-41). «Expirado» y «Revocado» pasan a no-disponible. La fila de §7 se parte en «Enlace público (página)» (esta spec) y «Enlace público (diálogo)» (013c).

## 7. Fuera de alcance
- La sección «Enlace público» del diálogo «Compartir» y «Alguien con el enlace» en «Mi actividad» (013 CA-18): 013c.
- Vista previa en la página (017), cuenta regresiva del bloqueo, contar IPv6 por /48 (alternativa descartada de PD-175).
- Configurar Traefik y los puertos de staging (022 y 000, bloque 6).

## 8. Supuestos
- **S-1** El `#token` se queda en la barra y recargar vuelve a abrir la ficha (decisión de Fátima, 2026-11-06).
- **S-2** El techo es configurable por entorno (100 por omisión); la ventana y la espera son 60 minutos fijos. Con peticiones simultáneas puede pasar un poco de 100: se acepta como aproximado (decisión de Fátima, 2026-11-06).
- **S-3** La descarga abre la URL firmada en la misma pestaña, con el patrón de 005 y 014 («Preparando…» pasados 2 s).
- **S-4** La fecha de vencimiento es siempre absoluta, con fecha y hora de Guatemala («14 nov 2026, 14:30»), nunca «hoy» ni «ayer».
- **S-5** La página declara `noindex` para buscadores.
- **S-6** La página usa la cabecera y el marco públicos que ya existen (`(public)/layout.tsx`).

## 9. Preguntas
- [RESUELTA 2026-11-06, Fátima] P-1 ¿Se parte la 013b? → Sí: 013b = página pública + PD-175 + S-3; 013c = sección del diálogo.
- [RESUELTA 2026-11-06, Fátima] P-2 ¿El token se borra de la barra al abrir? → No (S-1).
- [RESUELTA 2026-11-06, Fátima] P-3 ¿El techo se audita, cuánto dura y un acierto lo reinicia? → Una vez `public_link.locked`, 60 minutos, no lo reinicia (CA-12 a CA-14).
- [RESUELTA 2026-11-06, Fátima] P-4 ¿Mockup o patrones existentes? → Mockup de los 9 estados con `/mockup` (T-05).
- [RESUELTA 2026-11-07, Adrián] P-A, P-B y P-C: autorizaciones sobre `shared`, `PasswordField`, `storage` y `lib` → Sí a las tres; en P-B, opción (a) (detalle en plan §7)

## 10. Registro de cambios
| Fecha | Cambio | Motivo | Aprobó |
|---|---|---|---|
| 2026-11-06 | Creación en `Borrador` con plan y tareas (ADR-0034); 013b partida en 013b (página + PD-175 + S-3) y 013c (diálogo) | Más de 12 archivos y dos pantallas (`workflow.md` §4.1); decisiones de Fátima | Pendiente (Adrián) |
| 2026-11-06 | Revisión de documentos: CA-1 fecha absoluta, CA-3 texto de éxito, CA-6 fragmento vacío sin API, CA-7 diseño de «bloqueado», CA-12 sin contraseña también `429`, CA-14 con fallos simultáneos; P-A a P-C | Revisión del `reviewer` (B-1, I-1, I-5, S-2, S-4, S-8, S-9); decisiones de Fátima | Pendiente (Adrián) |
| 2026-11-07 | Auditoría de Adrián en el PR #100 (85 %; M-1 a M-3, m-1 a m-7): CA-5 con texto de `429` neutro propio (M-2), CA-11 separa lo que mide axe de lo que se verifica a mano (m-6), tareas renumeradas (T-01 a T-03 en PR-A, T-04 a T-09 en PR-B) | Auditoría de Adrián; decisiones de Fátima (M-3, m-4, m-5, m-7) | Pendiente (Adrián) |
| 2026-11-07 | Adrián aceptó pasar de los 12 archivos de `workflow.md` §4.1 (PR #100, 2026-11-06); dos PR | M-1: sin PR `refactor(web)` aparte; el refactor de `storage` (T-04) va en PR-B | Adrián |
| 2026-11-07 | Plan aprobado (95 %); la spec pasa a `Lista`. P-A, P-B (a) y P-C resueltas; N-1 a N-3 en plan y tareas, y PD-188 por la copia de `openInBrowser` en `billing` | Aprobación de Adrián en el PR #100 | Adrián |
| 2026-11-07 | Mockup de T-05 (11 HTML, 22 PNG): CA-2 con la ayuda bajo el campo, CA-5 con el campo vacío tras el `429`, CA-7 con texto propio para la red al descargar; variantes `error-carga-limite` y `descarga-error-red`; borde de «Reintentar» `outline` con 3:1 sobre advertencia y error (PD-189) | Dudas D-1 a D-4 del `ui-designer`; decisiones de Fátima | Adrián (2026-11-07, a Fátima en privado) |
| 2026-11-07 | Pasa a `En revisión` con `review.md` (✅, sin bloqueantes); RN-1 aclara que la neutralidad del `429` cubre el texto y no los minutos (SEC-7) | Revisión de cierre (`reviewer` y `security-auditor`); decisiones de Fátima | Pendiente (Adrián) |
