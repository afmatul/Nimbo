# Spec 021 — Optimizador de almacenamiento

> Qué y por qué, en ≤ 150 líneas. El cómo va en `./plan.md` (obligatorio).

| Campo | Valor |
|---|---|
| Estado | Borrador |
| Dueño | Abel (3) |
| Fase | 3 |
| Requisitos | RF-35 (Debe), RF-36 (Debería) (principales); aplican RF-05, RF-07, RF-11, RF-12, RF-13, RF-14, RF-23, RF-29, RF-30, RNF-05, RNF-09, RNF-13, RNF-14, RNF-17 |
| Depende de | 014 (versiones: numeración, origen optimización, cuota, retención y restauración), 019 (reindexación de cada versión vigente nueva, PD-90), 010 (cuenta en solo lectura, PD-121), 003 (roles y aislamiento), 004 (auditoría) |
| Módulo | M7 `optimizer` |
| DF / PD / ADR | DF-21 (Abierto, «requiere decisión de producto»), DF-22 (Abierto), DF-80; PD-121, PD-132; ADR-0013 (Pendiente) |
| Última actualización | 2026-10-25 |

## 1. Contexto y objetivo
Cuando el espacio se agota, hoy la única salida es pagar más (propuesta, «Espacio agotado»). El optimizador **estima**
cuánto se recupera al reducir un PDF o una imagen y solo lo ofrece si el ahorro no es marginal (RF-35). Si el cliente
acepta, reduce el archivo **sin tocar su contenido** (en PDF baja la resolución de las imágenes incrustadas y deja el
texto intacto; en imágenes recomprime sin cambiar el formato), verifica que el resultado abra antes de reemplazar y
conserva el original restaurable (RF-36; propuesta, «Optimizador de almacenamiento»). Office, video y OCR quedan fuera
(`product-context.md` §9). Un fallo del optimizador nunca bloquea los archivos (RNF-09).

**Qué se toma de 014 sin redefinirlo.** La optimización crea una nueva versión optimizada y mantiene la anterior
restaurable según las reglas de 014 (014 HU-7, CA-5 y CA-9): misma numeración, cuota, retención y auditoría de versiones.
021 no cambia esas reglas. **Tensión abierta (DF-21):** con 014 RN-3 todas las versiones cuentan en el
espacio usado, así que mientras el original siga retenido la optimización no reduce el espacio contabilizado, y ese
es el objetivo del optimizador (P-1).

## 2. Historias de usuario
- **HU-1** Como cliente, quiero saber cuánto espacio recuperaría al optimizar mis PDF e imágenes, para decidir si lo hago.
- **HU-2** Como cliente, quiero que no se me ofrezca optimizar cuando el ahorro es mínimo, para no arriesgar un archivo a cambio de casi nada.
- **HU-3** Como cliente, quiero optimizar un archivo en segundo plano sin que cambie su contenido, para recuperar espacio mientras sigo trabajando.
- **HU-4** Como cliente, quiero recuperar el original, para deshacer una optimización que no me sirve.
- **HU-5** Como cliente, quiero que un resultado dañado nunca reemplace a mi archivo, para no perder nada al optimizar.
- **HU-6** Como equipo, queremos que nadie estime ni optimice archivos ajenos y que los roles internos no lleguen al contenido, para cumplir el aislamiento (RNF-05).

## 3. Criterios de aceptación
> Códigos: los fija el plan (`OPTIMIZER_*`; los de versiones, nodos y solo lectura son los de 014, 005 y 010). «Umbral marginal»: P-2.

### Estimar (HU-1, HU-2)
- **CA-1** (HU-1, RF-35) Dado un PDF o una imagen propia, cuando pido la estimación, entonces veo el tamaño actual, el estimado y el ahorro en bytes y en porcentaje, sin que el archivo cambie.
- **CA-2** (HU-2, RF-35) Dada una estimación por debajo del umbral marginal, cuando se muestra, entonces la acción «Optimizar» no aparece y se explica que el ahorro sería mínimo.
- **CA-3** (HU-1, `product-context.md` §9) — error: Dado un `.docx`, `.xlsx`, `.pptx`, texto, video u «otros», cuando pido estimar u optimizar, entonces no se ofrece y la API lo rechaza sin crear nada.
- **CA-4** (HU-1, RF-14) — error: Dado un archivo cuyo contenido real no es PDF ni una imagen de RN-1 aunque la extensión lo diga, cuando pido estimar, entonces se rechaza como en CA-3.

