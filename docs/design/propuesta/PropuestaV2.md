Nota de revisión
Esta es la segunda versión de la propuesta entregada el 28 de agosto. La siguiente tabla indica dónde se
realizaron las modificaciones.
Observación Cómo se atendió
Factibilidad del Proyecto Se recortó el alcance en seis puntos concretos, el detalle está en
1.4 y la justificación de cada recorte en 10.4, además, la edición
en línea queda limitada a .docx. El resto de formatos se guarda,
se previsualiza y, según el caso, se indexa, pero no se edita. La
tabla de formatos admitidos está en 6.1.
Descartamos lo que vamos a explorar Se eliminaron las dos líneas de exploración, motor de atribución
párrafo a párrafo y carpetas inteligentes, de todo el documento.
Lo que sí se construye es el historial de versiones con autoría,
que era su base y ahora es un requisito obligatorio (RF-28 y RF-
29).
Ambientes de Prueba y Observabilidad Sí. Se agregó la sección 4 completa: ambientes, estrategia de
pruebas, observabilidad y proceso de despliegue y vuelta atrás,
con siete requisitos no funcionales nuevos (RNF-15 a RNF-21).
Roles Se agregó la sección 7 con la matriz de roles del sistema, la matriz
de permisos por capacidad y los niveles de acceso sobre cada
archivo o carpeta.

1. Descripción de la solución
1.1 El problema
Trabajar en un documento con otras personas hoy significa saltar entre herramientas que no se hablan
entre sí. Los archivos viven en una nube, se editan en otra aplicación, el equipo se coordina por chat, y al
final nadie puede decir con certeza quién escribió qué.
Las nubes que ya existen guardan archivos muy bien, pero ahí se detienen. Como quieren servirle a todo
el mundo, tratan igual un contrato, una foto de vacaciones y una hoja de presupuesto, no saben qué
dice el archivo, rompen el formato cuando lo abres para editarlo y no llevan registro de quién trabajó en
él. Por no asumir nada sobre lo que haces, terminan por no ayudarte a hacerlo.
1.2 La solución
Nimbo es una plataforma de Almacenamiento como Servicio pensada para el trabajo en equipo.
Cualquier persona u organización puede registrarse, contratar un plan y administrar sus archivos desde
el navegador. Tres cosas la separan de una nube común:
• Edición colaborativa de documentos .docx. Varias personas editan a la vez el mismo documento de
Word desde el navegador, sobre el formato original y sin conversiones intermedias que arruinen el
diseño.
• Inteligencia documental. Un agente que indexa el contenido de tus archivos y responde preguntas
citando el archivo y la ubicación exacta de donde salió cada dato.
• Historial de versiones con autoría. Cada sesión de edición genera una versión que queda asociada a
quienes participaron en ella, y cualquiera de esas versiones se puede restaurar.
1.3 Por qué almacenamiento
Elegimos almacenamiento porque ahí encontramos un problema que nadie está resolviendo bien.
Cuando varias personas trabajan sobre los mismos archivos aparecen siempre las mismas dos molestias.
La primera es que nadie sabe quién modificó qué: se abre un documento, algo cambió, y no hay forma
de rastrear quién lo cambió ni cuándo. La segunda es que encontrar información dentro de los propios
archivos se vuelve difícil apenas se juntan unos cuantos, porque buscar por nombre no sirve cuando uno
no recuerda cómo llamó al archivo, y menos todavía cuando lo que busca es un dato que está adentro.
Le pasa a un equipo armando un trabajo final, a una oficina que redacta un documento entre varios, a
alguien que necesita rescatar una cifra de un proyecto de hace dos años. En algunos contextos las
consecuencias pesan más que en otros: en un despacho legal, no saber quién redactó una cláusula
puede convertirse en un problema de responsabilidad. Pero el problema de fondo es el mismo en todos.
En almacenamiento, todos los proveedores grandes se detienen en el mismo punto: guardan el archivo
y no entienden nada de lo que hay dentro.

1.4 Alcance
Lo que vamos a construir
• Gestión de usuarios: registro, validación de correo, recuperación de contraseña, autenticación,
sesiones revocables y cuatro roles con permisos diferenciados.
• Motor de almacenamiento: carga simple y por partes, descarga, papelera, carpetas, versionado y
control de cuota.
• Compartición por usuario y enlaces públicos con expiración y contraseña.
• Planes, contratación simulada, historial de pagos, facturación y renovación.
• Edición colaborativa de documentos .docx en tiempo real, con presencia y guardado versionado.
• Historial de versiones con registro de los participantes de cada sesión de edición, y restauración de
versiones anteriores.
• Indexación de contenido y agente conversacional.
• Optimizador de almacenamiento para PDF e imágenes.
• Panel de administración, tablero de operación y métricas de negocio.
• Tres ambientes separados, pruebas automatizadas en cada cambio, observabilidad y despliegue
continuo con vuelta atrás.
Lo que no vamos a construir
Decir qué queda fuera es tan importante como decir qué entra. Esta versión deja fuera, por decisión
deliberada y con la justificación de cada caso en la sección 10.4: la edición en línea de .xlsx y .pptx, el
motor de atribución párrafo a párrafo y sus reportes de contribución, las carpetas inteligentes y la
generación de documentos por el agente, la optimización de documentos de Office, las organizaciones
con administración delegada, el reconocimiento óptico de PDF escaneados, el cobro proporcional al
cambiar de plan y la API pública con emisión de llaves.
Tampoco entran, por estar fuera del propósito del curso o del tiempo disponible: aplicaciones móviles y
cliente de escritorio, cifrado extremo a extremo, alta disponibilidad multi-región, certificaciones de
cumplimiento, transacciones con dinero real, segundo factor por TOTP, escaneo antivirus y compresión
de video.

