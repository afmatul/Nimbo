# Spec 016 — Edición colaborativa de .docx

> Qué y por qué, en ≤ 150 líneas. El cómo va en `./plan.md` (obligatorio).

| Campo | Valor |
|---|---|
| Estado | En revisión |
| Dueño | Adrián |
| Fase | 2 |
| Requisitos | RF-25, RF-26, RF-28; RNF-02 (5 editores por documento), RNF-05, RNF-09. Casos de uso 05, 19, 20, 39 |
| Depende de | 005 (archivo, `version_archivo`, cuota), 003 (`Actor`, permiso de edición), 015 (canal, salas y avisos a un usuario), `identity` (nombre visible). 014 (P-1) y 009 (RN-13) ya están en `main`: el plan de la propietaria sale de su suscripción |
| DF / ADR | DF-05, DF-20, DF-30, DF-39, DF-74; ADR-0004, ADR-0010, ADR-0012, ADR-0024, ADR-0030, ADR-0029 |
| Última actualización | 2026-10-18 |

## 1. Contexto y objetivo
El cliente abre un `.docx` de su nube y lo edita en el navegador, solo o con otras personas a la vez, sin convertirlo ni
descargarlo. Al terminar la sesión, Nimbo guarda el resultado como una **versión nueva** que recuerda quiénes participaron,
y deja el contenido listo para reindexarse. Si el editor falla, el archivo y su última versión siguen intactos. Es lo que
diferencia a Nimbo (CLAUDE.md, puntos 1 y 2).

## 2. Historias de usuario
- **HU-1** Como cliente con permiso de edición, quiero abrir un `.docx` en el navegador y editarlo, para trabajar sin descargar ni convertir.
- **HU-2** Como coeditor, quiero ver quién más está en el documento, para no pisar el trabajo de otros, hasta el límite de mi plan.
- **HU-3** Como propietario, quiero que cada sesión deje una versión con sus participantes, para saber quién participó y poder volver atrás (014).
- **HU-4** Como cliente, quiero que un fallo del editor no dañe mi archivo ni bloquee el resto de Nimbo.
- **HU-5** Como rol interno, nunca accedo al contenido de documentos de clientes.

