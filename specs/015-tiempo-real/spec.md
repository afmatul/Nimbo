# Spec 015 — Tiempo real

> Qué y por qué, en ≤ 150 líneas. El cómo va en `./plan.md` (obligatorio).

| Campo | Valor |
|---|---|
| Estado | En curso |
| Dueño | Adrián (desde 2026-10-15; su plan y su PR siguen `workflow.md` §7.1) |
| Fase | 2 |
| Requisitos | RF-26 (canal para la presencia de 016); RNF-05, RNF-07, RNF-09, RNF-17. RF-08 no: lo cubre solo 005 (DF-58, P-7) |
| Depende de | 002 (token de acceso, D-1 y D-14), 003 (`Actor`, códigos `SHARED_*`) |
| La necesita | 016 (presencia y avisos de edición, `architecture.md` §7.2 pasos 2 y 6) |
| DF / PD | DF-30 y ADR-0010 (gateway único, salas por usuario y por documento, `realtime` no conoce permisos); DF-58; PD-03 |
| Última actualización | 2026-10-15 |

## 1. Contexto y objetivo
Nimbo necesita avisar al navegador de cambios que ocurren en el servidor sin que el usuario recargue: primero la
presencia de coeditores de un `.docx` (RF-26, spec 016). Hoy no existe ese canal. Esta spec entrega un **canal en vivo
único y autenticado** por pestaña, con dos destinos posibles, el usuario y el documento, y la garantía de que un aviso
solo llega a quien tiene derecho a recibirlo. No define eventos de negocio: cada spec productora (016 primero) define
los suyos y quién puede entrar a la sala de un documento.

## 2. Historias de usuario
- **HU-1** Como cliente, quiero que mi navegador mantenga un canal en vivo con Nimbo, para ver cambios hechos por otros sin recargar.
- **HU-2** Como cliente que coedita, quiero que los avisos de un documento solo lleguen a quien tiene acceso a él, para que nada de mi trabajo se filtre.
- **HU-3** Como cliente con conexión inestable, quiero que el canal se recupere solo, para no perder la sesión de trabajo.
- **HU-4** Como dueño de un módulo productor (016), quiero un único canal autorizado para avisar a un usuario o a los participantes de un documento, para no construir uno propio.

## 3. Criterios de aceptación
- **CA-1** (HU-1, RF-26) Dado un cliente con token de acceso vigente, cuando abre el canal con ese token, entonces queda conectado y unido solo a su propia sala de usuario.
- **CA-2** (HU-1, RNF-05) — error: Dado un intento sin token, con token inválido o vencido, cuando abre el canal, entonces se rechaza con `SHARED_UNAUTHENTICATED` y no queda unido a ninguna sala.
- **CA-3** (HU-1, RF-05) — error: Dado un Administrador, Soporte u Operador con token vigente, cuando abre el canal, entonces se rechaza con `SHARED_FORBIDDEN`.
- **CA-4** (HU-1, RNF-05) Dado un canal abierto, cuando vence el token con que se abrió, entonces el servidor lo cierra con `SHARED_UNAUTHENTICATED`; el cliente lo reabre con un token renovado sin intervención del usuario.
- **CA-5** (HU-4, RF-26) Dado un cliente con el canal abierto en dos pestañas o dispositivos, cuando el servidor emite un aviso a ese usuario, entonces cada conexión lo recibe una vez.
- **CA-6** (HU-2, HU-4, RF-26) Dado que el módulo dueño admitió la conexión de A en la sala del documento D, cuando se emite un aviso a D, entonces lo reciben todas las conexiones admitidas en D y ninguna otra.
- **CA-7** (HU-2, RNF-05) — error: Dado un cliente conectado, cuando pide por su cuenta entrar a la sala de otro usuario o a la de un documento, entonces se responde `SHARED_FORBIDDEN`, no se une y no recibe avisos de esa sala.
- **CA-8** (HU-2, RF-26) Dado A admitido en la sala de D, cuando el módulo dueño lo retira (p. ej., se revocó su acceso), entonces A deja de recibir avisos de D desde ese momento.
- **CA-9** (HU-4, RF-26) Dado A admitido en la sala de D, cuando su conexión se cierra limpiamente (pestaña, vencimiento), entonces el módulo dueño de D recibe aviso de su salida; y si se cae sin cerrar (red cortada), lo recibe en ≤ 60 s (RN-9).
- **CA-10** (HU-2, RNF-05, aislamiento) Dados los clientes A y B conectados a la vez, con documentos de contenido casi idéntico y A admitido en la sala de su documento D, cuando se emiten avisos a A y a D, entonces B no recibe ninguno, ni siquiera abriendo varias conexiones o pidiendo entrar a esas salas.
- **CA-11** (HU-3, RF-26) Dado un canal abierto, cuando la red se corta y vuelve, entonces el cliente reconecta solo, vuelve a su sala de usuario y queda fuera de las salas de documento hasta que el módulo dueño lo readmita; los avisos emitidos durante el corte no se reenvían.
- **CA-12** (RNF-09) Dado que el canal en vivo no está disponible, cuando un cliente carga, descarga o navega, entonces la operación responde igual que sin canal y no espera al aviso.
- **CA-13** (RNF-17) Dada una conexión aceptada, rechazada o cerrada, cuando se consulta la bitácora, entonces hay una línea con `correlationId`, id de usuario y motivo, y ninguna contiene token, nombre de archivo ni el contenido del aviso.
- **CA-14** (RNF-07) — error: Dado un origen que acumula intentos de conexión (todos, válidos o no) por encima del umbral configurado, cuando vuelve a intentar, entonces se rechaza con `REALTIME_TOO_MANY_REQUESTS` (429) y el tiempo de espera, sin verificar el token.

