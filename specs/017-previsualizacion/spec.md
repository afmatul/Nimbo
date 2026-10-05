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
DOCX no forma parte del alcance de 017.
Fuentes: `product-context.md` §2–4, §6–7; 005 CA-13/14/16/17; constitución IX/XII/XIII y ADR-0005.
La entrega segura, la interfaz y el alcance por formato siguen pendientes en P-1, P-3, P-4 y P-5; no se autoriza una excepción implícita.

## 2. Historias de usuario
- **HU-1** Como cliente con acceso a un archivo, quiero consultar su vista previa para reconocer su contenido sin modificarlo.
- **HU-2** Como cliente, quiero conocer el estado y los problemas de la vista previa para saber cómo continuar.
- **HU-3** Como cliente, quiero que mis vistas previas respeten mis permisos para no exponer mi contenido a terceros ni a roles internos.

## 3. Criterios de aceptación
> Comportamiento requerido; P-4/P-5 deben concretar los casos de formato antes de aprobar la spec. No son decisiones de implementación.

- **CA-1** (HU-1, RF-27) Dado un archivo propio válido PDF, XLSX, PPTX, TXT, MD o imagen, cuando el cliente lo previsualiza, entonces consulta su contenido en solo lectura, sin modificar el original ni generar versiones; conjunto de imágenes y alcance visible pendientes en P-4/P-5.
- **CA-2** (HU-2, RF-27, RNF-14) Dado un archivo no previsualizable o un fallo al abrirlo, cuando el cliente solicita su vista previa, entonces se informa indisponibilidad o error con causa y acción correctiva, sin alterar el original; los casos concretos quedan pendientes en P-5.
- **CA-3** (HU-3, RF-05, RNF-05) Dada una solicitud sin sesión válida, cuando se pide una vista previa, entonces se rechaza la solicitud y no se entrega contenido.
- **CA-4** (HU-3, RF-05, RNF-05) Dado un Administrador, Soporte u Operador, cuando intenta previsualizar un archivo de cliente, entonces se rechaza el acceso sin contenido ni medios para acceder a él, aunque conozca el identificador.
- **CA-5** (HU-3, RF-05, RNF-05) Dados dos clientes distintos sin acceso compartido, cuando uno solicita la vista previa del archivo del otro o de uno inexistente, entonces recibe respuestas indistinguibles salvo el identificador de correlación, sin contenido ni metadatos del archivo ajeno.
- **CA-6** (HU-1, RF-23, RF-27) Dado un cliente con acceso de lectura y una cuenta Personal o una suscripción vencida en solo lectura, cuando pide una vista previa soportada, entonces puede consultarla sin habilitar edición ni exigir mejorar el plan.
- **CA-7** (HU-2, RF-27, RNF-09) Dada la indisponibilidad de la vista previa, cuando el cliente continúa usando sus archivos, entonces puede seguir navegando, cargando y descargando según sus permisos y límites vigentes.
- **CA-8** (HU-1, RF-09, RNF-06, RNF-07) Dado un archivo descargable, cuando el cliente lo descarga después de introducir la vista previa, entonces se conservan las garantías de 005: original íntegro, enlace de cinco minutos a un objeto, origen aislado y descarga forzada; P-1 no puede relajarlas.
- **CA-9** (HU-2, RNF-13, RNF-14) Dado el visor y sus estados, cuando se usa con teclado a 360 y 1440 px, entonces la interfaz está en español, tiene contraste AA y foco visible, muestra progreso si tarda más de dos segundos y errores con acción correctiva.
- **CA-10** (HU-3, RNF-17) Dadas solicitudes de vista previa exitosas y fallidas, cuando se inspeccionan sus bitácoras, entonces todas las entradas llevan identificador de correlación y ninguna contiene contenido, nombres de archivo, contraseñas, tokens, claves ni URLs firmadas.

## 4. Reglas de negocio
- **RN-1** Previsualizar es leer, nunca editar. RF-27 cubre PDF, XLSX, PPTX, TXT, MD e imágenes. DOCX y la categoría «otros» quedan fuera del alcance de 017.
- **RN-2** El acceso nace de la propiedad o de un permiso de lectura ya existente, nunca del rol interno. Esta spec no crea ni modifica mecanismos de compartición.
- **RN-3** No se introduce una cuota, tarifa o restricción comercial de previsualización: el catálogo no las define. El vencimiento conserva la lectura (RF-23).
- **RN-4** Se respeta el tipo real validado por 005. Ni una extensión alterada ni una falla de visualización permiten cambiar permisos o modificar el original.
- **RN-5** La lectura incluye PDF escaneados sin capa de texto; no depende de indexación ni añade OCR. Los límites de carga de 005 no se convierten por suposición en límites nuevos de vista previa (P-5).

