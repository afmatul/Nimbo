# Spec 013c — Diálogo del enlace público (web)

> Qué y por qué, en ≤ 150 líneas. El cómo va en `./plan.md` (obligatorio). La API es la 013; la página del visitante, la 013b.

| Campo | Valor |
|---|---|
| Estado | Borrador |
| Dueño | Fátima |
| Fase | 2 |
| Requisitos | RF-17, RF-18, RNF-13, RNF-14; apoyan RF-07, RNF-08 |
| Depende de | 013 (API integrada, PR #93), 012b (diálogo «Compartir»), 013b (página `/enlace`, `PasswordField` en `components/nimbo/`) |
| Última actualización | 2026-11-10 |

## 1. Contexto y objetivo
La 013 dejó la API para generar, ver, reemplazar y revocar el enlace público de un archivo, y la 013b la página del
visitante. El propietario aún no tiene dónde usarla: esta spec agrega la sección «Enlace público» al diálogo «Compartir»
(012b) para generar el enlace con vencimiento y contraseña opcional, copiarlo la única vez que se entrega, y
reemplazarlo o revocarlo. Es el remedio que la 013b dejó pendiente ante el techo global de fallos (013b R-2, DF-91).
Además, «Mi actividad» muestra las acciones del enlace, y las del visitante como «Alguien con el enlace» (013 CA-18), y
se cierra PD-200 en la página del visitante.

## 2. Historias de usuario
- **HU-1** Como propietario, quiero generar desde «Compartir» un enlace público a un archivo, con vencimiento y si quiero contraseña, y copiarlo, para dárselo a quien no tiene cuenta.
- **HU-2** Como propietario, quiero ver si un archivo tiene enlace, cuándo vence y si pide contraseña, y reemplazarlo o revocarlo, para dejar de compartirlo o recuperar uno bloqueado.
- **HU-3** Como propietario, quiero distinguir en «Mi actividad» lo que hizo alguien con mi enlace de lo que hice yo.
- **HU-4** Como visitante, quiero que cambiar de enlace en la misma pestaña no mezcle la descarga del anterior.

## 3. Criterios de aceptación
> Dado/Cuando/Entonces. Códigos y reglas de la API: 013 §3. Fechas absolutas con hora de Guatemala («14 nov 2026, 14:30», 013b S-4).

**Sección «Enlace público» (RF-17, RF-18)**
- **CA-1** (HU-2, RF-18) Dado el diálogo de un archivo propio, cuando se abre, entonces la sección muestra «Cargando el enlace público…» y luego su estado: sin enlace («Crear enlace público»), activo o vencido.
- **CA-2** (HU-1, RF-17) Dado una carpeta, cuando abro «Compartir», entonces la sección no aparece y no se pide nada a la API de enlaces (decisión 1).
- **CA-3** (HU-1, RF-17) Dado un archivo sin enlace, cuando pulso «Crear enlace público», elijo «Vence en» 1, 7 o 30 días (7 marcado), opcionalmente una contraseña, y pulso «Generar enlace», entonces veo «Generando…» pasados 2 s y luego «Generamos el enlace. Cópialo ahora: por seguridad, no podrás volver a verlo.», la URL completa en un campo de solo lectura, «Copiar enlace», el vencimiento y si pide contraseña.
- **CA-4** (HU-1, RF-17) Dado la contraseña vacía, cuando genero, entonces el enlace se crea sin contraseña: el campo vacío no se envía (decisión 3, 013 S-3).
- **CA-5** (HU-1, RF-17) — error: Dado una contraseña de menos de 8 o más de 128 caracteres, cuando genero, entonces veo «Escribe una contraseña de 8 a 128 caracteres.» junto al campo, marcado como inválido, con el foco, no se envía nada y conservo el vencimiento elegido (texto de 013b CA-16). Si la API responde ese `422`, igual.
- **CA-6** (HU-1, RNF-14) Dado la URL generada, cuando pulso «Copiar enlace», entonces queda en el portapapeles, se anuncia «Enlace copiado» y el botón lo dice hasta la siguiente interacción. — error: si el navegador no deja copiar, veo «No pudimos copiar el enlace. Selecciónalo y cópialo a mano.» y el texto del campo queda seleccionado.
- **CA-7** (HU-2, RF-18, RN-1) Dado un enlace activo, cuando abro el diálogo (también tras generarlo y cerrar), entonces veo «Activo», «Vence el … · Con contraseña (o Sin contraseña) · Creado el …», la nota «Por seguridad, el enlace solo se ve al generarlo. Si lo perdiste, genera otro: el actual dejará de funcionar.», «Generar otro enlace» y «Revocar enlace», sin la URL. Un enlace vencido dice «Venció el …» con las mismas acciones.
- **CA-8** (HU-2, RF-17) Dado un enlace activo, cuando pulso «Generar otro enlace», entonces la sección pide confirmar en línea, sin otro diálogo: «El enlace actual dejará de funcionar para quien lo tenga.», con el formulario de CA-3 y «Cancelar». Al confirmar veo «Generando…» y la URL nueva como en CA-3 (013 CA-4); al cancelar vuelvo a CA-7 sin cambios (decisión 2). Con un enlace vencido, el formulario aparece sin esa advertencia (D-5).
- **CA-9** (HU-2, RF-17) Dado un enlace sin revocar, cuando pulso «Revocar enlace» y confirmo en línea («¿Revocar el enlace? Quien lo tenga ya no podrá descargar el archivo.»), entonces veo «Revocando…» pasados 2 s, «Revocamos el enlace. Ya no sirve para descargar el archivo.» y la sección vuelve a «sin enlace» (D-1).
- **CA-10** (HU-2, 010 RN-6) Dado mi cuenta en solo lectura, cuando abro la sección, entonces no se ofrece crear ni «Generar otro enlace»; veo «Tu cuenta está en solo lectura: no puedes generar enlaces.» con «Renovar plan», y «Revocar enlace» sigue disponible (013 CA-5; D-6). Si la cuenta pasa a solo lectura con el diálogo abierto, el `403` `STORAGE_ACCOUNT_READ_ONLY` al generar muestra el mismo texto y conserva lo elegido.
- **CA-11** (RNF-13) Dado una confirmación o el formulario abiertos, cuando pulso Escape, entonces se cancela solo eso y el diálogo sigue abierto; si la URL generada está a la vista, Escape no la descarta salvo al cerrar el diálogo.

**Errores de la sección (RNF-14)**
- **CA-12** (HU-1, RNF-07) — error: Dado `429` `SHARED_TOO_MANY_REQUESTS` al generar, entonces veo «Hiciste demasiados intentos. Espera {n} minutos y vuelve a intentarlo.» con la espera de la API y conservo lo elegido (013 CA-6, 012b CA-3).
- **CA-13** (HU-2, RNF-14) — error: Dado que la red falla o la API responde 5xx al cargar, generar o revocar, entonces veo «No pudimos completar la acción. Revisa tu conexión e inténtalo de nuevo.» con «Reintentar»; al cargar, en lugar del estado de CA-1; al generar, conservando lo elegido.
- **CA-14** (HU-2, RF-18) — error: Dado `404` `SHARING_LINK_NOT_FOUND` al revocar, entonces veo «Este enlace ya no existe. Actualiza para ver el estado actual.» con «Actualizar», que vuelve a pedir el estado. Dado `404` `STORAGE_NODE_NOT_FOUND` al cargar o generar, entonces veo «Este archivo ya no está disponible. Puede que esté en la papelera.», sin botón (D-8).

**Accesibilidad (RNF-13, RNF-14)**
- **CA-15** (RNF-13) Dado la sección en cada estado de §6, entonces axe no da violaciones; los avisos se anuncian una sola vez; cuando el botón pulsado desaparece (confirmar, generar, revocar), el foco pasa al siguiente control con sentido y «Cancelar» lo devuelve al botón que abrió la confirmación; a 360 px la URL cabe en un campo de una línea sin desplazamiento horizontal de la página. Viewport, contraste AA a 360 y 1440 px y «reducir movimiento» se verifican a mano (T-07) y en el mockup (T-01).

**«Mi actividad» (013 CA-18, RF-07)**
- **CA-16** (HU-3, RF-07) Dado `public_link.downloaded` o `public_link.locked` con `trigger` `public_link`, cuando miro «Mi actividad», entonces el sujeto es «Alguien con el enlace», nunca «Tú»: «Alguien con el enlace descargó 1 archivo» y «Se bloquearon los intentos de contraseña del enlace de 1 archivo».
- **CA-17** (HU-3, RF-07) Dado `public_link.created` y `public_link.revoked`, cuando miro «Mi actividad», entonces leo «Generaste un enlace público de 1 archivo» y «Revocaste un enlace público de 1 archivo», y ya no «Actividad en tu cuenta».

**Página del visitante (PD-200; 013b CA-3, CA-8)**
- **CA-18** (HU-4, RF-17) Dado una descarga en curso en `/enlace#A`, cuando el fragmento cambia a `#B` antes de que llegue la URL, entonces la ficha de B no muestra «Preparando descarga…», la URL de A no se abre, y «Descargar» en la ficha de B funciona sin esperar a la de A.

## 4. Reglas de negocio
- **RN-1** La URL con el token se ve solo en la respuesta de generar, mientras el diálogo siga abierto; después no hay forma de volver a verla (013 RN-3). Volver a compartir = generar otro.
- **RN-2** La sección solo existe para archivos (decisión 1) y solo la ve el propietario: «Compartir» no se ofrece a Editor ni Lector (012b CA-6).
- **RN-3** La interfaz no decide permisos: oculta según solo lectura y `status`, y el servidor revalida (como 012b RN-1). Textos por `code` (Art. VI.3).

## 5. Seguridad y privacidad
- **Toca datos de un cliente: sí, solo por la 013.** Sin rutas, consultas ni contratos nuevos: el aislamiento lo cubre `public-links.iso-spec.ts` (013 CA-17, 013b CA-15). **Sin tarea de aislamiento nueva** por esa razón.
- **Token:** la URL vive solo en la memoria del diálogo y se descarta al cerrarlo. Nunca va a `localStorage`, `sessionStorage`, la URL de la página, el título, `console` ni mensajes de error; al portapapeles solo cuando el propietario lo pide.
- **Contraseña:** solo en el estado del formulario; se descarta al generar o cerrar. El campo pide al navegador no rellenarla con la de la cuenta (`new-password`, nombre propio). La ayuda: «Si la pones, se pedirá para descargar. De 8 a 128 caracteres. No uses la de tu cuenta y compártela por otro medio.».
- **Auditoría:** sin eventos nuevos; CA-16 y CA-17 solo leen los de 013 CA-15 y CA-18, sin nombre de archivo ni token.
- **Roles internos:** no llegan al diálogo (003 D-5); si llamaran a la API, `403` `SHARED_FORBIDDEN` (013 CA-16).

## 6. Experiencia de usuario
| Pantalla | Mockup | Estados requeridos | Estado del mockup |
|---|---|---|---|
| Sección «Enlace público» del diálogo «Compartir» (`ui-guidelines.md` §7, fila «Enlace público (diálogo…)») | `docs/design/mockups/sharing/compartir/` (`compartir--enlace-<estado>.html`) | los 24 de la tabla siguiente | Pendiente: T-01 (`ui-designer`); bloquea `Lista` hasta que Adrián lo apruebe |
| «Mi actividad» (CA-16, CA-17) | patrones existentes (004) | sin estados nuevos | No aplica: solo textos (variante opcional en `_generadores/actividad`) |

| Estados de la sección | CA |
|---|---|
| cargando · error-carga | CA-1, CA-13 |
| sin-enlace · formulario · con-contrasena · contrasena-invalida · generando · generado | CA-3 a CA-5 |
| copiado · copia-fallida | CA-6 |
| activo · vencido | CA-7 |
| confirmar-reemplazo · reemplazando · reemplazado | CA-8 |
| confirmar-revocar · revocando · revocado | CA-9 |
| solo-lectura-sin-enlace · solo-lectura-con-enlace · 403-tardio | CA-10 |
| error-red · demasiados-intentos · 404-enlace · 404-archivo | CA-12 a CA-14 |
| carpeta (sección oculta) | CA-2 |

- Mensajes clave: los de CA-3 a CA-17. El mockup actual dice «exige clave»: manda RF-17 (contraseña opcional) y «contraseña» (013 §6).

## 7. Fuera de alcance
- Cambiar vencimiento o contraseña de un enlace existente (se genera otro, 013 S-6); varios enlaces por archivo; enlaces a carpetas.
- Lista de «todos mis enlaces», contador de descargas, avisos al propietario (013 §7).
- Distinguir en «Mi actividad» la revocación del reemplazo, o el bloqueo por red del techo global (la API no expone el motivo; 013b m-3).
- Cambios en la API o en los contratos; los estados pendientes de la 012b en el mockup.

## 8. Supuestos
- **S-1** «Mi actividad» lee un reemplazo como «Revocaste…» seguido de «Generaste…» (013 CA-15 los registra así). Las acciones del visitante siguen en el filtro «Yo» (013 plan §2); el sujeto las distingue.
- **S-2** 013b CA-16 ya se cumple en la API (texto de `INVALID_PASSWORD` en contratos, 013b T-02); aquí solo se muestra (CA-5).
- **S-3** Se puede copiar cuantas veces se quiera mientras el diálogo siga abierto.

## 9. Preguntas
- [RESUELTA 2026-11-06, Fátima] Carpeta: la sección se oculta; reemplazar se confirma en línea; `password` vacía se omite; `PasswordField` desde `components/nimbo/`.
- [RESUELTA 2026-11-10, Fátima] P-1 ¿Mockup o patrones? → Mockup con `/mockup` (T-01), como 013b; bloquea `Lista` hasta su aprobación.
- [RESUELTA 2026-11-10, Fátima] **D-1** ¿Revocar se confirma en línea, como reemplazar (CA-9)? → (a) en línea; la excepción a `ConfirmDestructiveDialog` se escribe en `ui-guidelines.md` §4 (T-01 o T-04)
- [RESUELTA 2026-11-10, Fátima] **D-6** ¿Solo lectura se anticipa (CA-10)? → Sí, con `useReadOnlyAccount` como `access-row`; el `403` tardío muestra el mismo texto
- [RESUELTA 2026-11-10, Fátima] D-2 Botón «Crear enlace público» en vez de formulario siempre visible → sí
- [RESUELTA 2026-11-10, Fátima] D-3 La sección va después de «Personas con acceso», con `h3` «Enlace público» → sí
- [RESUELTA 2026-11-10, Fátima] D-4 «Vence en» como grupo de opciones (`RadioGroup`), no lista desplegable → sí
- [RESUELTA 2026-11-10, Fátima] D-5 Con un enlace vencido, «Generar otro enlace» sin advertencia → sí
- [RESUELTA 2026-11-10, Fátima] D-7 Cerrar el diálogo con la URL sin copiar no pide confirmación → no se pide
- [RESUELTA 2026-11-10, Fátima] D-8 `404` del archivo con texto propio y sin botón (CA-14) → sí
- [RESUELTA 2026-11-10, Fátima] D-9 «Enlace copiado» hasta la siguiente interacción, sin temporizador (CA-6) → sí
- [RESUELTA 2026-11-10, Fátima] D-10 T-01: base del diálogo 012b que haga falta y 24 variantes (48 PNG) con `_generadores/compartir/generar.js` → sí

## 10. Registro de cambios
| Fecha | Cambio | Motivo | Aprobó |
|---|---|---|---|
| 2026-11-10 | Creación en `Borrador` con plan y tareas (ADR-0034); incluye 013 CA-18 y PD-200 | Fila 013c de `specs/README.md`; decisiones de Fátima del 2026-11-06 | Pendiente (Adrián) |
| 2026-11-10 | Estados, textos y riesgos del mapa del `ui-designer` (24 estados, R-1 a R-7 → CA-6, CA-11, CA-15 y §5); D-1 a D-10 | Mapa de estados del `ui-designer` | Pendiente (Fátima, Adrián) |
| 2026-11-10 | D-1 a D-10 resueltas con las recomendaciones: revocar en línea con excepción en `ui-guidelines.md` §4, solo lectura anticipada | Decisiones de Fátima | Fátima (decisión); plan por aprobar (Adrián) |
