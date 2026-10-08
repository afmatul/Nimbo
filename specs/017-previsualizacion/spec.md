# Spec 017 — Previsualización

> Qué y por qué. Lista: no quedan preguntas abiertas. ADR-0027 (`inline` solo en vista) queda Rechazado: la vista usa la misma disposición forzada de 005 y se respeta IX.7 literalmente. Spec aprobada por Adrián (2026-10-06).

| Campo | Valor |
|---|---|
| Estado | Lista |
| Dueño | Abel |
| Fase | 2 |
| Requisitos | RF-27 (principal, Debería); RF-05, RF-09 y RNF-05, RNF-06, RNF-07, RNF-09, RNF-13, RNF-14, RNF-17 (restricciones transversales) |
| Depende de | 005 — carga-y-descarga |
| Hallazgo relacionado | Al integrar la 017, DF-15 queda parcial: se acepta `PreviewService`. El resto del hallazgo sigue abierto |
| Última actualización | 2026-10-06 |

## 1. Contexto y objetivo
La descarga de 005 permite recuperar un archivo, pero no consultarlo mediante una vista previa.
RF-27 pide previsualizar PDF, XLSX, PPTX, texto e imagen para que el cliente consulte su contenido sin editarlo.
Esta spec define esa lectura, sus errores y las garantías de privacidad; no amplía permisos ni sustituye la descarga.
DOCX no forma parte del alcance de 017.
Fuentes: `product-context.md` §2–4, §6–7; 005 CA-13/14/16/17; constitución IX/XII/XIII, ADR-0005; [ADR-0027 (Rechazado)](../../docs/adr/0027-inline-solo-en-previsualizacion-aislada.md) descartó `inline` en vista.

## 2. Historias de usuario
- **HU-1** Como cliente con acceso a un archivo, quiero consultar su vista previa para reconocer su contenido sin modificarlo.
- **HU-2** Como cliente, quiero conocer el estado y los problemas de la vista previa para saber cómo continuar.
- **HU-3** Como cliente, quiero que mis vistas previas respeten mis permisos para no exponer mi contenido a terceros ni a roles internos.

## 3. Criterios de aceptación
- **CA-1** (HU-1, RF-27) Dado un archivo propio PDF, XLSX, PPTX, TXT, MD o imagen PNG, JPG, JPEG, GIF o WebP, cuando el cliente lo previsualiza, entonces ve el contenido en solo lectura, sin modificar el original ni generar una versión. PDF: todas las páginas, sin ejecutar JavaScript del PDF. Imagen: el archivo tal cual. TXT y MD: el texto literal, sin convertir Markdown a HTML. XLSX: los valores de cada hoja, sin recalcular fórmulas. PPTX: el texto de cada diapositiva, sin animaciones. Un archivo válido sin páginas, hojas o diapositivas muestra «Este archivo no tiene contenido para mostrar.» y ofrece Descargar.
- **CA-2** (HU-2, RF-27, RNF-14) Dado un archivo propio no previsualizable, corrupto o protegido con contraseña, cuando se pide la vista, entonces se informa la causa y se ofrece Descargar y Reintentar. El original no cambia. No se inventa un límite de tamaño distinto del de la carga.
- **CA-3** (HU-3, RF-05, RNF-05) Dada una solicitud sin sesión válida, cuando se pide una vista previa, entonces responde `401 SHARED_UNAUTHENTICATED` y no entrega contenido.
- **CA-4** (HU-3, RF-05, RNF-05) Dado un Administrador, Soporte u Operador, cuando intenta previsualizar un archivo de cliente, entonces responde `403 SHARED_FORBIDDEN`, sin contenido ni medios para acceder a él, aunque conozca el identificador.
- **CA-5** (HU-3, RF-05, RNF-05) Dados dos clientes distintos sin acceso compartido, cuando uno solicita la vista previa del archivo del otro o de uno inexistente, entonces recibe respuestas indistinguibles salvo el identificador de correlación, sin contenido ni metadatos del archivo ajeno.
- **CA-6** (HU-1, RF-27) Dado el propietario de un archivo previsualizable en el plan Personal, cuando pide la vista, entonces la consulta sin que se le exija cambiar de plan y sin controles de edición.
- **CA-7** (HU-2, RF-27, RNF-09) Dada la indisponibilidad de la vista previa, cuando el cliente continúa usando sus archivos, entonces puede seguir navegando, cargando y descargando según sus permisos y límites vigentes.
- **CA-8** (HU-1, RF-09, RNF-06, RNF-07) Dado un archivo descargable, cuando el cliente lo descarga después de introducir la vista previa, entonces se conservan las garantías de 005: original íntegro, enlace de cinco minutos a un objeto, origen aislado y descarga forzada.
- **CA-9** (HU-2, RNF-13, RNF-14) Dado el visor y sus estados, cuando se usa con teclado a 360 y 1440 px, entonces la interfaz está en español, tiene contraste AA y foco visible, muestra progreso si tarda más de dos segundos y errores con acción correctiva.
- **CA-10** (HU-3, RNF-17) Dadas solicitudes de vista previa exitosas y fallidas, cuando se inspeccionan sus bitácoras, entonces todas las entradas llevan identificador de correlación y ninguna contiene contenido, nombres de archivo, contraseñas, tokens, claves ni URLs firmadas.
- **CA-11** (HU-1, RNF-06, RNF-07) Dado un archivo previsualizable del propietario, cuando pide la vista, entonces recibe, por un endpoint propio, una URL distinta de la de descarga: 5 minutos, un solo objeto, host de objetos aislado de la web y de la API y sin cookies de la app, con la misma disposición forzada de 005 (`Content-Disposition: attachment`, `application/octet-stream`, `no-store`). Los bytes no pasan por la API ni por el origen de la web. DOCX, `otro` y SVG no reciben URL de vista.
- **CA-12** (RNF-07) Dado un cliente que supera el límite de emisión de URLs de vista, cuando repite la solicitud, entonces recibe `429 STORAGE_TOO_MANY_REQUESTS` con `Retry-After` y «Hiciste demasiadas solicitudes. Espera un momento e inténtalo de nuevo.», con clave distinta de la de descarga (`storage:preview-url:`).