## 4. Reglas de negocio
- **RN-1** Hay un solo canal por pestaña y solo dos tipos de sala: la del usuario (todas sus conexiones) y la de un documento.
- **RN-2** El canal **no decide accesos** (ADR-0010). Solo el módulo dueño del documento admite una conexión en su sala, después de
  verificar el acceso del `Actor` en ese momento con `PermissionResolver` / `accessibleNodes(actor)`. El cliente nunca elige sus salas.
- **RN-3** Se autentica con el mismo token de acceso y las mismas reglas que la API HTTP (002 D-1 y D-14, 003): mismo puerto de
  verificación, mismos códigos `SHARED_UNAUTHENTICATED` y `SHARED_FORBIDDEN`, y solo desde los orígenes permitidos para la web.
- **RN-4** En esta spec el cliente no envía mensajes de negocio por el canal: los avisos van del servidor al navegador.
- **RN-5** Un aviso nunca lleva contenido de archivos, URLs firmadas, tokens ni claves de enlaces; solo lo que su spec productora declare.
- **RN-6** Entrega de mejor esfuerzo, como máximo una vez y sin almacenamiento: la fuente de verdad sigue siendo la API HTTP.
- **RN-7** Emitir un aviso nunca hace fallar ni demora la operación de negocio que lo origina (Art. XII).
- **RN-8** El catálogo de planes no limita conexiones. El límite de editores simultáneos (Pro 3, Equipo 5, Institucional 5;
  Personal solo lectura) es de 016 y se lee con el proveedor de límites, no aquí. Sí se limitan los intentos de conexión por origen (CA-14).
- **RN-9** Presencia (P-4): el canal solo transporta y avisa al módulo dueño de cada salida de su sala; `editing` (016) mantiene
  `Participant` y calcula y publica la presencia. Una conexión que se cae sin cerrar se da por salida en ≤ 60 s.
- **RN-10** El canal no define avisos de negocio, solo los de conexión; cada spec productora declara los suyos (P-5). Las
  notificaciones dentro de la app usarán la sala de usuario cuando una spec lo pida (P-8).

## 5. Seguridad y privacidad
- ¿Toca datos de un cliente? **Sí**: los avisos van a cuentas concretas y a documentos. Lleva prueba de aislamiento (CA-10) en
  `test/isolation`, bloqueante. La admisión a la sala de un documento según `accessibleNodes` se prueba en 016, que la implementa.
- Auditoría (RF-07): no aplica. Conectarse no es una acción sobre datos de una cuenta y ningún rol interno opera el canal.
  Las bitácoras técnicas siguen CA-13: nunca tokens, nombres de archivo ni contenido de avisos (RNF-17).