## 5. Seguridad y privacidad
- **Sí toca contenido de clientes:** la vista previa debe impedir acceso entre clientes distintos y acceso de Administrador, Soporte u Operador al contenido de clientes (CA-3 a CA-5).
- La autorización limita los datos antes de entregarlos, conforme a RF-05, RNF-05 y ADR-0005; ocultar controles o filtrar después no concede acceso.
- Los roles internos nunca reciben contenido ni vistas previas; el estado «sin permiso» no revela datos del recurso.
- Se mantienen origen aislado y descarga forzada de la constitución IX y RNF-07. La distinción entre entrega de vista previa y descarga requiere aclaración expresa (P-1); esta spec no aprueba servir contenido activo desde el origen de la aplicación.
- Las bitácoras excluyen contenido, nombres, credenciales, claves de enlace/objeto y URLs firmadas (CA-10), también en errores.

## 6. Experiencia de usuario
> `docs/sdd/ui-guidelines.md` §7 registra la vista previa como `Pendiente`. No existe una decisión aprobada de reutilización para 017; P-3 sigue abierta.

| Pantalla | Mockup (`docs/design/mockups/…`) | Estados | Estado del mockup |
|---|---|---|---|
| Vista previa de PDF, XLSX, PPTX, texto e imagen | `storage/vista-previa/` | cargando, éxito por formato, solo lectura, error con acción correctiva, sin permiso, no disponible | Pendiente |
| Entrada desde Mis archivos | `storage/explorador/` como referencia existente | apertura, retorno y foco por definir | Pendiente de P-3 |

- Español y tuteo, Cielo Sereno, contraste AA, teclado y foco visible.
- No se añade un estado «límite del plan» sin requisito que lo justifique.
- Los mensajes concretos para contenido vacío, documentos corruptos/protegidos y archivos grandes quedan pendientes de P-5.

## 7. Fuera de alcance
- Previsualización de DOCX.
- Edición, colaboración o guardado de documentos; edición de XLSX/PPTX.
- Crear o modificar comparticiones, enlaces públicos o previsualización anónima.
- Historial/restauración, búsqueda, indexación, OCR u optimización.
- Cambiar carga, descarga, cuotas, catálogo comercial, autorización o ciclo de suscripciones existentes.
- Elegir tecnología, librerías, contratos, persistencia o procesos; corresponde al plan cuando se resuelvan las preguntas bloqueantes.

## 8. Preguntas
- **P-1 [ABIERTA] — bloquea: sí.** ¿Cómo se aplica constitución IX.7/RNF-07 a la entrega de previsualizaciones, manteniendo el origen aislado y sin modificar la descarga forzada de 005?
- **P-3 [ABIERTA] — bloquea: sí.** ¿Qué superficie de visor y qué flujo de apertura/retorno deben documentarse en el mockup de 017, incluyendo foco y estados para todos los formatos de RF-27?
- **P-4 [ABIERTA] — bloquea: sí.** ¿«Imágenes» en RF-27 corresponde exactamente a la categoría de 005 —PNG, JPG/JPEG, GIF y WebP—, dejando SVG, BMP y HEIC como «otros» sin vista previa?
- **P-5 [ABIERTA] — bloquea: sí.** ¿Qué cobertura y fidelidad mínima se acepta por formato —páginas PDF, hojas XLSX, diapositivas PPTX, TXT e imágenes—, debe mostrarse MD literal o formateado, y qué resultado, mensaje y acción corresponde ante contenido vacío, documentos corruptos/protegidos o archivos grandes admitidos por 005?
- **P-6 [RESUELTA].** DOCX no forma parte de 017. Su previsualización queda fuera del alcance de esta spec.

## 9. Registro de cambios
| Fecha | Cambio | Motivo | Aprobó |
|---|---|---|---|
| 2026-10-04 | Creación del borrador 017 con CA, restricciones y preguntas | Especificar RF-27 usando el número reservado; sin plan, tareas ni código | Pendiente de Adrián |
| 2026-10-04 | Segunda pasada: consolidar CA y retirar preguntas técnicas de implementación | Ajustar al QUÉ/POR QUÉ y a la plantilla | Pendiente de Adrián |
| 2026-10-04 | Revisión de alcance: DOCX sale de 017; se eliminan referencias a specs no dependientes y CA-7 queda limitado a indisponibilidad de preview | Aplicar hallazgos de revisión y mantener solo la dependencia directa 005 | Pendiente de Adrián |