2. Metodología de trabajo
2.1 Marco seleccionado: Crystal Clear
Trabajamos con Crystal Clear, la más ligera de las metodologías Crystal que propuso Alistair Cockburn. La
idea de fondo es sencilla: el proceso que necesitas depende de cuánta gente sea tu equipo y de qué tan
grave sea equivocarse. Crystal Clear está hecha para equipos de hasta seis u ocho personas
construyendo sistemas donde lo que se arriesga es dinero, no vidas.
Somos cuatro personas, con diez semanas y un sistema que no pone en riesgo la vida de nadie. Crystal
Clear se acomoda a nuestro caso.
2.2 Cómo trabajamos
El trabajo se organiza por fases. Cada fase abre con una reunión donde acordamos cómo vamos a atacar
esa parte y quién se hace cargo de qué, y cierra con otra donde revisamos juntos lo que se construyó,
qué problemas salieron y qué hay que corregir antes de entregar.
Momento Reunión Para qué
Al abrir la fase Planificación Acordar cómo se trabaja esa parte, repartir los módulos entre los cuatro
y detectar de qué depende cada cosa.
Durante la fase Solo si hace falta Resolver dudas o desbloquear problemas que no se destraban por
escrito. No hay reuniones fijas.
Antes de cerrar Revisión Ver los avances, revisar lo construido, decidir qué se corrige y qué queda
pendiente.
Entre reunión y reunión la coordinación es asíncrona: los avances y los bloqueos se cuentan por el canal
escrito y nadie tiene que estar conectado a una hora fija, que con cuatro horarios distintos es la única
forma realista de trabajar.
Cada persona se hace cargo de un módulo. Eso evita que los cuatro pierdan tiempo entendiendo código
ajeno todo el tiempo. La contraparte necesaria es la regla de revisión: nadie aprueba su propio trabajo, y
todo cambio lo revisa un integrante que no participó en ese módulo. Sin esa regla el reparto por
módulos termina en cuatro personas que solo entienden su parte, que es exactamente lo que no
queremos.
2.3 Roles del equipo
Rol de Crystal Clear Asignación Responsabilidad
Diseñador principal Tech Lead / Arquitecto Cuida la coherencia de la arquitectura y mantiene el
registro de por qué se tomó cada decisión.
Diseñador- Los cuatro integrantes Diseñan y construyen. Crystal Clear no separa una cosa de
programador la otra: quien construye, diseña.

Rol de Crystal Clear Asignación Responsabilidad
Usuario experto El equipo Aportan los requisitos reales y prueban la interfaz en
sesiones donde los observamos usarla.
Estos son los roles del equipo de desarrollo. Los roles del software —quién puede hacer qué dentro de la plataforma— se
definen en la sección 7.
Además de estos roles, guardamos el 20% de cada fase para refactorizar, escribir pruebas y ordenar lo
que quedó a medias. Ese margen no se negocia: es lo que evita llegar a la última entrega arrastrando un
desorden que ya no se pueda arreglar a tiempo.
2.4 Definición de terminado
Una tarea está terminada solo cuando fue revisada y aprobada por alguien que no trabajó en ella, tiene
pruebas automatizadas para lo que introduce, pasa las verificaciones automáticas de estilo y tipos,
quedó instrumentada con las bitácoras y métricas necesarias para operarla, está desplegada en el
ambiente de pruebas y se puede mostrar funcionando, y la documentación afectada quedó actualizada
en el mismo cambio.

3. Stack tecnológico
3.1 Arquitectura
El sistema es un monolito modular con procesos trabajadores aparte, todo desplegado en contenedores.
Los módulos del backend tienen fronteras claras y se comunican por interfaces, así que cualquiera
puede separarse como servicio propio el día que haga falta.
3.2 Componentes
Capa Tecnología Por qué
Frontend Next.js + TypeScript + Renderiza en el servidor, trae enrutamiento y división de código
Tailwind incluidos, y comparte tipos con el backend. Tailwind y shadcn/ui
nos dan un sistema de diseño sin armarlo desde cero.
Backend NestJS + TypeScript Sus módulos son literalmente la arquitectura que queremos. Trae
inyección de dependencias y genera la documentación de la API
casi sola.
ORM TypeORM Migraciones versionadas y reversibles, con entidades declaradas
en TypeScript y un control explícito de cada cambio de esquema.
Base de datos PostgreSQL + pgvector Motor sólido para las transacciones de facturación y la integridad
de los datos. La extensión vectorial nos ahorra montar otra base
de datos aparte.
Almacenamiento MinIO (compatible con Los archivos no van al disco del servidor ni como campos binarios
S3) en la base de datos. Nos da URLs firmadas, carga por partes y
versionado de objetos.
Cola y caché Redis + BullMQ Procesan la indexación y la optimización en segundo plano,
corren las renovaciones programadas y limitan el abuso de
peticiones.
Tiempo real Socket.IO sobre NestJS Presencia, progreso de las operaciones, notificaciones y las
respuestas del agente llegando poco a poco.
Edición .docx ONLYOFFICE Docs Permite editar documentos de Word en equipo sin perder el
diseño. Construir un editor equivalente desde cero excede por
completo el tiempo disponible. Se despliega para un solo formato
editable, lo que reduce la superficie que hay que probar.
Generación de gemini-3.5-flash (API) Modelo estable en disponibilidad general, con ventana de
lenguaje contexto amplia que permite pasarle fragmentos extensos sin
recortar el contexto de las citas. Se consume desde el backend
con la clave en variable de entorno, nunca expuesta al navegador,
y la llamada vive detrás de una interfaz propia, de modo que
cambiar de modelo o de proveedor es sustituir una
implementación.

Capa Tecnología Por qué
Vectorización gemini-embedding + El agente necesita dos modelos distintos: uno que redacta la
pgvector respuesta y otro que convierte texto en vectores. Los embeddings
se generan con el mismo proveedor para no sumar una
integración más, y se guardan en pgvector junto al resto de los
datos. La dimensión elegida queda fijada en el esquema desde la
primera migración, porque cambiarla después obliga a reindexar
todo el corpus.
Autenticación Passport JWT + Tokens que caducan pronto y se renuevan rotando, con un
Argon2id algoritmo de contraseñas resistente a ataques por hardware
dedicado.
Pagos Simulación propia de Una sola implementación, detrás de una interfaz que permitiría
pagos sustituirla por una pasarela real. No se mueve dinero: las
transacciones son simuladas de extremo a extremo, como lo
admite el enunciado del proyecto.
Procesamiento Ghostscript, qpdf, Optimización de PDF e imágenes para el módulo de compresión.
libvips
Infraestructura Docker + Traefik Lo que corre en nuestra máquina corre igual en producción, con
certificados automáticos.
Observabilidad Pino + Prometheus + Bitácoras estructuradas, métricas y alertas. El detalle de qué se
Grafana mide y qué dispara una alerta está en la sección 4.3.
Pruebas y CI Jest, Supertest, Pruebas unitarias, de API contra servicios reales, de flujos
Testcontainers, completos y de carga; cada cambio se verifica, se construye y se
Playwright, k6, GitHub despliega solo.
Actions
Infraestructura mínima
Producción: un servidor con 4 núcleos, 8 GB de memoria y 80 GB de disco sólido. El servidor de
documentos se lleva unos 4 GB él solo, y eso es lo que marca el tamaño del resto.
Ambiente de pruebas: una instancia más pequeña, de 2 núcleos y 4 GB, con el servidor de documentos
encendido únicamente durante las pruebas que lo requieren. No sostiene carga real, así que no necesita
el mismo tamaño; sí usa la misma imagen y la misma configuración.

