# Spec 017 — Previsualización

> Qué y por qué. Borrador: las preguntas bloqueantes deben resolverse antes de `/plan 017`.

| Campo | Valor |
|---|---|
| Estado | Borrador |
| Dueño | Abel |
| Fase | 2 |
| Requisitos | RF-27 (principal, Debería); RF-05, RF-09, RF-23 y RNF-05, RNF-06, RNF-07, RNF-09, RNF-13, RNF-14, RNF-17 (restricciones transversales) |
| Depende de | 005 — carga-y-descarga |
| Hallazgo relacionado | DF-15: vista previa pendiente; esta spec no lo resuelve ni lo da por aceptado |
| Última actualización | 2026-10-04 |

## 1. Contexto y objetivo
La descarga de 005 permite recuperar un archivo, pero no consultarlo mediante una vista previa.
RF-27 pide previsualizar PDF, XLSX, PPTX, texto e imagen para que el cliente consulte su contenido sin editarlo.
Esta spec define esa lectura, sus errores y las garantías de privacidad; no amplía permisos ni sustituye la descarga.
Fuentes: `product-context.md` §2–4, §6–7; 003 D-6 y CA-9/11; 005 CA-13/14/16/17; constitución IX/XII/XIII y ADR-0005.
La entrega segura, la interfaz y el alcance por formato siguen pendientes en P-1, P-3, P-4, P-5 y P-6; no se autoriza una excepción implícita.

## 2. Historias de usuario
- **HU-1** Como cliente con acceso a un archivo, quiero consultar su vista previa para reconocer su contenido sin modificarlo.
- **HU-2** Como cliente, quiero conocer el estado y los problemas de la vista previa para saber cómo continuar.
- **HU-3** Como cliente, quiero que mis vistas previas respeten mis permisos para no exponer mi contenido a terceros ni a roles internos.

## 3. Criterios de aceptación
> Comportamiento requerido; P-4/P-5 deben concretar los casos de formato antes de aprobar la spec. No son decisiones de implementación.

- **CA-1** (HU-1, RF-27) Dado un archivo propio válido PDF, XLSX, PPTX, TXT, MD o imagen, cuando el cliente lo previsualiza, entonces consulta su contenido en solo lectura, sin modificar el original ni generar versiones; conjunto de imágenes y alcance visible pendientes en P-4/P-5.
- **CA-2** (HU-2, RF-27, RNF-14) Dado un archivo propio no previsualizable o un fallo al abrirlo, cuando se solicita su vista previa, entonces se informa indisponibilidad o error, con causa y acción correctiva, sin alterar el original; casos concretos en P-5.
- **CA-3** (HU-3, RF-05, RNF-05) Dada una solicitud sin sesión válida, cuando se pide una vista previa, entonces se recibe el rechazo de autenticación de 003 y ningún contenido.
- **CA-4** (HU-3, RF-05, RNF-05) Dado un Administrador, Soporte u Operador, cuando intenta previsualizar un archivo de cliente, entonces recibe el rechazo por rol de 003, sin contenido ni medios para acceder a él, aunque conozca el identificador.
- **CA-5** (HU-3, RF-05, RNF-05) Dados dos clientes sin compartición, cuando uno solicita la vista del archivo del otro o de uno inexistente, entonces recibe respuestas indistinguibles salvo el identificador de correlación, sin contenido ni metadatos del archivo ajeno.
- **CA-6** (HU-1, RF-23, RF-27) Dado un cliente con acceso de lectura y una cuenta Personal o una suscripción vencida en solo lectura, cuando pide una vista previa soportada, entonces puede consultarla sin habilitar edición ni exigir mejorar el plan.
- **CA-7** (HU-2, RF-27, RNF-09) Dada la indisponibilidad de la vista previa o de indexación, optimización o edición, cuando el cliente usa sus archivos, entonces puede seguir navegando, cargando y descargando según sus permisos y límites vigentes.
- **CA-8** (HU-1, RF-09, RNF-06, RNF-07) Dado un archivo descargable, cuando el cliente lo descarga tras introducir la vista previa, entonces se conservan las garantías de 005: original íntegro, enlace de cinco minutos a un objeto, origen aislado y descarga forzada; P-1 no puede relajarlas.
- **CA-9** (HU-2, RNF-13, RNF-14) Dado el visor y sus estados, cuando se usa con teclado a 360 y 1440 px, entonces la interfaz está en español, tiene contraste AA y foco visible, muestra progreso si tarda más de dos segundos y errores con acción correctiva.
- **CA-10** (HU-3, RNF-17) Dadas solicitudes de vista previa exitosas y fallidas, cuando se inspeccionan sus bitácoras, entonces todas las entradas llevan identificador de correlación y ninguna contiene contenido, nombres de archivo, contraseñas, tokens, claves ni URLs firmadas.

## 4. Reglas de negocio
- **RN-1** Previsualizar es leer, nunca editar. RF-27 cubre PDF, XLSX, PPTX, TXT, MD e imágenes; «otros» no tienen vista previa. El reparto de DOCX está pendiente en P-6.
- **RN-2** El acceso nace de la propiedad o de una compartición explícita, nunca del rol interno. La entrega inicial usa la propiedad disponible con 005; la compartición y su herencia corresponden a 012, no se implementan aquí.
- **RN-3** No se introduce una cuota, tarifa o restricción comercial de previsualización: el catálogo no las define. El vencimiento conserva la lectura (RF-23); no se implementa aquí el ciclo de suscripciones.
- **RN-4** Se respeta el tipo real validado por 005. Ni una extensión alterada ni una falla de visualización permiten cambiar los permisos o modificar el original.
- **RN-5** La lectura incluye PDF escaneados sin capa de texto; no depende de indexación ni añade OCR. Los límites de carga de 005 no se convierten por suposición en límites nuevos de vista previa (P-5).