## 3. Criterios de aceptación
Abrir un documento responde siempre con un modo: **edición** o **solo lectura** con su motivo (`readOnlyReason`).
- **CA-1** (HU-1, RF-25) Dado un `.docx` sobre el que tengo permiso de edición y un plan de pago (Pro, Equipo, Institucional), cuando lo abro, entonces el editor carga el documento original en modo edición.
- **CA-2** (HU-1, RNF-05) — error: Dado un archivo ajeno sin acceso, en la papelera o inexistente, cuando intento abrirlo, entonces se responde como inexistente (igual que 005 CA-16) y no se crea sesión.
- **CA-3** (HU-1, RF-25) Dado un lector (solo ver), cuando abro el `.docx`, entonces se muestra en solo lectura (`EDITING_VIEW_ONLY`) y nada de lo que escriba se guarda.
- **CA-4** (HU-1, RF-25) — error: Dado un archivo que no es `.docx` (p. ej. `.xlsx`, `.pdf`), cuando pido editarlo, entonces se responde `EDITING_UNSUPPORTED_FORMAT` (422) y no se abre el editor.
- **CA-5** (HU-1, RF-25) Dado una cuenta Personal o con suscripción vencida, cuando abre un `.docx`, entonces se abre en solo lectura con motivo `EDITING_PLAN_READ_ONLY` y «Tu plan no incluye edición». La suscripción vencida solo es alcanzable al llegar 010 (`PlanLimitsAdapter` aún ignora `vence_en`).
- **CA-6** (HU-2, RF-26) Dado un documento abierto por otros, cuando entro al editor, entonces veo la lista de participantes conectados con su nombre real de cuenta, que se actualiza cuando alguien entra o sale; nadie puede mostrarse con el nombre de otro (RN-12).
- **CA-7** (HU-2, RF-26, RNF-02) Dado un documento con el máximo de editores del plan (Pro 3, Equipo 5, Institucional 5), cuando otra persona lo abre, entonces se abre en solo lectura con motivo `EDITING_LIMIT_REACHED`; la solo lectura no cuenta para el límite.
- **CA-8** (HU-2, RF-26) Dado un participante que cierra la pestaña o pierde la red, cuando pasa el plazo de 015 (≤ 60 s), entonces los demás dejan de verlo y su lugar queda libre para el límite.
- **CA-9** (HU-3, RF-28) Dado una sesión con cambios y cerrada por todos los participantes, cuando el editor entrega el documento, entonces existe una versión nueva, vigente, de origen «edición», con todos los que entraron como editores en la sesión.
- **CA-10** (HU-3, RF-28) Dado el mismo aviso de guardado recibido dos veces, cuando se procesa, entonces hay una sola versión (DF-05).
- **CA-11** (HU-3, RF-28) Dado una sesión cerrada sin cambios, o un guardado forzado a mitad de sesión, cuando ocurre, entonces no se crea versión (DF-39).
- **CA-12** (HU-3, RF-28) Dado una versión nueva registrada, cuando concluye, entonces el documento queda encolado para reindexar (RF-30, M6) y la ausencia de consumidor no falla el guardado.
- **CA-13** (HU-3, RF-28) Dado un plan con N versiones retenidas (Pro 30, Equipo 60, Institucional 100), cuando la versión nueva excede N, entonces se poda la más antigua según `storage` (RF-13).
- **CA-14** (HU-4, RF-28) — error: Dado un archivo entregado incompleto o corrupto, o un archivo purgado en plena sesión, cuando se verifica, entonces la sesión queda `fallida` y la versión vigente no cambia. Cada participante recibe un aviso en vivo, en cualquier pantalla y sin toast (ADR-0024), y al volver a abrir el documento ve un banner «No pudimos guardar tus cambios» con «Abrir el editor de nuevo», que abre una sesión nueva sobre la versión vigente (no se reprocesa la entrega ni se conserva el archivo fallido). Si el archivo fue purgado solo hay aviso en vivo (CA-2).
- **CA-15** (HU-4, RNF-09) — error: Dado el servicio de edición caído, cuando abro un `.docx`, entonces se responde `EDITING_UNAVAILABLE` (503) y subir, descargar, listar y compartir responden con normalidad.
- **CA-16** (HU-1, RF-26) — error: Dado un participante cuyo acceso se revoca en plena sesión, cuando el servidor lo verifica, entonces sale de la sala y deja de recibir avisos (015 CA-8); lo escrito antes se conserva y lo posterior no se acepta.
- **CA-17** (HU-5, RNF-05) — error: Dado un Administrador, Soporte u Operador, cuando intenta abrir o consultar la sesión de un documento, entonces `SHARED_FORBIDDEN` y no se registra participación.
- **CA-18** (HU-5, RNF-05, aislamiento) Dado A y B con documentos distintos, cuando A edita, entonces B no recibe presencia, avisos ni versión de A, ni abriendo conexiones ni enviando avisos de guardado falsificados (`test/isolation`).
- **CA-19** (HU-3, RF-28) — error: Dado un aviso de guardado sin firma válida o con una URL fuera del servicio de edición, cuando llega, entonces se rechaza sin descargar nada ni cambiar el archivo.
- **CA-20** (HU-3, RF-28) Dado una cuenta sin cuota libre suficiente, cuando se registra la versión de edición, entonces se guarda igual, el espacio usado supera la cuota y las cargas nuevas responden `STORAGE_QUOTA_EXCEEDED` hasta liberar espacio.
- **CA-21** (HU-1, RNF-02) Dado un `.docx` mayor que el tope editable, cuando lo abro, entonces se abre en solo lectura con motivo `EDITING_FILE_TOO_LARGE`.
- **CA-22** (HU-1, RF-25) Dado un coeditor con permiso de edición sobre un `.docx` cuya cuenta propietaria es Personal o está vencida, cuando lo abre, entonces se abre en solo lectura con motivo `EDITING_OWNER_PLAN_READ_ONLY` y «El plan de la cuenta propietaria no incluye edición», sin acciones de plan. Solo es alcanzable al llegar 012.