4. Ambientes, pruebas y observabilidad
Un servicio no se juzga solo por cómo se programa, sino por cómo se opera. Esta sección describe dónde
corre el sistema, cómo se verifica cada cambio antes de llegar a producción y cómo nos damos cuenta
de que algo se rompió sin que un usuario nos lo tenga que decir.
4.1 Ambientes
| Ambiente  | Para qué sirve  | Cómo se levanta  | Con qué datos  |
| --------- | --------------- | ---------------- | -------------- |
Local  Desarrollo diario de cada  docker compose up en la  Semilla sintética generada
|     | integrante.  | máquina de cada quien, con  | por script.  |
| --- | ------------ | --------------------------- | ------------ |
todos los servicios.
Integración  Verificar cada cambio antes  GitHub Actions levanta  Base vacía por ejecución;
continua  de que se integre.  Postgres, MinIO y Redis como  los datos los crea cada
|     |     | contenedores de servicio y los  | prueba.  |
| --- | --- | ------------------------------- | -------- |
destruye al terminar.
Pruebas  Validar la fase completa antes  Despliegue automático desde  Corpus de demostración
(staging)  de entregarla y ensayar la  la rama principal, con la  sintético, con documentos
|     | demostración.  | misma imagen que  | de prueba de varios  |
| --- | -------------- | ----------------- | -------------------- |
|     |                | producción.       | tamaños.             |
Producción  La URL pública que se entrega  Despliegue manual a partir de  Datos reales de los
|     | al docente.  | una etiqueta de versión ya  | usuarios de la  |
| --- | ------------ | --------------------------- | --------------- |
|     |              | probada en staging.         | demostración.   |

Los cuatro ambientes se construyen desde la misma imagen de contenedor y se diferencian únicamente
por variables de entorno. Cada uno tiene su propia base de datos, su propio bucket de MinIO, su propia
instancia de Redis y sus propias credenciales; ningún ambiente comparte almacenamiento con otro.
Ningún ambiente fuera de producción usa datos reales de usuarios.
4.2 Estrategia de pruebas
| Tipo  | Herramienta  | Qué cubre  | Cuándo corre  |
| ----- | ------------ | ---------- | ------------- |
Unitarias  Jest  Lógica de negocio aislada: cálculo de  En cada envío de
|     |     | cuota, vigencia de planes, resolución de  | cambios.  |
| --- | --- | ----------------------------------------- | --------- |
permisos, particionado de texto.
De API e  Supertest +  Los endpoints contra una base, un Redis  En cada envío de
| integración  | Testcontainers  |     | cambios.  |
| ------------ | --------------- | --- | --------- |
y un MinIO reales levantados para la
prueba, no simulados.
De aislamiento  Supertest  Intentos deliberados de leer, editar y  En cada envío.
|     |     | consultar por el agente archivos de otra  | Bloqueante.  |
| --- | --- | ----------------------------------------- | ------------ |
cuenta. Su único propósito es fallar si el
aislamiento se rompe.

Tipo Herramienta Qué cubre Cuándo corre
De extremo a Playwright El recorrido completo: registro, En cada integración a la
extremo contratación de plan, carga de archivo, rama principal.
edición entre dos usuarios, consulta al
agente y descarga.
De carga k6 Los objetivos de RNF-01, RNF-02 y RNF- Al cierre de la Fase 3 y
03 sobre el ambiente de pruebas. antes de la entrega
final.
De migraciones Script en CI Aplicar y revertir cada migración sobre En cada envío que
base vacía y sobre base con datos. toque el esquema.
4.3 Observabilidad
Bitácoras
Pino emite bitácoras estructuradas en JSON. Cada petición recibe un identificador de correlación que
viaja con ella al trabajador en segundo plano y aparece en todas las líneas relacionadas, de modo que
una carga que falló se puede seguir de punta a punta con un solo identificador. Las bitácoras no
registran nunca contenido de archivos, contraseñas, tokens ni claves de enlaces públicos; los archivos se
identifican por su identificador interno, no por su nombre.
Métricas
Grupo Qué medimos
API Peticiones por segundo, tasa de error por endpoint y código, latencia p50, p95 y p99.
Colas Trabajos encolados, en proceso, completados y fallidos por tipo; tiempo de espera y
tiempo de ejecución.
Almacenamiento Espacio usado por cuenta y total, cargas iniciadas frente a completadas, rechazos por
cuota o por tamaño, tasa de error de MinIO.
Agente Consultas por plan, latencia hasta el primer fragmento de respuesta, fragmentos
recuperados por consulta, consumo y costo estimado por cuenta.
Edición Sesiones abiertas, editores concurrentes por documento, versiones generadas,
guardados fallidos.
Negocio Registros, contrataciones, renovaciones, vencimientos y cuentas degradadas a solo
lectura.
Sistema Uso de CPU, memoria y disco de cada contenedor; disponibilidad de Postgres, Redis,
MinIO y el servidor de documentos.
Tableros y alertas
Prometheus recolecta y Grafana presenta tres tableros: uno de operación, uno de negocio y uno del
agente. Sobre esas mismas métricas se definen alertas que llegan al canal del equipo:

• Tasa de respuestas 5xx por encima del 2% durante cinco minutos.
• Latencia p95 por encima de 300 ms sostenida durante diez minutos.
• Más de 50 trabajos pendientes en cola o cualquier trabajo reintentado tres veces.
• Uso de disco por encima del 80%.
• Caída de Postgres, Redis, MinIO o el servidor de documentos.
• Fallo del proceso programado de renovación de suscripciones.
Cada servicio expone verificaciones de salud —una de vida y una de disponibilidad— y Traefik retira del
enrutamiento lo que deje de responder. La bitácora de auditoría de la sección 7.4 es distinta de todo lo
anterior: aquélla es para el usuario, ésta es para nosotros.

5. Cronograma de actividades
El trabajo se reparte en cinco fases de dos semanas cada una. Cada fase cierra con una entrega
funcional, y con cuatro personas trabajando en paralelo el tiempo entre una y la siguiente alcanza para
el avance comprometido. El diagrama muestra las tareas semana por semana y los hitos de entrega.
El tiempo que antes ocupaba la línea de exploración se reasignó a métricas y alertas, a las pruebas de carga y
aislamiento, y a los manuales.