- Roles internos: no se conectan (CA-3, P-3) y nunca entran a la sala de un documento (Art. IX.1).
- Riesgos: un canal que no expira (CA-4); un cliente que se une a salas ajenas (CA-7); fuga entre cuentas (CA-10); intentos
  repetidos con tokens inválidos (CA-14). Riesgo aceptado (P-2, como 002 D-10): una sesión revocada o una cuenta suspendida
  conserva el canal hasta que vence su token de acceso (15 min como máximo); no hay corte inmediato.

## 6. Experiencia de usuario
| Pantalla | Mockup (`docs/design/mockups/…`) | Estados requeridos | Estado del mockup |
|---|---|---|---|
| — | — | — | — |

- **Sin interfaz propia** (P-1, sin mockup): la web mantiene el canal y lo reconecta; lo que el usuario ve (presencia,
  avisos de guardado) lo diseña cada spec productora, empezando por 016.

## 7. Fuera de alcance
- Presencia, límite de editores, avisos de guardado y de error de edición: 016 (este canal solo los transporta).
- Difundir el progreso de carga a otras pestañas o dispositivos (RF-08): no se hace en ninguna spec; RF-08 lo cubre 005 (DF-58, P-7).
- Corte inmediato del canal al revocar una sesión o suspender una cuenta (P-2). Indicador visual de conexión (P-1).
- Empuje del medidor de cuota o del explorador (007 P-2), notificaciones dentro de la app (`notifications`), streaming del agente (020).
- Reenvío o historial de avisos perdidos, salas por carpeta o por otros recursos, mensajes de cliente a cliente.
- Métricas y tableros del canal: 022. Prueba de carga (25 usuarios concurrentes, RNF-02): 023.
- Todo lo de `product-context.md` §9.

## 8. Preguntas
Sin preguntas abiertas.
- [RESUELTA] P-1 ¿Pantalla propia? → No: 015 va sin interfaz ni mockup; se verifica con integración y aislamiento y lo primero visible llega con 016 (2026-10-15, Adrián)
- [RESUELTA] P-2 Vigencia del canal → Se cierra al vencer el token de acceso (15 min) y se reabre con uno renovado; sin corte inmediato por revocación o suspensión, como 002 D-10 → CA-4 (2026-10-15, Adrián)
- [RESUELTA] P-3 ¿Roles internos? → Se rechazan con `SHARED_FORBIDDEN` → CA-3 (2026-10-15, Adrián)
- [RESUELTA] P-4 Frontera con 016 → El canal transporta y avisa al módulo dueño de las salidas; `editing` mantiene `Participant` y publica la presencia; una caída sin cierre limpio se avisa en ≤ 60 s → CA-9, RN-9 (2026-10-15, Adrián)
- [RESUELTA] P-5 ¿Avisos propios? → Solo los de conexión; cada spec productora define los suyos → RN-10 (2026-10-15, Adrián)
- [RESUELTA] P-6 Reconexión → Sin reenvío; el cliente vuelve a pedir el estado por HTTP y el dueño lo readmite → CA-11 (2026-10-15, Adrián)
- [RESUELTA] P-7 ¿Progreso de carga a otras pestañas (RF-08)? → No, en ninguna spec; RF-08 lo cubre solo 005 (DF-58) y sale de 015 (2026-10-15, Adrián)
- [RESUELTA] P-8 ¿Notificaciones dentro de la app? → Fuera de esta fase; usarán la sala de usuario cuando una spec lo pida → RN-10 (2026-10-15, Adrián)
- [RESUELTA] P-9 ¿Límites? → Ninguno por plan; sí se limitan los intentos fallidos de conexión con `IRateLimiter` (RNF-07) → CA-14, RN-8 (2026-10-15, Adrián)

## 9. Registro de cambios
| Fecha | Cambio | Motivo | Aprobó |
|---|---|---|---|
| 2026-10-15 | Creación en `Borrador` | `/spec 015` | — |
| 2026-10-15 | CA-2 sin «cuenta suspendida» (P-2: el token vigente sirve hasta vencer); CA-14 y RN-8 cuentan todos los intentos por origen | Revisión de `architect` del plan (`IRateLimiter` no distingue fallidos) | Adrián (2026-10-15) |
| 2026-10-15 | P-1…P-9 resueltas; CA-9 con plazo de 60 s, CA-14, RN-9, RN-10; RF-08 sale de 015; dueño pasa a Adrián | Respuestas de Adrián | Adrián |