### Optimizar (HU-3, HU-5)
- **CA-5** (HU-3, RF-36) Dada una estimación que conviene, cuando confirmo, entonces la optimización corre en segundo plano, veo que está en proceso (RNF-14) y puedo seguir usando Nimbo.
- **CA-6** (HU-3, RF-36, RF-29) Dada una optimización que termina bien, entonces el archivo conserva su `id` y nombre, la versión nueva (origen «optimización») es la actual y el historial la muestra con su tamaño y el cambio frente a la anterior (014 CA-6).
- **CA-7** (HU-3, RF-36) Dado un PDF optimizado, cuando se compara con el original, entonces conserva páginas, texto y estructura; en una imagen, formato y dimensiones (P-5).
- **CA-8** (HU-5, RF-36, Art. XI.1) — error: Dado un resultado que no abre o no supera la validación de integridad, entonces no se crea versión, el original sigue como actual y veo «No pudimos optimizar este archivo sin dañarlo. Tu archivo no cambió y puedes seguir usándolo como está.»; no se invita a repetir la misma optimización.
- **CA-9** (HU-5, Art. XI.1) — error: Dado que la versión actual cambia mientras se optimiza (reemplazo, edición o restauración), cuando termina, entonces el resultado se descarta y la nueva versión actual no cambia.
- **CA-10** (HU-3, Art. XI.2) Dado el mismo trabajo de optimización entregado dos veces, entonces se registra una sola versión.
- **CA-11** (HU-3, RF-30) Dado un PDF optimizado, cuando se registra la versión, entonces su indexación vuelve a `pendiente` como cualquier versión vigente nueva (019 RN-11), sin acción del cliente.
- **CA-12** (HU-3, RF-13) Dado un archivo en el límite de versiones retenidas de su plan, cuando voy a optimizarlo, entonces antes de confirmar se me avisa qué versión se eliminará (igual que 014 CA-15).
- **CA-13** (HU-3, RNF-09) — error: Dado el optimizador caído o lento, entonces subir, descargar, navegar, editar y restaurar funcionan, y la optimización queda fallida con «El optimizador no está disponible ahora. Tu archivo no cambió; vuelve a intentarlo más tarde.». El cliente puede volver a pedirla cuando el servicio esté disponible; el reintento manual por el Operador no es de esta spec (pertenece a 022b).

### Original y espacio (HU-4)
- **CA-14** (HU-4, RF-36, RF-13) Dado un archivo optimizado, cuando restauro la versión anterior desde el historial, entonces se aplica 014 CA-9 (versión nueva con origen restauración) mientras el original siga retenido (P-1).
- **CA-15** (HU-4, RF-12) Dada una optimización completada, cuando miro mi espacio, entonces el medidor refleja la regla que fije P-1 y la interfaz explica cuándo se libera el espacio del original.

### Cuenta, aislamiento y roles (HU-6)
- **CA-16** (HU-6, RF-23, RN-7) — error: Dada una cuenta en solo lectura por vencimiento, cuando el propietario pide la estimación, entonces la recibe como en CA-1; cuando confirma optimizar, entonces se responde `403` `STORAGE_ACCOUNT_READ_ONLY` con el mensaje de 010 CA-13 y nada cambia.
- **CA-17** (HU-6, RF-11) — error: Dado un archivo en la papelera, cuando se estima u optimiza, entonces `404` como 014 CA-16.
- **CA-18** (HU-6, RNF-05) Dados los clientes A y B, cuando B estima u optimiza un archivo de A, o consulta su estado, entonces `404` idéntico salvo `correlationId`, resuelto dentro de la consulta (RNF-05; prueba de aislamiento).
- **CA-19** (HU-6, RF-05) — error: Dado un Administrador, Soporte u Operador, cuando llama cualquier ruta del optimizador, entonces `403` `SHARED_FORBIDDEN`; sin token, `401` `SHARED_UNAUTHENTICATED`.
- **CA-20** (HU-6, RF-07, RNF-17) Dada una optimización completada, fallida o descartada, cuando se revisan auditoría y bitácoras, entonces constan actor, archivo y versiones por UUID, bytes antes y después, resultado y `correlationId`, y **nunca** nombres de archivo, contenido, URLs firmadas ni claves de objeto.