6. Características
6.1 Generales / básicas
Antes de lo que nos distingue, conviene dejar claro qué resuelve Nimbo como plataforma de
almacenamiento. Estas son las capacidades base, las que cualquier usuario espera encontrar desde el
primer día.
Cuentas y accesos
El registro se confirma por correo mediante un enlace firmado y con vigencia limitada. La recuperación
de contraseña usa un token de un solo uso que, al aplicarse, invalida todas las sesiones activas. Las
contraseñas se guardan con Argon2id y la sesión se sostiene con tokens de acceso cortos y refresco
rotativo, de modo que cada dispositivo mantiene su propia sesión y puede revocarse por separado; ante
un acceso desde un dispositivo no reconocido el usuario recibe un aviso. Sobre esa base operan los
cuatro roles que detalla la sección 7.
Planes y contratación
El catálogo describe cada plan con su nombre, su descripción, su precio y su vigencia, y un comparador
permite verlos lado a lado antes de decidir. La contratación pasa por un flujo de pago simulado y queda
registrada en un historial consultable, con facturas descargables por cada transacción. Al acercarse el
vencimiento el sistema avisa, y la suscripción puede renovarse de forma automática o manual.
Archivos y carpetas
La carga admite archivos pequeños de una sola vez y archivos grandes por partes, con progreso real y
capacidad de reanudar si la conexión se corta. Las descargas se sirven por URL firmada de vigencia corta.
Los archivos se organizan en un árbol jerárquico de carpetas que se pueden crear, renombrar, mover y
eliminar en cascada, con papelera de por medio para que nada se pierda por un clic.
Espacio disponible
Un medidor muestra en todo momento cuánto espacio se está consumiendo y cuánto queda, con
desglose por tipo de archivo para saber en qué se está yendo la cuota. El límite del plan se aplica antes
de subir, no después: una carga que excedería la cuota o el tamaño máximo por archivo se rechaza de
entrada, con un mensaje que explica por qué.
Formatos admitidos
Nimbo guarda cualquier tipo de archivo. Lo que sí está acotado es qué hace con cada uno. Limitar los
formatos editables a .docx fue una decisión deliberada de alcance: cada formato de Office tiene su
propio modelo de colaboración y su propio conjunto de fallas de formato, y sostener tres a la vez
multiplica el trabajo de prueba sin agregar una capacidad distinta.
Formato Se guarda Se previsualiza Se edita en línea Se indexa para el
agente
.docx Sí Sí Sí Sí

Formato Se guarda Se previsualiza Se edita en línea Se indexa para el
agente
.pdf Sí Sí No Sí, si tiene capa de
texto
.txt y .md Sí Sí No Sí
.xlsx y .pptx Sí Sí No Prevista para la
Fase 3
Imágenes Sí Sí No No, solo
metadatos
Cualquier otro Sí No No No
Un PDF escaneado sin capa de texto se guarda y se encuentra por nombre, pero no se indexa. El sistema lo indica en la
ficha del archivo en lugar de dejar creer que el agente puede leerlo.
6.2 Lo que nos diferencia
Lo que sigue es donde está el valor del producto y lo que nos separa de una nube convencional.
Edición colaborativa de documentos .docx
Varias personas editan a la vez el mismo documento de Word desde el navegador, viendo los cursores
de las demás y el historial de cambios. Se edita el formato original, sin convertirlo a nada, así que los
estilos, los saltos de sección, la numeración y las tablas complicadas quedan intactos. El número de
editores simultáneos por documento depende del plan.
Historial de versiones con autoría
Cada sesión de edición cierra generando una versión nueva del documento, y esa versión queda
asociada a los usuarios que participaron en ella. El usuario ve la línea de tiempo completa —cuándo se
editó, quiénes estuvieron, cuánto cambió el archivo— y puede restaurar cualquier versión anterior, que
a su vez queda registrada como una acción más del historial. El número de versiones que se retienen
depende del plan.
Este es el punto donde la propuesta original planteaba un motor de atribución párrafo por párrafo. Esa
línea quedó descartada; lo que se construye es el historial con autoría por versión, que es la parte
verificable del problema y de la que sí podemos responder con certeza.
Inteligencia documental
Cuando subes un archivo, el sistema lo procesa por detrás: extrae el texto anotando de dónde salió cada
fragmento, lo parte en trozos y lo indexa por palabras y por significado. La indexación por significado
convierte cada fragmento en un vector con el modelo de embeddings y lo guarda en pgvector; la
consulta del usuario se convierte con el mismo modelo, de modo que la búsqueda encuentra lo que
quiso decir aunque no haya usado las mismas palabras. Después puedes preguntar en lenguaje normal

sobre tus archivos y recibir respuestas que citan de dónde salió cada dato: la página en un PDF, la
sección y el párrafo en un .docx, la línea en un archivo de texto.
Optimizador de almacenamiento
Analiza tus PDF e imágenes, calcula cuánto espacio podrías recuperar y los reduce sin tocar su
contenido. En los PDF baja la resolución de las imágenes incrustadas y deja el texto intacto; en las
imágenes recomprime sin cambiar el formato. Antes de reemplazar nada se verifica que el archivo
resultante abra bien, el original se guarda y se puede restaurar, y si el ahorro estimado es mínimo la
opción ni siquiera aparece. Los documentos de Office quedan fuera del optimizador, por la razón que
explica la sección 10.4.
Privacidad por diseño en soporte
Soporte ve metadatos, estados de operación y bitácoras, pero nunca el contenido de los archivos ni sus
vistas previas. La restricción vive en la capa de autorización y en cómo se arman las respuestas: no es
que el botón esté escondido, es que el dato no sale del servidor. Y cada vez que soporte consulta
información de un cliente queda un registro que ese cliente puede ver.
6.3 Planes
| Característica                 | Personal      | Pro     | Equipo   | Institucional  |
| ------------------------------ | ------------- | ------- | -------- | -------------- |
| Precio mensual                 | Q0.00         | Q45.00  | Q110.00  | Q450.00        |
| Almacenamiento                 | 15 GB         | 100 GB  | 350 GB   | 2 TB           |
| Tamaño máximo por archivo      | 50 MB         | 500 MB  | 1 GB     | 2 GB           |
| Edición colaborativa de .docx  | Solo lectura  | Sí      | Sí       | Sí             |
| Editores simultáneos por       | —             | 3       | 5        | 5              |
documento
Consultas al agente  20 / mes  500 / mes  2 000 / mes  10 000 / mes
| Historial de versiones con  | Sí  | Sí  | Sí  | Sí  |
| --------------------------- | --- | --- | --- | --- |
autoría
|     | 3   | 30  | 60  | 100  |
| --- | --- | --- | --- | ---- |
Versiones retenidas por
archivo
| Retención en papelera  | 7 días  | 30 días  | 60 días  | 90 días  |
| ---------------------- | ------- | -------- | -------- | -------- |

Los planes son por cuenta. Un equipo trabaja compartiendo archivos y carpetas entre cuentas; esta versión no modela
organizaciones con administración delegada. El catálogo comercial es el que ve el usuario y la lógica de cuota se aplica
igual en todos los planes, pero el ambiente de demostración se aprovisiona con cuotas reducidas, acordes al servidor
descrito en la sección 3.2: lo que se valida es que el control de cuota funcione, no cargar dos terabytes reales.
|     |     |     |     |     |
| --- | --- | --- | --- | --- |

