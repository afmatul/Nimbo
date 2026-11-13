# Checklist de la demo: del editor a los compartidos

> Recorrido para comprobar que Nimbo funciona de punta a punta y que lo que mostramos coincide con los mockups
> aprobados. Estado de cada ítem: `[ ]` pendiente · `[x]` bien · `[!]` falla (ver «Hallazgos»).
> Primer recorrido: 2026-11-12, sobre `main` (`802799bd`), en local con ONLYOFFICE, automatizado con Playwright
> (`docs/design/mockups/_generadores/pw/comparar-estados.mjs`) más una revisión visual de las capturas.
> Última revisión del inventario de mockups: `ui-guidelines.md` §7 (2026-11-12).

## 0. Preparación

- Node 22 (`fnm use 22`), Docker Desktop abierto, `.env` copiado de `.env.example`.
- `pnpm start:all --onlyoffice` (la primera vez baja la imagen de ONLYOFFICE, varios minutos; la web sale en `:3002` solo después).
- Cuentas: **A** (propietaria, plan Pro Yo o Institucional), **B** (otro correo, para compartir y coeditar), **C** (plan Personal).
  El correo de verificación llega a Mailpit. Los pagos usan tarjeta de prueba `4242 4242 4242 4242`.
- Ojo con el límite de inicio de sesión: 20 intentos por IP cada 15 min. Si lo superas, la web muestra «Hiciste demasiados intentos»
  hasta que pase la ventana. Un navegador entra por Traefik (`localhost:80`) y cuenta aparte de `curl` a `:3000`.

| Servicio    | URL                      |
| ----------- | ------------------------ |
| Web         | `http://localhost:3002`  |
| API         | `http://localhost:3000/api/v1` |
| Mailpit     | `http://localhost:8025`  |
| ONLYOFFICE  | `http://localhost/docs`  |

- [x] Contenedores sanos y migraciones sin error. Grafana reinicia en bucle si faltan sus variables en `.env` (H-8); no afecta la demo.
- [x] La web carga en `:3002`, la API responde y `localhost/docs` responde.

## 1. Cuenta y archivos

- [x] Registro, correo en Mailpit, verificación e inicio de sesión; la cuota aparece en la barra lateral.
- [x] Pago de plan (Pro Yo) aprobado; la cuota pasa de 16,1 GB a 107,4 GB.
- [x] Subida de un `.docx` con progreso.
- [ ] Subir un PDF y un nombre repetido («Reemplazar (nueva versión)»).
- [ ] Explorador en lista y cuadrícula; mover a la papelera y restaurar.

## 2. Editor `.docx` (spec 016, `/editor/[fileId]`)

- [x] A abre el `.docx` en modo edición y lo que escribe se ve (CA-1).
- [x] Con A y B a la vez: «2 de 3 editores» y B con su nombre real (CA-6); al cerrar la pestaña desaparece en ~5 s (CA-8).
- [x] Al cerrar todos queda una versión nueva «Edición» (CA-9) y el historial muestra el tamaño y el límite del plan.
- [!] La versión muestra a todos los participantes (RN-5): solo muestra «Tú» (H-4).
- [ ] Cerrar sin cambios no crea versión (CA-11); restaurar una versión anterior.
- [x] Lector: «Solo lectura» (CA-3). Cuenta C (Personal): «Tu plan no incluye edición» (CA-5).
- [ ] Archivo que no es `.docx` no abre el editor (CA-4); máximo de editores del plan (CA-7).
- [x] ONLYOFFICE apagado: «El editor no está disponible» con «Reintentar», y «Mis archivos» sigue funcionando (CA-15). Difiere del mockup (H-2).
- [ ] Un usuario interno (Admin, Soporte u Operador) no abre el contenido (CA-17).

## 3. Compartir (012 y 012b, diálogo «Compartir» y `/compartidos`)

- [x] Compartir con B como Editor; B lo ve en «Compartidos conmigo» (`/compartidos`).
- [x] B como Editor coedita el `.docx` de A.
- [x] Cambiar el nivel de Editor a Lector (selector de la fila) y que B abra en solo lectura.
- [x] Quitar acceso: confirmación «¿Quitar el acceso de …?».
- [ ] Con acceso retirado, B recibe «no existe» y, si estaba editando, sale de la sala (CA-16).
- [x] Menú de fila y confirmación de «Salir» en `/compartidos`; estado vacío.
- [ ] «Salir» confirmado y mensaje «Saliste de…».

## 4. Enlace público (013, 013b y 013c)

- [x] Formulario: «Vence en» 1, 7 o 30 días con 7 marcado; contraseña corta muestra «Escribe una contraseña de 8 a 128 caracteres.».
- [x] La URL solo se ve al generar («Cópialo ahora…»); «Copiar enlace» pasa a «Enlace copiado».
- [x] Enlace existente: «Activo», sin URL, «Generar otro enlace» (confirmación en línea) y «Revocar enlace» (confirmación en línea).
- [x] Sin cuenta, `/enlace#token` muestra la ficha y descarga; con contraseña mala, «La contraseña no es correcta».
- [x] Tras 6 intentos fallidos: «Hubo demasiados intentos con este enlace. Espera 15 minutos…».
- [x] Revocado: «Revocamos el enlace…»; el visitante ve «Este enlace ya no está disponible».
- [ ] Una carpeta no muestra la sección «Enlace público»; lector con enlace y sin enlace (solo lectura).
- [ ] «Mi actividad» muestra «Alguien con el enlace» y la bitácora no filtra nombres de archivo, tokens ni claves.

## 5. Transversal