### Interfaz (RNF-13, RNF-14)
- **CA-21** (HU-1 a HU-4) Dada la pantalla que fije P-3, cuando la abro, entonces veo los estados estimación, no-conviene, procesando, completado y error, a 360 y 1440 px, en español y sin violaciones serias de axe.

## 4. Reglas de negocio
- **RN-1** Solo PDF e imágenes, decididos por el contenido real (RF-14; `product-context.md` §4 y §9). «Imagen» es lo que 005 ya clasifica así: `png`, `jpg`, `jpeg`, `gif` y `webp` (005 plan D-9); el resto es «otros». Office y video, nunca.
- **RN-2** Estimar no cambia nada ni consume espacio; optimizar solo se ofrece por encima del umbral marginal (P-2).
- **RN-3** El resultado es siempre una versión nueva con origen «optimización»; ninguna versión existente se sobrescribe (014 RN-2, DF-21).
- **RN-4** Cuota, numeración y retención de esa versión: las de 014 (RN-1, RN-3, RN-4), salvo lo que decida P-1.
- **RN-5** Quién optimiza: el propietario, como 014 RN-7.
- **RN-6** Sin conversión de formato: un PDF sigue siendo PDF y una imagen conserva su formato (propuesta).
- **RN-7** En solo lectura (010 RN-6, PD-121): estimar se permite porque no crea ni modifica contenido; optimizar se rechaza porque crea una versión.

## 5. Seguridad y privacidad
- **¿Toca datos de un cliente?** Sí, el contenido de sus archivos → pruebas de aislamiento (CA-18).
- **Auditoría (RF-07)**: CA-20. **Nunca** en bitácoras: nombres, contenido, URLs firmadas, claves de objeto.
- **Roles internos**: `403` (CA-19); ninguno ve estimaciones ni resultados. El reintento por el Operador es de 022b.
- **Procesamiento**: un archivo malicioso, corrupto o que tarda demasiado termina en error con tiempo límite y no afecta a otros trabajos ni cuentas.
- **Límite de tasa** en estimar y optimizar (RNF-07): cifras en el plan.

## 6. Experiencia de usuario
| Pantalla | Mockup (`docs/design/mockups/…`) | Estados requeridos | Estado del mockup |
|---|---|---|---|
| Optimizador | `optimizer/optimizador/` (`ui-guidelines.md` §7) | estimacion, no-conviene, procesando, completado, error | Borrador: solo `estimacion`; contradice fuentes (PD-132) |

- Mensajes clave (español, tuteo, con acción): «El ahorro sería mínimo; no vale la pena optimizar este archivo.» · CA-8 · CA-13 · solo lectura de 010 CA-13 · aviso de poda de 014 CA-15.

## 7. Fuera de alcance
- Optimizar Office o video, OCR y conversión de formato (`product-context.md` §9).
- Cambiar reglas o código de 014 (`storage`): numeración, cuota, retención, restauración, papelera.
- Lista y reintento de trabajos por el Operador, alertas de cola y métricas (022b, 022).
- Optimización automática sin confirmación del cliente.

## 8. Supuestos
- Disponible en todos los planes: el catálogo (`product-context.md` §3) no lo limita.
- Toda herramienta nueva de procesamiento entra con su ADR en el plan.
- Los requisitos mandan sobre el mockup: lo que el mockup contradice (formato WebP, «near-lossless», original opcional, reindexación con cuota, PDF de más de 2 GB) se registra en PD-132 y se corrige con `/mockup` antes de `Lista` (antes P-4).
- Lo que 021 necesite de módulos de otros dueños (registrar la versión optimizada, consultar la solo lectura, procesar archivos; PD-121, DF-80) se acuerda en el plan; no cambia el comportamiento de 014 (antes P-7).
- Si 012 concede al Editor «generar versiones» (014 RN-7 y D-5), se revisa RN-5 (antes P-8).
- Dónde vive el estado interno de cada optimización (DF-22, compartido con 022b) lo decide el plan; no cambia lo que ve el cliente (antes P-10).

