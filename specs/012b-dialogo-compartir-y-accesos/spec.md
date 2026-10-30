# Spec 012b — Diálogo «Compartir» y lista de accesos (web)

> Qué y por qué, en ≤ 150 líneas. El cómo irá en `./plan.md` cuando se resuelva la pregunta bloqueante P-1.

| Campo | Valor |
|---|---|
| Estado | Borrador (sin plan ni tareas: P-1 bloquea) |
| Dueño | Fátima |
| Fase | 2 |
| Requisitos | RF-16, RF-18; RNF-13, RNF-14 |
| Depende de | 012 (API), 000b (sistema de diseño), 006 (explorador) |
| Última actualización | 2026-10-30 |

## 1. Contexto y objetivo
La 012 entrega la API de compartición. Esta spec le pone la pantalla: un diálogo «Compartir» que se abre desde el
explorador y la ficha de un archivo o carpeta propios, donde el propietario escribe un correo, elige Lector o Editor,
ve quién tiene acceso (directo o heredado) y revoca. Es la única pantalla de la compartición de personas; los enlaces
públicos son la 013.

## 2. Historias de usuario
- **HU-1** Como propietario, quiero compartir desde el menú de un archivo o carpeta, para no salir del explorador.
- **HU-2** Como propietario, quiero ver en el mismo diálogo quién tiene acceso y de dónde le viene, para saber quién lo ve.
- **HU-3** Como propietario, quiero cambiar el nivel de alguien o quitarle el acceso, para ajustar lo que comparto.
- **HU-4** Como destinatario, quiero que la interfaz solo me ofrezca lo que mi nivel permite, para no chocar con errores.

## 3. Criterios de aceptación
> Dado/Cuando/Entonces. Los códigos y reglas de la API son los de la 012; aquí solo lo observable en pantalla.

- **CA-1** (HU-1, HU-2, RF-18) Dado un nodo propio, cuando abro «Compartir», entonces veo el diálogo con el estado de la lista (cargando, vacía o con personas), cada una con nombre, correo, nivel y origen (directo o «Viene de «<carpeta>»»).
- **CA-2** (HU-1, RF-16) Dado el diálogo, cuando escribo un correo, elijo Lector o Editor y confirmo, entonces veo el progreso, el éxito y a la persona en la lista sin recargar la página.
- **CA-3** (HU-1, RF-16) — error: Dado cada error de la API (destinatario no encontrado, mi propio correo, nivel inválido, nodo no encontrado, cuenta en solo lectura, demasiados intentos), cuando ocurre, entonces veo el mensaje de la 012 §6 con la acción correctiva (reintentar, corregir el correo, renovar el plan o esperar el tiempo indicado) y conservo lo escrito.
- **CA-4** (HU-3, RF-16) Dado una persona con acceso directo, cuando cambio su nivel en la lista, entonces se aplica y la lista muestra el nuevo; en solo lectura solo se ofrece bajar a Lector.
- **CA-5** (HU-3, RF-18) Dado un acceso directo, cuando elijo «Quitar acceso» y confirmo, entonces desaparece de la lista; un acceso heredado no tiene ese botón y dice desde qué carpeta se quita.
- **CA-6** (HU-4, RF-05) Dado un nodo compartido conmigo, cuando abro su menú, entonces no veo «Compartir» ni «Accesos» (y Lector tampoco ve las acciones de escritura); la barrera real es el servidor (012 CA-14).
- **CA-7** (RNF-13, RNF-14) Dado el diálogo a 360 y 1440 px, cuando lo uso con teclado y lector de pantalla, entonces el foco entra y sale bien, los estados se anuncian, el contraste es AA, la espera de más de 2 s muestra progreso y axe no marca violaciones serias.

## 4. Reglas de negocio
- **RN-1** La interfaz no decide permisos: oculta acciones según el nivel que la API devuelve, y todo se vuelve a validar en el servidor.
- **RN-2** Los textos salen del catálogo por `code` de la API, en español y tuteo; el correo escrito no se guarda fuera del formulario.

## 5. Seguridad y privacidad
- **Toca datos de un cliente: sí**, pero solo los que la 012 ya protege; esta spec no agrega consultas. Sin pruebas de aislamiento propias: las de la 012 cubren el servidor.
- Los correos de otras personas se muestran solo al propietario del nodo; no van a la URL, al almacenamiento local ni a registros del navegador. Los roles internos no llegan a esta pantalla (003 D-5).

## 6. Experiencia de usuario
| Pantalla | Mockup (`docs/design/mockups/…`) | Estados requeridos | Estado del mockup |
|---|---|---|---|
| Compartir y accesos (`ui-guidelines.md` §7, fila «Compartir y accesos») | `sharing/compartir/` | default, lista-accesos, cargando, vacía, compartiendo, éxito, nivel cambiado, destinatario no encontrado, contigo mismo, solo lectura, demasiados intentos, confirmar quitar, quitando, acceso heredado, error de carga | Borrador (solo `default`); el resto lo crea `/mockup` antes de `Lista` |

- Mensajes clave: los de la 012 §6, más «Viene de «<carpeta>». Quita el acceso desde esa carpeta.» y «Quitamos el acceso. Esa persona ya no puede abrirlo.»
- El mockup actual incluye la sección «Enlace público»: no se implementa aquí (013).

## 7. Fuera de alcance
- Enlaces públicos (013) y cualquier aviso al destinatario.
- La vista «Compartidos conmigo» y «Salir», mientras P-1 no se resuelva.
- Historial de versiones y autoría para destinatarios (PD-139).

## 8. Supuestos
- **S-1** El diálogo es un modal sobre el explorador y la ficha, hecho con los componentes de `components/nimbo/`; sin color escrito a mano.
- **S-2** La sección «Enlace público» del mockup queda oculta hasta la 013.

## 9. Preguntas
- [ABIERTA] P-1 ¿La vista «Compartidos conmigo» (y «Salir», que la 010 RN-6 menciona) entra en esta spec, es otra spec o se descarta? No hay RF que la pida, pero el layout firmado tiene el ítem y, sin ella, el destinatario solo llega a lo compartido por enlace directo, búsqueda (018) o cita del agente. Cambia el alcance (segunda pantalla, una ruta más en la API) — bloquea: sí
- [ABIERTA] P-2 ¿La sección «Enlace público» se oculta hasta la 013 (S-2) o se muestra deshabilitada con «Próximamente»? — bloquea: no

## 10. Registro de cambios
| Fecha | Cambio | Motivo | Aprobó |
|---|---|---|---|
| 2026-10-30 | Creación en `Borrador` al partir la 012 (API) de la pantalla; sin plan ni tareas por P-1 | Más de una pantalla y de 12 archivos en la 012 original | Pendiente (Adrián) |