7. Roles y control de acceso
La plataforma tiene cuatro roles. Uno es de cara al usuario y tres son internos. La regla que los ordena es
que el rol nunca otorga acceso al contenido de los archivos: ese acceso nace de ser dueño del archivo o
de que alguien lo haya compartido explícitamente, y ningún rol interno lo obtiene por serlo.
7.1 Roles del sistema
Rol  Quién lo tiene  Responsabilidad  Alcance sobre los datos
Cliente  Cualquier persona  Usar la plataforma: subir,  Solo sus propios archivos y los
que se registra.  organizar, compartir, editar y  que le fueron compartidos.
consultar sus archivos.
Administrador
Cuenta interna del  Operar el negocio: cuentas,  Datos de cuenta, suscripciones
|     | equipo.  | catálogo de planes, cuotas,       |     | y metadatos. Nunca el       |     |
| --- | -------- | --------------------------------- | --- | --------------------------- | --- |
|     |          | incidencias escaladas y métricas  |     | contenido de los archivos.  |     |
agregadas.
Soporte técnico  Personal de  Atender incidencias reportadas:  Metadatos, estados de
atención al cliente.  verificar el estado de una  operación y bitácoras técnicas.
|     |     | operación, reintentar un      |     | Nunca contenido ni vistas  |     |
| --- | --- | ----------------------------- | --- | -------------------------- | --- |
|     |     | proceso fallido, explicar un  |     | previas.                   |     |
error.
Operador de  Cuenta interna del  Mantener el servicio en pie:  Infraestructura, métricas y
infraestructura  equipo técnico.  despliegues, migraciones,  trabajos en segundo plano. No
|     |     | respaldos, colas y alertas.  |     | opera cuentas de clientes.  |     |
| --- | --- | ---------------------------- | --- | --------------------------- | --- |
7.2 Matriz de permisos
Sí significa permitido; No, denegado por autorización en el servidor; Limitado, permitido bajo la
condición que indica la nota al pie de la tabla.
| Capacidad                                 |     | Cliente  | Admin.  | Soporte  | Operador  |
| ----------------------------------------- | --- | -------- | ------- | -------- | --------- |
| Registrarse, autenticarse y gestionar su  |     | Sí       | Sí      | Sí       | Sí        |
propia sesión
| Subir, descargar y organizar archivos  |     | Sí  | No  | No  | No  |
| -------------------------------------- | --- | --- | --- | --- | --- |
propios
|     |     | No  | No  | No  | No  |
| --- | --- | --- | --- | --- | --- |
Ver el contenido o la vista previa de
archivos de otra cuenta
| Compartir archivos y generar enlaces  |     | Sí  | No  | No  | No  |
| ------------------------------------- | --- | --- | --- | --- | --- |
públicos
| Editar documentos .docx en línea  |     | Sí  | No  | No  | No  |
| --------------------------------- | --- | --- | --- | --- | --- |
| Consultar al agente               |     | Sí  | No  | No  | No  |

| Capacidad  |     | Cliente  | Admin.  | Soporte  | Operador  |
| ---------- | --- | -------- | ------- | -------- | --------- |
Restaurar archivos de la papelera de un  Sí  No  Limitado   No
cliente
| Ver metadatos de los archivos de un  |     | Sí  | Sí  | Sí   | No  |
| ------------------------------------ | --- | --- | --- | ---- | --- |
cliente
| Crear, suspender y reactivar cuentas   |     | No  | Sí  | No  | No  |
| -------------------------------------- | --- | --- | --- | --- | --- |
| Gestionar el catálogo de planes y sus  |     | No  | Sí  | No  | No  |
precios
| Ajustar la cuota o la vigencia de una  |     | No  | Sí   | No  | No  |
| -------------------------------------- | --- | --- | ---- | --- | --- |
cuenta
| Ver métricas agregadas de uso y de  |     | No  | Sí  | No  | Sí  |
| ----------------------------------- | --- | --- | --- | --- | --- |
negocio
|     |     | No  | Sí  | Sí  | Sí  |
| --- | --- | --- | --- | --- | --- |
Consultar bitácoras técnicas y estado de
los trabajos
| Ejecutar despliegues y migraciones  |     | No  | No  | No  | Sí  |
| ----------------------------------- | --- | --- | --- | --- | --- |
| Administrar respaldos, llaves y     |     | No  | No  | No  | Sí  |
configuración del servidor
| Consultar su propia bitácora de auditoría  |     | Sí  | Sí  | Sí  | Sí  |
| ------------------------------------------ | --- | --- | --- | --- | --- |

7.3 Permisos sobre un archivo o carpeta
Dentro del rol Cliente hay una segunda capa de permisos, la que se otorga al compartir. No es un rol del
sistema sino un nivel de acceso sobre un recurso concreto.
| Nivel        | Puede  |     | No puede  |     |     |
| ------------ | ------ | --- | --------- | --- | --- |
| Propietario  |        |     | —         |     |     |
Todo sobre el recurso: ver, editar,
compartir, generar y revocar enlaces, ver el
historial de versiones y de accesos, mover y
eliminar.
Editor  Ver, descargar, editar el documento,  Compartir con terceros, generar enlaces
generar versiones nuevas y consultarlo con  públicos, eliminar el original ni ver quién
|     | el agente.  |     | más tiene acceso.  |     |     |
| --- | ----------- | --- | ------------------ | --- | --- |
Lector  Ver, descargar y consultarlo con el agente.  Modificar el archivo, compartirlo ni ver el
historial de accesos.
Enlace público  Descargar el recurso al que apunta,  Navegar fuera de ese recurso, editar, ni ver
|     | ingresando la contraseña cuando la tenga.  |     | quién más tiene acceso.  |     |     |
| --- | ------------------------------------------ | --- | ------------------------ | --- | --- |

7.4 Reglas transversales
• Privilegio mínimo: un rol interno no da acceso a contenido. El acceso al contenido nace de la
propiedad o de una compartición explícita, y no hay excepción administrativa.
• No existe la suplantación. Ningún rol puede entrar como otro usuario, ni siquiera para diagnosticar
un problema.
• Toda acción de un rol interno sobre una cuenta ajena queda en la bitácora de auditoría y es visible
para el cliente afectado (RF-07).
• La autorización se resuelve en el servidor y dentro de la consulta de datos, no filtrando los
resultados después ni escondiendo botones en la interfaz (RNF-05).
• Las cuentas internas son distintas de las cuentas de cliente. Un mismo usuario no acumula roles.
• El Operador que necesite intervenir sobre los datos de un cliente lo hace por una tarea
administrativa registrada, no por acceso directo a la base o al almacén.