## 9. Preguntas
- [ABIERTA] **P-1** (DF-21, ADR-0013) Política del original: ¿cuánto se conserva (retención de versiones del plan, retención de papelera o un plazo fijo), cuándo se libera su espacio y cómo cuenta la versión optimizada en la cuota? Con 014 RN-3, optimizar hoy **sube** el espacio usado hasta que la poda por retención elimina el original. — bloquea: sí
- [ABIERTA] **P-2** ¿Cuál es el umbral marginal (bytes, porcentaje o ambos) y qué pasa si el ahorro real no lo alcanza (se descarta o se guarda)? — bloquea: sí
- [ABIERTA] **P-3** ¿Archivo por archivo (desde la ficha) o una pantalla que analiza la cuenta y optimiza varios a la vez, como el mockup («Optimizador» en la barra lateral, totales, ahorro acumulado)? Si es la segunda, ¿se parte la spec (`workflow.md` §4.1)? — bloquea: sí
- [ABIERTA] **P-5** «Sin alterar su contenido»: ¿pérdida aceptada al recomprimir imágenes o bajar su resolución en PDF, y con qué mínimo? — bloquea: sí
- [ABIERTA] **P-6** ¿Se excluyen los PDF con firma digital (optimizarlos la invalida)? Lo sugiere el mockup; ninguna fuente lo dice. — bloquea: sí
- [ABIERTA] **P-11** ¿Tamaño máximo optimizable? Ninguna fuente lo fija (la indexación usa su propio tope, DF-37). Los formatos ya los fija RN-1. — bloquea: sí
- [ABIERTA] **P-12** ¿El estado «procesando → completado» se actualiza en vivo (015) o al volver a la pantalla? RNF-14 solo exige progreso visible; en la 019 el aviso en vivo fue una decisión explícita (019 P-3). — bloquea: sí
- [RESUELTA] **P-9** Solo lectura → estimar sí, optimizar `403` `STORAGE_ACCOUNT_READ_ONLY` → RN-7, CA-16. Fuente: 010 RN-6 y CA-13, PD-121 (2026-10-24, por fuentes vigentes).

## 10. Registro de cambios
| Fecha | Cambio | Motivo | Aprobó |
|---|---|---|---|
| 2026-10-24 | Creación en `Borrador`; plan y tareas pendientes porque existen preguntas bloqueantes según el flujo de `/spec` (Modo 2). P-1 a P-12 | `/spec 021` | — |
| 2026-10-24 | Revisión documental: P-9, P-11 y P-12 pasan a bloqueantes; P-7 y P-10 quedan no bloqueantes (diseño para el plan); CA-16 queda sujeto a P-9; se retiran nombres de clases, puertos y archivos | Regla de bloqueo del planner y «sin cómo» en la spec | — |
| 2026-10-24 | Revisión del PR #77: P-9 resuelta por fuentes (RN-7) y CA-16 concreto, que ya no depende de P-9; formatos de P-11 resueltos por 005 (RN-1), el tamaño sigue abierto; P-4, P-7, P-8 y P-10 pasan a Supuestos (ADR-0034); P-1 sin la premisa falsa (la poda borra todas las versiones del objeto); PD-132 con las contradicciones del mockup; estado `error` en §6 y en `ui-guidelines.md` §7; dependencias 014, 019 y 010 en el backlog; menores (historias, CA-8, CA-13, concordancia). Siguen condicionados: CA-15 a P-1 y CA-21 a P-3 | Hallazgos M-1 a M-4 y menores de la revisión | — |
| 2026-10-24 | Pulido final: RF-05 y RF-11 en el encabezado (los usan CA-19 y CA-17); las referencias a 014 en §1 y a `product-context.md` §9 en CA-3 sin ambigüedad; CA-12 avisa antes de confirmar, como 014 CA-15. Sin cambios de comportamiento | Auditoría de cierre | — |
| 2026-10-25 | CA-8 (integridad, sin invitar a repetir) y CA-13 (servicio no disponible, se puede volver a pedir) con mensajes distintos; P-11 queda solo por tamaño (los formatos ya están en RN-1); el supuesto de 012 remite a RN-5 sin repetirla | Menores n-1, n-2 y n-4 de la segunda revisión | — |