## 4. Reglas de negocio
- **RN-1** Solo se edita `.docx` (ADR-0004), sobre el archivo original, sin conversión (RF-25).
- **RN-2** Edita quien tenga nivel Propietario o Editor, resuelto con `PermissionResolver` / `accessibleNodes(actor)` al abrir y al admitir en la sala (015 RN-2). Lector: solo lectura.
  **Nota para 012:** la regla admite Editor a propósito, para no atrasar 016 hasta que exista la compartición. No es código especulativo (YAGNI): 012 no debe quitarla ni rehacerla, solo conceder el permiso (y ampliar las políticas RLS de las tablas de edición).
- **RN-3** La regla evalúa el plan de la **cuenta propietaria del archivo**, no el del coeditor (CA-22). Solo los planes de pago editan (`product-context.md` §3: Personal = edición «Solo lectura»). Por eso solo Pro, Equipo e Institucional generan versiones de edición, con 30, 60 y 100 versiones retenidas. El máximo de editores sale de `IPlanLimitsProvider` (Pro 3, Equipo 5, Institucional 5), nunca de código.
- **RN-4** Sesión de edición: desde que entra el primer editor hasta que el servicio de edición avisa «listo para guardar» (estado 2, glosario). **Solo el estado 2 crea versión**: ni el cierre sin cambios (4) ni el guardado forzado (6), y no hay temporizador propio de inactividad. Una sesión genera como máximo una versión (1:0..1, DF-39).
- **RN-5** Autoría: la versión queda asociada a todas las cuentas que entraron como editor en la sesión, aunque hayan salido antes. Sin atribución por párrafo (§9).
- **RN-6** La versión nueva es inmutable y se registra solo cuando el archivo entregado está íntegro; hasta entonces la vigente permanece (Art. XII). La registra `storage` con `origen='edicion'` (ADR-0012); 014 solo lista y restaura.
- **RN-7** El aviso de guardado es idempotente y no se procesa dentro de la petición del servicio de edición (DF-20, Art. IX.2).
- **RN-8** La versión suma su tamaño al espacio usado de la propietaria y **nunca se descarta por cuota** (se perdería trabajo): la cuenta queda sobre la cuota y se bloquean las cargas hasta liberar espacio (CA-20).
- **RN-9** Los avisos de presencia y guardado van por el canal de 015 y nunca llevan contenido, nombres de archivo ni tokens (015 RN-5). La presencia nativa del editor (cursores) se conserva; Nimbo publica solo la lista de participantes y el conteo frente al límite.
- **RN-10** Tope editable configurable por variable de entorno, inicial 50 MB (**cifra a validar en staging** con ONLYOFFICE y 4 GB). Los 2 GB de RNF-02 son de carga y descarga, no de edición.
- **RN-11** Si el archivo va a la papelera o se renombra con la sesión abierta, la sesión sigue y la versión se registra sobre el mismo archivo. Si se purga definitivamente, la sesión queda `fallida` y se avisa (CA-14).
- **RN-12** El nombre visible de cada participante lo determina el servidor a partir de su cuenta; el cliente no lo envía. Sirve para la lista en vivo y para el nombre en el editor; el historial con autoría de 014 lo reutilizará.
- **RN-13** ~~Restricción de trabajo: hasta que exista 009, las cuentas son Personal y no podrían editar; andamiaje de prueba solo para desarrollo que se elimina al terminar la spec.~~ **Cumplida**: andamiaje borrado en T-11; desde 009 el plan sale de la suscripción.

## 5. Seguridad y privacidad
- ¿Toca datos de un cliente? **Sí** → pruebas de aislamiento bloqueantes (CA-18) más la admisión a la sala por `accessibleNodes` (015 §5 la delega aquí).
- Auditoría (RF-07): abrir sesión, versión creada (autor, id de versión) y guardado fallido. Nunca nombres de archivo, contenido, tokens ni URLs firmadas (RNF-17).
- Roles internos: sin acceso al contenido ni a la sala (CA-17, Art. IX.1). No hay suplantación.
- Riesgos: sesión de edición accesible con un token de otro documento; entrega de guardado falsificada (CA-19); filtrar presencia a quien no tiene acceso (CA-18); enlaces de contenido reutilizables tras revocar acceso (CA-16).