## 4. Reglas de negocio
- **RN-1** Previsualizar es leer, nunca editar. RF-27 cubre PDF, XLSX, PPTX, TXT, MD e imágenes PNG/JPG/JPEG/GIF/WebP. DOCX y la categoría «otros» quedan fuera del alcance de 017; SVG, BMP y HEIC no tienen vista previa.
- **RN-2** El acceso nace de la propiedad o de un permiso de lectura ya existente, nunca del rol interno. Esta spec no crea ni modifica mecanismos de compartición.
- **RN-3** No se introduce una cuota, tarifa o restricción comercial de previsualización: el catálogo no las define.
- **RN-4** El lector se elige por el tipo (`archivo.tipo`) validado por 005. Si el contenido no coincide (p. ej. un PDF renombrado a imagen), la vista falla como «corrupto» y ofrece Descargar. Ni una extensión alterada ni una falla de visualización permiten cambiar permisos o modificar el original.
- **RN-5** La lectura incluye PDF escaneados sin capa de texto; no depende de indexación ni añade OCR. Los límites de carga de 005 no se convierten por suposición en límites nuevos de vista previa.
- **RN-6** El plan no agrega la columna `tipo_mime`. El tipo sale de `archivo.tipo`; la respuesta de vista no lleva MIME.

## 5. Seguridad y privacidad
- **Sí toca contenido de clientes:** la vista previa debe impedir acceso entre clientes distintos y acceso de Administrador, Soporte u Operador al contenido de clientes (CA-3 a CA-5).
- La autorización limita los datos antes de entregarlos, conforme a RF-05, RNF-05 y ADR-0005; ocultar controles o filtrar después no concede acceso.
- Los roles internos nunca reciben contenido ni vistas previas; el estado «sin permiso» no revela datos del recurso.
- Se mantiene el origen aislado de la constitución IX y RNF-07. La descarga y la URL de vista conservan `Content-Disposition: attachment` y `Content-Type: application/octet-stream`.
- IX.7 se respeta literalmente: el navegador nunca navega a la URL; el visor obtiene los bytes con `fetch` sin credenciales y los renderiza él mismo. [ADR-0027 (Rechazado)](../../docs/adr/0027-inline-solo-en-previsualizacion-aislada.md) (`inline` en vista) queda descartado por esta decisión (opción 4).
- Las bitácoras excluyen contenido, nombres, credenciales, claves de enlace/objeto y URLs firmadas (CA-10), también en errores.

## 6. Experiencia de usuario
- «Previsualizar» es el primer ítem del menú de fila cuando `archivo.tipo` es `pdf`, `xlsx`, `pptx`, `texto` o `imagen`. Abre una pantalla propia dentro del layout de la app, a 360 y 1440 px.
- Volver regresa a la carpeta de origen y devuelve el foco a esa fila.
- Descargar permanece en el menú y en el visor, y sigue usando la URL de `attachment`.
- Estados: cargando con espera larga visible; éxito de PDF, imagen, texto, XLSX y PPTX en solo lectura; sin contenido visible; no disponible; error con causa y acciones Reintentar y Descargar; y no encontrado.
- Ajeno e inexistente comparten la pantalla de no encontrado y no muestran el nombre.
- No hay estado de límite del plan.
- Mockup: `docs/design/mockups/storage/vista-previa/`. Lo hace Adrián.

