# Spec 012b — Diálogo «Compartir», lista de accesos y «Compartidos conmigo» (web)

> Qué y por qué, en ≤ 150 líneas. El cómo está en `./plan.md`.

| Campo | Valor |
|---|---|
| Estado | Lista (plan y mockup aprobados por Adrián, 2026-10-30) |
| Dueño | Fátima |
| Fase | 2 |
| Requisitos | RF-16, RF-18; RNF-13, RNF-14 |
| Depende de | 012 (API, incluidos CA-22 y CA-23), 000b (sistema de diseño), 006 (explorador) |
| Última actualización | 2026-10-30 |

## 1. Contexto y objetivo
La 012 entrega la API de compartición. Esta spec le pone las pantallas: (a) un diálogo «Compartir» que se abre desde el
explorador y la ficha de un archivo o carpeta propios, donde el propietario escribe un correo, elige Lector o Editor,
ve quién tiene acceso (directo o heredado) y revoca; (b) la vista «Compartidos conmigo» del menú lateral, donde el
destinatario ve lo que le compartieron, lo abre y sale de ello. Los enlaces públicos son la 013.

## 2. Historias de usuario
- **HU-1** Como propietario, quiero compartir desde el menú de un archivo o carpeta, para no salir del explorador.
- **HU-2** Como propietario, quiero ver en el mismo diálogo quién tiene acceso y de dónde le viene, para saber quién lo ve.
- **HU-3** Como propietario, quiero cambiar el nivel de alguien o quitarle el acceso, para ajustar lo que comparto.
- **HU-4** Como destinatario, quiero que la interfaz solo me ofrezca lo que mi nivel permite, para no chocar con errores.
- **HU-5** Como destinatario, quiero ver en un solo lugar lo que me compartieron y abrirlo, para encontrarlo sin buscar un enlace.
- **HU-6** Como destinatario, quiero salir de algo compartido conmigo, para dejar de verlo.

## 3. Criterios de aceptación
> Dado/Cuando/Entonces. Los códigos y reglas de la API son los de la 012; aquí solo lo observable en pantalla.

- **CA-1** (HU-1, HU-2, RF-18) Dado un nodo propio, cuando abro «Compartir», entonces veo el diálogo con el estado de la lista (cargando, vacía o con personas), cada una con nombre, correo, nivel y origen (directo o «Viene de «<carpeta>»»).
- **CA-2** (HU-1, RF-16) Dado el diálogo, cuando escribo un correo, elijo Lector o Editor y confirmo, entonces veo el progreso, el éxito y a la persona en la lista sin recargar la página.
- **CA-3** (HU-1, RF-16) — error: Dado cada error de la API (destinatario no encontrado, mi propio correo, nivel inválido, nodo no encontrado, cuenta en solo lectura, demasiados intentos), cuando ocurre, entonces veo el mensaje de la 012 §6 con la acción correctiva (reintentar, corregir el correo, renovar el plan o esperar el tiempo indicado) y conservo lo escrito.
- **CA-4** (HU-3, RF-16) Dado una persona con acceso directo, cuando cambio su nivel en la lista, entonces se aplica y la lista muestra el nuevo; en solo lectura solo se ofrece bajar a Lector.
- **CA-5** (HU-3, RF-18) Dado un acceso directo, cuando elijo «Quitar acceso» y confirmo, entonces desaparece de la lista; un acceso heredado no tiene ese botón y dice desde qué carpeta se quita.
- **CA-6** (HU-4, RF-05) Dado un nodo compartido conmigo, cuando abro su menú, entonces no veo «Compartir» ni «Accesos» ni acciones de escritura (Editor solo edita un `.docx`; Lector abre y descarga: 012 CA-14); la barrera real es el servidor (012 CA-14).
- **CA-7** (RNF-13, RNF-14) Dado el diálogo y la vista «Compartidos conmigo» a 360 y 1440 px, cuando los uso con teclado y lector de pantalla, entonces el foco entra y sale bien, los estados se anuncian, el contraste es AA, la espera de más de 2 s muestra progreso y axe no marca violaciones serias.
- **CA-8** (HU-5, RF-16) Dado que tengo accesos directos vigentes, cuando abro «Compartidos conmigo» en el menú lateral, entonces veo el estado de la lista (cargando, vacía con un texto que explica cómo llegan los elementos, o con elementos) y, por elemento, nombre, tipo, quién lo compartió, mi nivel y fecha.
- **CA-9** (HU-5, RF-16) Dado un elemento de la lista, cuando lo abro, entonces una carpeta muestra su contenido con las migas empezando en ella y un archivo muestra su ficha, ambos con las acciones que mi nivel permite (CA-6).
- **CA-10** (HU-6, RF-16) Dado un elemento de la lista, cuando elijo «Salir» y confirmo, entonces veo el progreso y el éxito, el elemento desaparece sin recargar y ya no lo alcanzo; puedo salir aunque mi cuenta esté en solo lectura.
- **CA-11** (HU-5, HU-6) — error: Dado que la lista no carga, o que salir falla (acceso ya inexistente, sin conexión, demasiados intentos), cuando ocurre, entonces veo el mensaje por `code` con su acción («Reintentar» o «Actualizar lista») y la lista no queda a medias.

## 4. Reglas de negocio
- **RN-1** La interfaz no decide permisos: oculta acciones según el nivel que la API devuelve (012 `accessLevel`), y todo se vuelve a validar en el servidor.
- **RN-2** Los textos salen del catálogo por `code` de la API, en español y tuteo; el correo escrito no se guarda fuera del formulario.
- **RN-3** «Compartidos conmigo» lista solo accesos directos (los de CA-22 de la 012); lo heredado se alcanza abriendo la carpeta. Salir quita mi acceso directo, no borra nada del propietario.