8. Requisitos funcionales y no funcionales
Alcance de esta sección: esta es la línea base de la propuesta. El detalle completo, con criterios de
aceptación y casos de uso, va en el Documento de Requisitos que se entrega el 11 de septiembre de
2026.
La prioridad se expresa en dos niveles. Debe: el sistema no se considera entregado sin ello. Debería:
entra salvo que comprometa algo de mayor prioridad. Al eliminar las líneas de exploración desapareció
el nivel Podría de la versión anterior: ya no hay requisitos cuya inclusión quede pendiente de decidir.
8.1 Requisitos funcionales
Usuarios, accesos y administración
ID Requisito Prioridad
RF-01 Registrar usuarios validando la titularidad del correo mediante un enlace con Debe
vigencia limitada.
RF-02 Recuperar contraseña con un token de un solo uso que invalide las sesiones activas. Debe
RF-03 Autenticar usuarios emitiendo credenciales de vigencia limitada con renovación Debe
controlada.
RF-04 Permitir al usuario consultar y revocar individualmente sus sesiones activas, y Debe
notificarle ante accesos desde dispositivos no reconocidos.
RF-05 Implementar los roles Cliente, Administrador, Soporte técnico y Operador de Debe
infraestructura conforme a la matriz de la sección 7, impidiendo que cualquier rol
interno acceda al contenido de los archivos.
RF-06 Permitir al administrador gestionar cuentas, administrar el catálogo de planes y Debe
consultar métricas agregadas de uso y de negocio.
RF-07 Mantener una bitácora de auditoría de las operaciones sensibles, consultable por el Debe
cliente afectado.
Almacenamiento y compartición
ID Requisito Prioridad
RF-08 Cargar archivos, con carga por partes reanudable y progreso en tiempo real para Debe
archivos grandes.
RF-09 Descargar archivos mediante enlaces de vigencia limitada. Debe
RF-10 Crear, renombrar, mover y eliminar carpetas en una estructura jerárquica. Debe
RF-11 Aplicar eliminación lógica con papelera y periodo de retención según el plan. Debe
RF-12 Mostrar el espacio consumido y disponible en tiempo real, e impedir cargas que Debe
excedan la cuota o el tamaño máximo del plan.

ID Requisito Prioridad
RF-13 Conservar versiones anteriores de cada archivo y permitir restaurarlas, respetando Debe
el número de versiones retenidas del plan.
RF-14 Validar el tipo real del archivo por su contenido y no por su extensión. Debe
RF-15 Buscar archivos por nombre, tipo, fecha y contenido. Debe
RF-16 Compartir archivos y carpetas con otros usuarios asignando permisos de lectura o Debe
edición.
RF-17 Generar enlaces públicos con expiración configurable y protección opcional por Debe
contraseña, revocables en cualquier momento.
RF-18 Consultar los accesos vigentes sobre un archivo o carpeta —usuarios con permiso y Debe
enlaces públicos activos— y revocarlos individualmente.
Suscripciones y pagos
ID Requisito Prioridad
RF-19 Presentar un catálogo de planes con nombre, descripción, precio y vigencia. Debe
RF-20 Contratar un plan mediante un flujo de pago simulado y registrar cada transacción Debe
en un historial consultable.
RF-21 Generar una factura descargable por cada transacción exitosa. Debería
RF-22 Renovar automáticamente las suscripciones vigentes, permitir la renovación manual Debe
anticipada y notificar antes del vencimiento.
RF-23 Degradar la cuenta a modo de solo lectura al vencer la suscripción, preservando el Debe
contenido del usuario.
RF-24 Permitir el cambio de plan con efecto al inicio del siguiente ciclo de facturación. Debe
Colaboración e inteligencia documental
ID Requisito Prioridad
RF-25 Abrir y editar documentos .docx desde el navegador, preservando el formato Debe
original sin conversión intermedia.
RF-26 Permitir la edición simultánea de un mismo .docx por varios usuarios autorizados, Debe
mostrando la presencia de cada uno, hasta el límite de editores del plan.
RF-27 Previsualizar sin editar archivos .pdf, .xlsx, .pptx, de texto y de imagen. Debería
RF-28 Registrar una nueva versión al concluir cada sesión de edición, dejando constancia Debe
de los usuarios que participaron en ella, y reindexar el contenido modificado.
RF-29 Mostrar al usuario el historial de versiones de un documento con sus participantes, y Debe
permitir restaurar cualquier versión anterior.

ID Requisito Prioridad
RF-30 Extraer e indexar el contenido textual de archivos .docx, .pdf y de texto plano Debe
conservando la procedencia de cada fragmento, e informar el estado del
procesamiento.
RF-31 Extender la indexación a archivos .xlsx y .pptx, conservando como procedencia la Debería
hoja y la diapositiva respectivamente.
RF-32 Responder consultas en lenguaje natural sobre los archivos del usuario, citando el Debe
archivo y la ubicación exacta de donde procede la información.
RF-33 Restringir la recuperación de información a los archivos que el usuario posee o que Debe
le fueron compartidos.
RF-34 Aplicar el límite de consultas al agente correspondiente al plan contratado. Debe
Optimización y operación
ID Requisito Prioridad
RF-35 Estimar el ahorro alcanzable antes de ejecutar cualquier optimización, y no ofrecerla Debe
cuando resulte marginal.
RF-36 Reducir el tamaño de archivos PDF y de imagen sin alterar su contenido, validando la Debería
integridad del resultado antes de reemplazar y conservando el original restaurable.
RF-37 Exponer al Operador un tablero de estado del sistema y de los trabajos en segundo Debe
plano, con capacidad de reintentar los que hayan fallado.
8.2 Requisitos no funcionales
ID Categoría Requisito Verificación
RNF-01 Rendimiento Las consultas de la interfaz responden en menos de Pruebas de carga con k6.
300 ms en el percentil 95, excluyendo la
transferencia de archivos y las respuestas del agente.
RNF-02 Rendimiento El sistema soporta archivos de hasta 2 GB, al menos Prueba de esfuerzo
25 usuarios concurrentes y hasta 5 editores documentada.
simultáneos sobre un mismo documento sin
degradación perceptible.
RNF-03 Rendimiento La indexación de un documento de 50 páginas se Medición sobre corpus de
completa en menos de 60 segundos y las respuestas prueba.
del agente empiezan a llegar antes de 3 segundos.
RNF-04 Seguridad Las contraseñas se almacenan con un algoritmo Revisión de código y
resistente a hardware especializado y toda certificados.
comunicación va sobre canal cifrado.
RNF-05 Seguridad El aislamiento entre cuentas se aplica dentro de la Pruebas automatizadas de
consulta de datos y no sobre los resultados aislamiento, bloqueantes
obtenidos. en CI.