- [x] Los 23 estados recorridos coinciden con su mockup a 360 px y a 1440 px en estructura y textos (salvo H-2, H-3 y los datos de ejemplo).
- [ ] Teclado y foco visible en los diálogos; suscripción vencida con `ReadOnlyBanner`.
- [ ] Indexación, agente y búsqueda por contenido (H-5).

## 6. Mockups: lo que prometimos vs lo que se ve

Método: `node docs/design/mockups/_generadores/pw/comparar-estados.mjs --ancho 1440` (y `--ancho 360`) deja
`informe-<ancho>.html` con la pantalla real y la captura aprobada lado a lado, más los textos del mockup que no aparecen.

| Pantalla                       | Mockup                         | Estados comparados (de los aprobados)                                  | Resultado        |
| ------------------------------ | ------------------------------ | ---------------------------------------------------------------------- | ---------------- |
| Compartir + sección del enlace | `sharing/compartir/`           | 10 de 24: sin-enlace, formulario, contraseña-inválida, generado, copiado, activo, confirmar-reemplazo, confirmar-revocar, revocado | Coincide |
| Página del visitante           | `sharing/enlace-publico/`      | 6 de 11: con-contraseña, incorrecta, bloqueado, sin-contraseña, descarga-iniciada, no-disponible | Coincide |
| Compartidos conmigo            | `sharing/compartidos-conmigo/` | 4 de 11: con-elementos, menu-fila, confirmar-salir, vacia              | Coincide         |
| Editor `.docx`                 | `editing/editor/`              | 4 de 10: coeditando, solo-lectura-plan, solo-lectura-lector, no-disponible | **Difiere** (H-1, H-2, H-3) |
| Mi actividad                   | `audit/mi-actividad/`          | sin comparar                                                           | [ ]              |

Sin comparar todavía (hay que provocar el estado): cargando, error de carga, `429` al generar, enlace vencido, copia fallida,
carpeta, solo lectura con y sin enlace, `limite-editores`, `guardado-fallido`, los demás `solo-lectura-*` del editor, y
`cargando`, `error-carga`, `saliendo`, `salio`, `error-salir-*`, `solo-lectura` de «Compartidos conmigo».

Puntos abiertos antes de la exposición:

- [ ] **Propuesta vs aprobado.** `editor--editando.html` y `compartir.html` (propuesta, p. 14; enlace, p. 15) son solo
      referencia; lo implementado sigue los mockups corregidos. Decidir cuál se muestra (recomendado: los corregidos).
- [ ] **Inventario desactualizado.** La fila «Compartir y accesos» (012) de `ui-guidelines.md` §7 sigue en
      `Borrador (default)`, y el diálogo de 012b («Personas con acceso») no tiene un `compartir--lista-accesos.html` propio.
- [ ] **Specs «En revisión» con código ya en `main`:** 014, 015 y 016. Actualizar su estado en `specs/README.md`.

## Hallazgos del recorrido

| #   | Dónde | Qué pasó | Gravedad |
| --- | ----- | -------- | -------- |
| H-1 | Editor, barra superior (todos los estados) | La captura aprobada tiene flecha «volver», nombre con «Versión N · guardada…», presencia con avatares y «N de L editores», y los botones «Compartir» y «Descargar». La app real tiene el logo (que vuelve a Mis archivos), el chip, el nombre y el modo; no tiene versión, «Compartir» ni «Descargar». El comentario de `editor-header.tsx` dice que sigue el mockup. Desde el editor no se puede compartir ni descargar. | Alta (se ve en la demo) |
| H-2 | Editor, `no-disponible` | La real pone «Editor de documentos» en vez del nombre del archivo, y no tiene «Compartir», «Descargar» ni «Volver a Mis archivos». El texto cambió: el mockup dice «Puedes descargar este documento, compartirlo o seguir usando el resto de Nimbo…». | Media |
| H-3 | Editor, `solo-lectura-plan` | El texto de ayuda difiere: mockup «Con el plan Personal puedes ver tus documentos…», real «Puedes ver tus documentos. Para editarlos en línea, y con otras personas, cambia a un plan con edición.». | Baja |
| H-4 | Ficha, «Historial de versiones» | La API de versiones devuelve solo `createdById`, no los participantes; la web pinta «Tú». Con dos personas coeditando, la versión sigue diciendo «Tú». Es el diferenciador «historial con autoría» y ya está como PD-89. Además, el historial lo ve solo el propietario (PD-139). | Alta (diferenciador del producto) |
| H-5 | Indexación | Todo `.docx` queda en «No se pudo indexar» (`indexing.failed`, motivo `proveedor_no_disponible`): el proveedor de embeddings no responde con la configuración local. Sin esto no funcionan el agente con citas ni la búsqueda por contenido. Falta confirmar la clave de Gemini en `.env` y la salida a internet del `worker`. | Alta (si la demo muestra el agente) |
| H-6 | Mockups de «Compartir» | El marco del mockup tiene una barra lateral que la app no tiene («Compartidos conmigo», «Recientes», «Fijados», «Optimizador», «Plan y facturación», carpetas); la real tiene «Compartidos», «Espacio» y «Agente Nimbo». El diálogo en sí coincide. | Baja (documentación) |
| H-7 | Datos de ejemplo | El texto que el script marca como diferente en los demás estados es solo contenido de ejemplo del mockup (nombres, archivos, el texto del documento). No es un defecto. | Informativo |
| H-8 | Entorno | Grafana reinicia en bucle porque `GRAFANA_*` y `ALERT_EMAIL_TO` no están en `.env` local. | Baja (solo local) |
| H-9 | Seguridad (bien) | Al superar 20 inicios de sesión por IP, el servidor responde `429` con `Retry-After`; reutilizar una sesión guardada dispara `identity.session.reuse_detected` y la revoca. Es comportamiento esperado. | Informativo |