## 6. Experiencia de usuario
Rutas relativas a `docs/design/`: mockups `mockups/editing/editor/editor--<estado>.html`; capturas `capturas/editing/editor/editor--<estado>--{360,1440}.png`.
| Pantalla | Estados requeridos (`<estado>`) | CA | Estado del mockup |
|---|---|---|---|
| Editor .docx con presencia | `coeditando` | 1, 6 | Aprobado (2026-10-17, Adrián, recorrido de T-10): 10 estados (016); `editor--editando.html` es la propuesta original y solo queda como referencia |
| | `cargando` | — | ídem |
| | `limite-editores` | 7 | ídem |
| | `guardado-fallido` | 14 | ídem |
| | `solo-lectura-lector` | 3 | ídem |
| | `solo-lectura-plan` | 5 | ídem |
| | `solo-lectura-vencida` (alcanzable con 010) | 5 (RF-23) | ídem; su texto propio («Renovar plan») queda para 010 (PD-119) |
| | `solo-lectura-tamano` | 21 (P-5) | ídem |
| | `solo-lectura-plan-propietario` (coeditor, 012) | 22 | ídem |
| | `no-disponible` | 15 | ídem |
| Historial con autoría | `mockups/storage/ficha-archivo/` sin cambios | — | Cubierto; lo implementa 014 |

- Fuera de la pantalla del editor: CA-4 (solo se ofrece «Editar» para `.docx`), CA-2 (página de no encontrado de 005) y CA-17 (los roles internos no ven ninguna acción de edición).
- Mensajes clave (tuteo): «Estás editando con 2 personas más», «Hay 5 editores; estás en solo lectura. Inténtalo en unos minutos», «No pudimos guardar tus cambios. Tu versión anterior está intacta. Reintenta», «El editor no está disponible. Tus archivos siguen a salvo».
- El mockup incluye atribución por párrafo, firma y sugerencias del agente: fuera de alcance (§9), se ignoran. «Servicio no disponible» usa el patrón existente de estados (`StateView`).

## 7. Fuera de alcance
- Atribución por párrafo y reportes de contribución; edición de `.xlsx`/`.pptx`; sugerencias o generación por el agente (§9).
- Listado, restauración y poda manual de versiones: 014. Reindexación misma: 019/M6 (aquí solo se encola).
- Crear un `.docx` en blanco desde Nimbo (P-7): se sube uno vacío. Comentarios, control de cambios propio, chat entre coeditores.
- Compartir (012): aquí solo se consume el nivel de acceso. Plan vencido a solo lectura (010): aquí solo se respeta (CA-5).
- Prueba de carga con 25 usuarios (RNF-02): 023. Métricas y alertas de ONLYOFFICE: 022.

## 8. Preguntas
Sin preguntas abiertas.
- [RESUELTA] P-1 ¿Quién crea la versión? → 016 la registra con `origen='edicion'` mediante `storage` (ADR-0012); 014 solo lista y restaura; «Depende de» = 005, 003, 015 → RN-6 (2026-10-16, Adrián)
- [RESUELTA] P-2 ¿Quién edita sin 012? → Propietario o Editor vía `PermissionResolver`/`accessibleNodes`, con la nota explícita para 012 → RN-2 (2026-10-16, Adrián)
- [RESUELTA] P-3 Cierre y autoría → solo el estado 2; sin versión en 4 ni en guardado forzado 6; sin temporizador propio; autores = todos los que entraron como editor; solo planes de pago → RN-3, RN-4, RN-5 (2026-10-16, Adrián)
- [RESUELTA] P-4 Cuota → guardar y sobregirar; nunca se descarta por cuota → RN-8, CA-20 (2026-10-16, Adrián)
- [RESUELTA] P-5 Tamaño editable → tope configurable por entorno, inicial 50 MB a validar en staging; por encima, solo lectura con `EDITING_FILE_TOO_LARGE` → RN-10, CA-21 (2026-10-16, Adrián)
- [RESUELTA] P-6 Límite alcanzado → se abre en solo lectura y no cuenta para el límite → CA-7 (2026-10-16, Adrián)
- [RESUELTA] P-7 `.docx` en blanco → fuera de alcance (2026-10-16, Adrián)
- [RESUELTA] P-8 Conflictos → papelera o renombrado: la sesión sigue; purga definitiva: sesión fallida y aviso; acceso revocado: CA-16 → RN-11 (2026-10-16, Adrián)
- [RESUELTA] P-9 Presencia → se mantiene la nativa del editor; Nimbo publica por 015 la lista y el conteo → RN-9 (2026-10-16, Adrián)
- [RESUELTA] P-10 Mockups → 10 estados del editor en las rutas de §6 (2026-10-16, Adrián)
- [RESUELTA] P-11 Plan de pago hasta 009 → andamiaje temporal exclusivo, se borra al terminar → RN-13 (2026-10-16, Adrián)
- [RESUELTA] P-12 Nombres de participantes → los pone el servidor desde `identity`; no se acepta el del cliente → RN-12, CA-6 (2026-10-16, Adrián)
- [RESUELTA] P-13 Guardado en el `api` → confirmado, ADR-0029 (2026-10-16, Adrián)
- [RESUELTA] P-14 Fallo de guardado → aviso en vivo + banner + «Abrir el editor de nuevo» → CA-14 (2026-10-16, Adrián)
- [RESUELTA] P-15 Coeditor con propietaria sin plan de edición → diseñado ya, alcanzable con 012 → CA-22, RN-3 (2026-10-16, Adrián)