| ID  Categoría  | Requisito  | Verificación  |
| -------------- | ---------- | ------------- |
RNF-06  Seguridad  Los enlaces de descarga expiran en 5 minutos y  Revisión de la generación
|     | alcanzan a un solo objeto; los identificadores de  | de enlaces.  |
| --- | -------------------------------------------------- | ------------ |
recursos no son predecibles.
RNF-07  Seguridad  El contenido cargado se sirve desde un origen aislado  Revisión de cabeceras y
|     | con descarga forzada, y las operaciones sensibles  | prueba de exceso de  |
| --- | -------------------------------------------------- | -------------------- |
|     | tienen límite de tasa por usuario.                 | peticiones.          |
RNF-08  Seguridad  Las claves de los enlaces públicos se almacenan  Prueba de fuerza bruta
|     | cifradas y los intentos fallidos de acceso están  | sobre un enlace  |
| --- | ------------------------------------------------- | ---------------- |
|     | limitados por tasa y quedan registrados.          | protegido.       |
RNF-09  Disponibilidad  La caída de un componente no esencial — Prueba de degradación
controlada.
indexación, optimizador o servidor de documentos—
no impide cargar, descargar ni navegar archivos.
RNF-10  Mantenibilidad  Todo cambio de esquema se realiza mediante  Revisión del historial de
|     | migraciones versionadas y reversibles.  | migraciones y prueba de  |
| --- | --------------------------------------- | ------------------------ |
reversión en CI.
RNF-11  Mantenibilidad  La cobertura de pruebas de la lógica de negocio no  Reporte de cobertura
|     | baja del 60%.  | publicado en cada  |
| --- | -------------- | ------------------ |
ejecución de CI.
RNF-12  Portabilidad  El sistema se despliega íntegramente con  Despliegue reproducible
|     | contenedores, con paridad entre ambientes.  | desde cero.  |
| --- | ------------------------------------------- | ------------ |
RNF-13  Usabilidad  La interfaz es utilizable desde 360 px de ancho, está  Auditoría de accesibilidad.
en español y cumple contraste mínimo AA.
RNF-14  Usabilidad
|     | Toda operación de más de 2 segundos muestra          | Revisión de flujos  |
| --- | ---------------------------------------------------- | ------------------- |
|     | progreso, y los mensajes de error orientan sobre la  | principales.        |
acción correctiva.
RNF-15  Operación  Existen tres ambientes desplegados —integración  Revisión de la
continua, pruebas y producción— construidos desde  configuración y despliegue
|     | la misma imagen y diferenciados solo por variables  | reproducible.  |
| --- | --------------------------------------------------- | -------------- |
de entorno, con base de datos, almacén de objetos y
credenciales separados.
RNF-16  Operación  Ningún ambiente distinto de producción utiliza datos  Revisión del proceso de
siembra de datos.
reales de usuarios; el corpus de prueba es sintético y
se genera por script.
RNF-17  Operación  Cada petición y cada trabajo en segundo plano lleva  Rastreo de una operación
|     | un identificador de correlación presente en toda su  | de punta a punta y      |
| --- | ---------------------------------------------------- | ----------------------- |
|     | bitácora, y las bitácoras no contienen contenido de  | revisión de bitácoras.  |
archivos, contraseñas ni tokens.
RNF-18  Operación  El sistema expone verificaciones de salud y métricas,  Demostración del tablero
|     | y existen tableros y alertas para tasa de error,  | y disparo de una alerta de  |
| --- | ------------------------------------------------- | --------------------------- |
|     | latencia, profundidad de cola y uso de disco.     | prueba.                     |

| ID  Categoría  | Requisito  | Verificación  |
| -------------- | ---------- | ------------- |
RNF-19  Operación  Ningún cambio llega a producción sin pasar la  Historial de solicitudes de
|     | verificación automática y sin la aprobación de un  | integración y ejecuciones  |
| --- | -------------------------------------------------- | -------------------------- |
|     | integrante distinto de su autor.                   | de CI.                     |
RNF-20  Operación  Es posible volver a la versión anterior en menos de  Ensayo de vuelta atrás
|     | 10 minutos redesplegando la imagen previa.  | documentado.  |
| --- | ------------------------------------------- | ------------- |
RNF-21  Operación  Se respalda diariamente la base de datos y se  Registro de la prueba de
|     | versionan los objetos del almacén, con restauración  | restauración.  |
| --- | ---------------------------------------------------- | -------------- |
probada al menos una vez por fase.
|     |     |     |
| --- | --- | --- |

9. Análisis de stakeholders y usuarios
9.1 Stakeholders
Stakeholder Interés
Usuarios individuales Guardar sus archivos y poder encontrar lo que dicen por dentro, no solo por el
nombre.
Equipos de trabajo y Escribir documentos entre varios sin perder el rastro de quién participó en cada
organizaciones cliente versión.
Instituciones educativas Darle a su comunidad una herramienta de trabajo compartido con cuotas y
auditoría.
Responsables de evaluar Tener evidencia concreta de cómo evolucionó un entregable y quiénes
trabajo colectivo participaron en cada versión.
Marco normativo de Que la información de los usuarios se guarde y se maneje conforme a la
protección de datos normativa que aplique.
9.2 Segmentos de usuarios
Nimbo sirve para cualquiera que trabaje con documentos. Nada de lo que lo hace distinto está atado a
un sector: editar sin romper el formato, buscar por contenido y saber quién participó en cada versión
son problemas de todo el que produce documentos junto a otras personas. Arrancamos por el segmento
académico porque ahí tenemos acceso directo a usuarios reales y podemos validar rápido, no porque el
producto se limite a él.
Segmento Perfil Necesidad principal Lo que más valora
Individual Cualquier persona que Encontrar información sin Búsqueda por contenido y
acumula documentos recordar en qué archivo consultas al agente.
personales o de trabajo. quedó.
Académico Estudiantes de educación Colaborar en trabajos Edición colaborativa e
superior y media. colectivos y dejar constancia historial de versiones con
del aporte de cada quien. autoría.
Profesional Consultores, contadores, Entregar a clientes con Enlaces con expiración,
independiente abogados, arquitectos, control y rescatar información versionado y optimización.
diseñadores. de proyectos pasados.
Equipo Despachos, agencias, Redactar a varias manos sin Edición colaborativa e
profesional consultoras y pequeñas perder el rastro de quién historial con autoría.
empresas. participó.
Institucional Universidades, colegios, Dar espacio de trabajo Cuotas, compartición interna
organizaciones y compartido a su comunidad y auditoría.
dependencias. con control de consumo.