## 5. Seguridad y privacidad
- **Toca datos de un cliente: sí**, pero solo los que la 012 ya protege; esta spec no agrega consultas. Sin pruebas de aislamiento propias: las de la 012 (CA-21, CA-22, CA-23) cubren el servidor.
- Los correos de otras personas se muestran solo al propietario del nodo; no van a la URL, al almacenamiento local ni a registros del navegador. «Compartidos conmigo» muestra al destinatario el nombre visible de quien compartió, nunca su correo. Los nombres de archivos no van a registros. Los roles internos no llegan a estas pantallas (003 D-5).

## 6. Experiencia de usuario
| Pantalla | Mockup (`docs/design/mockups/…`) | Estados requeridos | Estado del mockup |
|---|---|---|---|
| Compartir y accesos (`ui-guidelines.md` §7, fila «Compartir y accesos») | `sharing/compartir/` | default, lista-accesos, cargando, vacía, compartiendo, éxito, nivel cambiado, destinatario no encontrado, contigo mismo, solo lectura, demasiados intentos, confirmar quitar, quitando, acceso heredado, error de carga | Borrador (solo `default`); el resto lo crea `/mockup` antes de `Lista` |
| Compartidos conmigo (`/compartidos`; fila en §7) | `sharing/compartidos-conmigo/` | cargando, con-elementos, vacía, error-carga, menu-fila, confirmar-salir, saliendo, salió, error-salir (acceso ya inexistente, sin conexión), solo-lectura (puede salir) | Hecho, aprobado por Adrián (2026-10-30) (11 archivos, uno por estado; el ítem del menú ya está en `shared/layout/`) |

- Mapeo CA → estados: CA-1/2 lista-accesos, cargando, vacía, compartiendo, éxito · CA-3 un estado por error · CA-4 nivel cambiado, solo lectura · CA-5 confirmar quitar, quitando, acceso heredado · CA-8 cargando, con-elementos, vacía · CA-10 confirmar-salir, saliendo, salió, solo-lectura · CA-11 error-carga, error-salir.
- Mensajes clave: los de la 012 §6, más «Viene de «<carpeta>». Quita el acceso desde esa carpeta.», «Quitamos el acceso. Esa persona ya no puede abrirlo.», «Todavía no te han compartido nada. Lo que compartan contigo aparecerá aquí.», «¿Salir de «<nombre>»? Dejarás de verlo. Quien lo compartió puede volver a compartírtelo.» y «Saliste de «<nombre>».»
- El mockup actual incluye la sección «Enlace público»: no se implementa aquí (013).

## 7. Fuera de alcance
- Enlaces públicos (013) y cualquier aviso al destinatario (PD-138).
- Salir desde dentro de la carpeta compartida o desde la ficha: solo desde «Compartidos conmigo».
- Ordenar, filtrar o paginar «Compartidos conmigo», y ver accesos heredados en ella.
- Historial de versiones y autoría para destinatarios (PD-139).

## 8. Supuestos
- **S-1** El diálogo es un modal sobre el explorador y la ficha, hecho con los componentes de `components/nimbo/`; sin color escrito a mano.
- **S-2** La sección «Enlace público» del mockup queda oculta hasta la 013.
- **S-3** «Compartidos conmigo» es una página `/compartidos` del layout del Cliente que reutiliza el ítem existente del menú lateral y las filas del explorador; la lista sale más reciente primero y sin paginar (012 S-8).
- **S-4** El destinatario abre lo compartido con las rutas del explorador y la ficha de la 006 (`/archivos/carpeta/:id`, `/archivos/archivo/:id`).

## 9. Preguntas
- [ABIERTA] P-2 ¿La sección «Enlace público» se oculta hasta la 013 (S-2) o se muestra deshabilitada con «Próximamente»? — bloquea: no
- [RESUELTA 2026-10-30: sí, se crea el mockup; bloquea `Lista` hasta que Adrián lo apruebe] P-3 ¿Se crea mockup (`/mockup`) para «Compartidos conmigo» o se usan patrones existentes (tabla del explorador)? §7 de `ui-guidelines.md` no tiene su fila. Recomendación: mockup con los 10 estados de §6 antes de `Lista`. No cambia el plan, que es el mismo en ambos casos — bloquea: sí (la pantalla; bloquea `Lista`, no el plan)
- [RESUELTA 2026-10-30: entra en esta spec, Adrián] P-1 ¿La vista «Compartidos conmigo» y «Salir» (010 RN-6) entran? Su API es la 012 CA-22 y CA-23.

## 10. Registro de cambios
| Fecha | Cambio | Motivo | Aprobó |
|---|---|---|---|
| 2026-10-30 | Creación en `Borrador` al partir la 012 (API) de la pantalla; sin plan ni tareas por P-1 | Más de una pantalla y de 12 archivos en la 012 original | Pendiente (Adrián) |
| 2026-10-30 | P-1 resuelta: «Compartidos conmigo» y «Salir» entran. HU-5, HU-6, CA-8 a CA-11, RN-3, S-3, S-4, segunda pantalla en §6 y P-3; CA-7 cubre ambas pantallas; plan y tareas creados | Decisión de Adrián (dueño de los módulos y aprobador) | Adrián (decisión); plan por aprobar |