## 7. Fuera de alcance
- Previsualización de DOCX. Su lectura en solo lectura, incluido el plan Personal, la cubre la 016 con ONLYOFFICE. Esta spec no cambia ese derecho.
- Edición, colaboración o guardado de documentos; edición de XLSX/PPTX.
- Crear o modificar comparticiones, enlaces públicos o previsualización anónima.
- Historial/restauración, búsqueda, indexación, OCR u optimización.
- Cambiar carga, descarga, cuotas, catálogo comercial, autorización o ciclo de suscripciones existentes.
- La 010 debe conservar la vista previa cuando la cuenta pase a solo lectura por vencimiento.
- Elegir tecnología, librerías, contratos, persistencia o procesos; corresponde al plan y a su ADR de motores de previsualización.

## 8. Preguntas
- **P-1 [RESUELTA] — bloquea: no.** La vista previa usa una URL distinta de descarga, de 5 minutos y un solo objeto, en origen aislado, con la misma disposición forzada de 005 (`attachment`, `application/octet-stream`). Reemplazada el 2026-10-06 (opción 4): ya no hay `inline` ni MIME de vista; ADR-0027 queda Rechazado y PD-74 deja de ser necesario.
- **P-3 [RESUELTA] — bloquea: no.** Se crea el mockup en `docs/design/mockups/storage/vista-previa/`. Lo hace Adrián. No se reutiliza el explorador ni otra pantalla como visor; el layout de la app sí se reutiliza.
- **P-4 [RESUELTA] — bloquea: no.** «Imágenes» en RF-27 corresponde a PNG, JPG/JPEG, GIF y WebP. SVG, BMP y HEIC quedan como no previsualizables.
- **P-5 [RESUELTA] — bloquea: no.** Se fija la cobertura y comportamiento observable por formato en CA-1 y CA-2: PDF completo sin JavaScript, imagen tal cual, TXT/MD literal, XLSX por valores de cada hoja sin recalcular, PPTX por texto de cada diapositiva sin animaciones, y tratamiento explícito de vacío/corrupción/protección sin límite adicional de tamaño.
- **P-6 [RESUELTA] — bloquea: no.** DOCX no forma parte de 017. Su lectura en solo lectura, incluido Personal, corresponde a 016 con ONLYOFFICE.

## 9. Registro de cambios
| Fecha | Cambio | Motivo | Aprobó |
|---|---|---|---|
| 2026-10-04 | Creación del borrador 017 con CA, restricciones y preguntas | Especificar RF-27 usando el número reservado; sin plan, tareas ni código | Pendiente de Adrián |
| 2026-10-04 | Segunda pasada: consolidar CA y retirar preguntas técnicas de implementación | Ajustar al QUÉ/POR QUÉ y a la plantilla | Pendiente de Adrián |
| 2026-10-04 | Revisión de alcance: DOCX sale de 017; se eliminan referencias a specs no dependientes y CA-7 queda limitado a indisponibilidad de preview | Aplicar hallazgos de revisión y mantener solo la dependencia directa 005 | Pendiente de Adrián |
| 2026-10-04 | Revisión de Matul: se resuelven P-1, P-3, P-4, P-5 y P-6; se fijan CA-11/12, cobertura por formato, rechazos, rate limit, DF-15 y UX | Dejar la spec sin preguntas abiertas; el ADR de IX.7 queda pendiente antes de `/plan 017`, sin crear plan ni código | Pendiente de Adrián |
| 2026-10-04 | Pendiente para 016: al redactarla debe incluir la apertura DOCX en solo lectura, incluido Personal, mediante ONLYOFFICE | Mantener trazabilidad de la lectura DOCX fuera de 017 | Pendiente de Adrián |
| 2026-10-06 | Registrar y enlazar ADR-0027 (Propuesto) y PD-74; explicitar la tensión literal con IX.7 y la aceptación pendiente | Documentar `inline` solo para la URL temporal de vista aislada antes de `/plan 017`, preservando descarga de 005 | Pendiente del equipo (IX.7) y de Adrián (spec) |
| 2026-10-06 | Spec y plan aprobados; estado `Lista` | Aprobación registrada en plan §8 (G-4) | Adrián |
| 2026-10-06 | CA-11 reescrito (opción 4): URL de vista con la misma política de 005 (`attachment`, `application/octet-stream`, `no-store`); sin `inline`, sin MIME, sin excepción a IX.7; ADR-0027 Rechazado; RN-4/RN-6 ajustados | El visor lee con `fetch` y renderiza; el navegador no navega a la URL, así que `inline`/MIME no aportan | Adrián |