## 5. Seguridad y privacidad
- **Sí toca contenido de clientes:** requiere pruebas de aislamiento entre dos clientes y frente a los tres roles internos, incluidas solicitudes directas y archivos inexistentes (CA-3 a CA-5).
- La autorización debe limitar los datos antes de recuperarlos, conforme a 003 y ADR-0005; no basta ocultar controles ni filtrar resultados después. No existe suplantación.
- Los roles internos nunca reciben contenido ni vistas previas; el estado «sin permiso» no revela datos del recurso.
- Se mantienen origen aislado y descarga forzada de la constitución IX y RNF-07. La distinción entre entrega de vista previa y descarga requiere aclaración expresa (P-1); esta spec no aprueba servir contenido activo en el origen de la aplicación.
- Auditoría (RF-07): se conserva la auditoría de descargas de 005. La línea base no exige explícitamente eventos propios de previsualización; su definición corresponde al plan, sin declarar RF-07 cubierto aquí.
- Las bitácoras excluyen contenido, nombres, credenciales, claves de enlace/objeto y URLs firmadas (CA-10), también en errores.

## 6. Experiencia de usuario
> `docs/sdd/ui-guidelines.md` §7 registra la vista previa como `Pendiente`, con estados PDF, imagen y no-disponible. No documenta una decisión de reutilización para 017; P-3 sigue abierta.

| Pantalla | Mockup (`docs/design/mockups/…`) | Estados requeridos | Estado del mockup |
|---|---|---|---|
| Vista previa de PDF, XLSX, PPTX, texto e imagen | `storage/vista-previa/` (ruta indicada en el inventario) | Cargando, éxito por formato, solo lectura, error con acción correctiva, sin permiso, no-disponible; vacío por aclarar | Pendiente según el inventario; faltan los demás formatos y estados |
| Entrada desde Mis archivos, por confirmar | `storage/explorador/explorador--{acciones,vacio,cargando,error}.html` | Estados del listado existentes; apertura y retorno del visor pendientes | Borrador de 005; no incluye acción de vista previa |

- Español y tuteo, Cielo Sereno, contraste AA, teclado y foco visible. No se añade un estado «límite del plan» sin requisito que lo justifique.
- Mensajes clave: carga en curso, vista no disponible, error con causa/acción y rechazo sin datos del archivo; textos y acciones concretos pendientes del diseño (P-3/P-5).
- «Vacío» no significa archivo de cero bytes: 005 los rechaza. Su aplicabilidad al contenido visualizable debe aclararse en P-5.

## 7. Fuera de alcance
- Edición, colaboración y guardado de documentos (016); edición de XLSX/PPTX, prohibida por el alcance del producto.
- Implementar comparticiones (012), enlaces públicos (013), previsualización anónima, historial/restauración (014), búsqueda, indexación, OCR u optimización.
- Cambiar cargas, descargas, cuotas, catálogo comercial, políticas de autorización o el ciclo de suscripciones de otras specs.
- Elegir tecnología, librerías, contratos, persistencia o procesos: pertenece al plan, una vez resueltas las preguntas bloqueantes.

## 8. Preguntas
- **P-1 [ABIERTA] — bloquea: sí.** ¿Cómo se compatibiliza la previsualización con constitución IX.7/RNF-07 y 005 CA-14, que exigen origen aislado y descarga forzada? Debe aclararse el comportamiento permitido sin presuponer excepciones a las restricciones de entrega segura.
- **P-3 [ABIERTA] — bloquea: sí.** ¿Se crea mockup (`/mockup`) o se usan patrones existentes? Falta decidir explícitamente la superficie del visor, apertura/retorno, foco y estados para todos los formatos de RF-27, no solo PDF e imagen.
- **P-4 [ABIERTA] — bloquea: sí.** ¿Qué formatos de imagen se exigen? 005 clasifica PNG/JPG/JPEG/GIF/WebP como imágenes y SVG/BMP/HEIC como «otros»; el producto solo dice «imágenes». Confirmar el conjunto sin ampliar silenciosamente 005.
- **P-5 [ABIERTA] — bloquea: sí.** ¿Qué cobertura y fidelidad se aceptan para páginas, hojas y diapositivas, y se muestra MD literal o formateado? Concretar además contenido vacío, documentos corruptos/protegidos y archivos grandes: resultados, mensajes y acciones, sin inventar límites distintos del catálogo.
- **P-6 [ABIERTA] — bloquea: sí.** La matriz de formatos marca DOCX como previsualizable, pero RF-27 no lo enumera. ¿Su lectura forma parte de 017 o queda cubierta por 016? Aclarar esta discrepancia de alcance sin cambiar la lectura permitida en Personal.

## 9. Registro de cambios
| Fecha | Cambio | Motivo | Aprobó |
|---|---|---|---|
| 2026-10-04 | Creación del borrador 017 con CA, restricciones y preguntas | Especificar RF-27 usando el número reservado; sin plan, tareas ni código | Pendiente de Adrián |
| 2026-10-04 | Segunda pasada: consolidar CA-1 a CA-5 en CA-1 y renumerar los restantes; retirar preguntas técnicas y atribución de revisión UI; conservar cinco preguntas bloqueantes con sus IDs | Ajustar al QUÉ/POR QUÉ y a la plantilla, sin resolver preguntas ni cambiar el estado Borrador | Pendiente de Adrián |