10. ¿Por qué contratarnos?
10.1 Entendemos el problema
Las nubes que ya existen están hechas para servirle a todo el mundo, y ahí está su límite: tratan todos
los archivos igual porque no pueden darse el lujo de suponer nada sobre tu trabajo. Nosotros sí
suponemos. Damos por hecho que un documento de trabajo lo escriben varias personas, que su
formato importa y que su contenido tiene que poder consultarse, no solo guardarse.
No competimos por ser un mejor almacén de archivos. Competimos por ser el único que entiende el
trabajo que contiene.
10.2 Frente a las alternativas
Capacidad Plataformas convencionales Nimbo
Edición de .docx Lo convierten a su propio formato y en el Se edita el archivo original tal cual, sin
camino se pierden estilos, saltos de convertirlo y sin perder el diseño.
sección, numeración y tablas complicadas.
Búsqueda en el Coincidencia de texto. Búsqueda por palabras y por significado,
contenido con respuestas en lenguaje natural que
citan de dónde salió cada dato.
Historial de autoría Guardan versiones sin dejar claro quién Cada versión queda asociada a quienes la
participó en cada una. produjeron, se puede consultar y se puede
restaurar.
Espacio agotado La única salida es pagar más. Un optimizador que calcula y recupera
espacio sin tocarle el contenido a los
archivos.
Privacidad en El personal de soporte puede ver el El contenido le queda fuera del alcance
soporte contenido de las cuentas. por diseño, y cada consulta queda
registrada para el cliente.
10.3 Los problemas difíciles que elegimos resolver
Un proyecto se mide por los problemas que decide enfrentar, no por la cantidad de pantallas que
produce. Estos tres son difíciles. Sabemos por qué lo son y sabemos qué vamos a ceder en cada uno.
Que la cita apunte al lugar correcto
Una respuesta con una cita equivocada es peor que una respuesta sin cita, porque parece verificada. El
problema es que la procedencia se pierde con facilidad: al extraer el texto hay que anotar de dónde salió
cada fragmento, y al partirlo en trozos hay que evitar que un trozo quede a caballo entre dos
ubicaciones. Un .docx además no tiene páginas hasta que se imprime, así que la referencia no puede ser
la misma que en un PDF.

Lo que cedemos: la unidad de cita se define por formato, página en PDF, sección y párrafo en .docx,
línea en texto plano, y no prometemos una equivalencia entre ellas. Si el sistema no puede ubicar un
fragmento con certeza, la respuesta lo dice en lugar de inventar la referencia.
Que nadie vea los archivos de otro
Cuando el agente busca información tiene que mirar únicamente los archivos de quien está
preguntando. La forma fácil es traer los resultados y después descartar los que no le pertenecen, y es
justamente la peligrosa: el sistema se ve bien en las pruebas y falla el día que dos cuentas tienen
contenido parecido. Nosotros filtramos desde la consulta misma, ponemos una segunda barrera en la
base de datos, y escribimos pruebas cuyo único propósito es intentar romperlo. Esas pruebas bloquean
la integración si fallan.
Cerrar una sesión de edición sin perder nada
Cuando varias personas terminan de editar un documento, el editor devuelve un archivo nuevo que hay
que guardar, versionar, atribuir a quienes participaron y volver a indexar. Si el aviso de guardado se
pierde, si el servidor se reinicia a medias o si el reemplazo del archivo falla al final, el resultado puede
ser un documento corrupto o una versión sin dueño.
La regla que nos pusimos: la versión no se da por buena hasta que el archivo nuevo está íntegro en el
almacén; mientras tanto la anterior permanece intacta. Los reintentos son idempotentes, de modo que
recibir dos veces el mismo aviso de guardado no genera dos versiones. Si el guardado falla, la sesión se
marca como fallida y se le dice al usuario, en vez de dejarlo creer que su trabajo quedó guardado.
10.4 Lo que decidimos no construir
Cada recorte va con su razón. Preferimos entregar menos cosas terminadas que más cosas a medias.
Lo que queda fuera Por qué
Edición en línea de .xlsx y Se guardan, se previsualizan y se indexan, pero no se editan. Cada formato
.pptx tiene su propio modelo de colaboración y su propio conjunto de fallas de
formato; sostener tres a la vez multiplica el trabajo de prueba sin agregar una
capacidad distinta.
Motor de atribución párrafo a Repartir cada párrafo entre autores comparando versiones tiene casos que ni
párrafo y reportes de una persona resolvería con certeza. El historial con autoría por versión sí se
contribución construye, y es la parte de la que podemos responder.
Carpetas inteligentes y Dependían del mismo índice y podrían añadirse más adelante. Se descartan
generación de documentos para concentrar el esfuerzo en que la búsqueda y las citas funcionen bien.
por el agente
Optimización de documentos Recomprimir imágenes dentro de un paquete OOXML sin romper las
de Office referencias internas es la operación más frágil del módulo, y un error deja el
documento imposible de abrir. El optimizador se queda en PDF e imágenes.

Lo que queda fuera Por qué
Segunda implementación de La propuesta anterior planteaba una pasarela en modo prueba y además una
pagos billetera propia. Dos implementaciones del mismo flujo simulado no agregan
nada demostrable: queda una sola, detrás de una interfaz que permitiría
sustituirla.
Reconocimiento óptico de PDF Es una integración completa aparte. Un PDF sin capa de texto se guarda y se
escaneados busca por nombre; el sistema avisa que no pudo indexarlo.
Cobro proporcional al cambiar Calcular devoluciones parciales tiene demasiados casos raros para algo que se
de plan resuelve aplicando el cambio en el siguiente periodo de cobro, que es lo que
hacen muchos servicios reales.
API pública con emisión de Cuesta alrededor de cinco días y no cambia nada para quien usa el producto.
llaves La API existe y está documentada; lo que no vamos a hacer es entregar llaves
de acceso a terceros.
Nuestra propuesta en una frase
Google Drive guarda tus archivos. Nimbo entiende tu trabajo: qué dice por dentro y quién lo escribió.

11. Entregables
| Entregable  | Formato  | Contenido  |
| ----------- | -------- | ---------- |
Código fuente  Repositorio GitHub con  Código completo, historial de commits, tablero de
|     | acceso para el docente  | trabajo y registro de decisiones de arquitectura.  |
| --- | ----------------------- | -------------------------------------------------- |
Documento de  PDF  Introducción, alcance, requisitos funcionales y no
| Requisitos  |     | funcionales, y casos de uso.  |
| ----------- | --- | ----------------------------- |
Documento de Diseño  PDF  Arquitectura general, diagramas UML, modelo entidad-
relación y diseño de base de datos.
Manual Técnico  PDF o README.md en el  Tecnologías utilizadas, instalación, configuración,
|     | repositorio  | despliegue y procedimiento de vuelta atrás.  |
| --- | ------------ | -------------------------------------------- |
Manual de Usuario  PDF  Registro, inicio de sesión, contratación de servicios y
administración de recursos.
Sistema en  Despliegue accesible por  Ambiente de producción con datos de demostración y
| funcionamiento  | URL pública  |     |
| --------------- | ------------ | --- |
credenciales por cada rol para el docente, más la URL
del ambiente de pruebas.
Evidencia de pruebas y  Documento en el  Reporte de cobertura, resultados de las pruebas de
operación  repositorio  carga y de aislamiento, capturas de los tableros y
registro del ensayo de vuelta atrás y de restauración.
Backlog de recortes  Documento en el  Especificación y justificación de lo que quedó
|     | repositorio  | deliberadamente fuera del alcance.  |
| --- | ------------ | ----------------------------------- |
Exposición final  Presentación y  Defensa de las decisiones de arquitectura y
|     | demostración en vivo  | demostración funcional del sistema.  |
| --- | --------------------- | ------------------------------------ |