## 9. Registro de cambios
| Fecha | Cambio | Motivo | Aprobó |
|---|---|---|---|
| 2026-10-16 | Creación en `Borrador` | `/spec 016` | — |
| 2026-10-16 | Ciclo 1 del plan: sin cambios de CA ni RN (los 9 puntos son de diseño); CA-16, CA-18 y CA-19 cubren enlaces y avisos rechazados con sesión no activa o firma inválida | Revisión de `architect` | — |
| 2026-10-16 | P-11…P-15: andamiaje de plan (RN-13), nombres del servidor (RN-12, CA-6), CA-14 reescrito, CA-22 y RN-3 (plan de la propietaria), §6 con 10 estados, depende de `identity` | Respuestas de Adrián | Adrián |
| 2026-10-16 | P-1…P-10 resueltas; abrir responde siempre con modo (CA-3, 5, 7, 21 pasan a solo lectura con motivo); CA-11, CA-20, CA-21, RN-2 (nota 012), RN-3, RN-8, RN-10, RN-11; depende de 005, 003, 015 | Respuestas de Adrián | Adrián |
| 2026-10-16 | Pasa a `Lista` | Spec y plan aprobados | Adrián |
| 2026-10-16 | Pasa a `En curso` | Inicio de la implementación en `feat/016-edicion-colaborativa-docx` | Adrián |
| 2026-10-16 | **Propuesta (developer, T-03)**: no registrar `OnlyOfficeHealthIndicator` en `/health/ready` del `api` (con ONLYOFFICE opcional, el `api` dejaría de estar listo cuando el editor cae, contra CA-15/RNF-09); CA-15 se cumple con la comprobación de disponibilidad al abrir. Ver PD-113 | Contradicción plan §2 ↔ CA-15 | — (pendiente de Adrián) |
| 2026-10-16 | PD-112 resuelta: **RN-11 queda como está escrita** («guardar igual»): si el archivo pasa a la papelera con la sesión abierta, el guardado se registra igual sobre el mismo archivo. `file_missing` / `fallida/archivo_purgado` queda solo para el archivo purgado de verdad (CA-14) | Decisión de Adrián sobre PD-112 | Adrián |
| 2026-10-16 | PD-113 resuelta: se acepta la propuesta de T-03; `OnlyOfficeHealthIndicator` no se registra en `/health/ready` y la disponibilidad se revisa con `isAvailable` en cada apertura (CA-15) | Decisión de Adrián sobre PD-113 | Adrián |
| 2026-10-17 | Pasa a `En revisión` | T-01…T-11 hechas; `/review 016` | Adrián |
| 2026-10-17 | §6: los 10 mockups del editor pasan de `Borrador` a `Aprobado` | Recorrido de T-10 aprobado (review I-2) | Adrián |
| 2026-10-18 | Tras el rebase sobre 009 y 014: «Depende de» al día, RN-13 cumplida, CA-5 y §6 con «vencida» alcanzable con 010 (PD-119) | Revisión 2.ª pasada, I-2 e I-3 | — (pendiente de Adrián) |
