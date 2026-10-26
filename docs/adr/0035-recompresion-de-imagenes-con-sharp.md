# ADR-0035 — Las imágenes se recomprimen con `sharp` (libvips) dentro del `worker`

| Campo | Valor |
|---|---|
| Estado | Propuesto |
| Fecha | 2026-10-25 |
| Decisores | Abel (021), Adrián (aprobación; autorizó preparar este ADR el 2026-10-25) |
| Specs relacionadas | 021 (optimizador de imágenes), 021b (PDF, no lo usa); ADR-0001, ADR-0013, ADR-0028, ADR-0033; PD-128 |

## Contexto
RF-36 pide reducir imágenes «sin alterar su contenido», y la propuesta dice que «en las imágenes recomprime sin cambiar
el formato». Adrián fijó para 021 (2026-10-25): JPEG y WebP con pérdida controlada, PNG y GIF sin pérdida, GIF animado
excluido (el WebP animado entra), y siempre el mismo formato, las mismas dimensiones, la orientación EXIF y el perfil de
color (spec 021 RN-1, RN-6).
Además hay que **validar** el resultado antes de reemplazar (decodificarlo y comparar dimensiones, formato, orientación,
perfil, alfa, en PNG y GIF los píxeles y en WebP animado cuadros, tiempos y bucle) y leer dimensiones y cuadros antes
de procesar (límite de píxeles decodificados totales, RN-8).

En el repositorio no hay nada que lo haga: Ghostscript (ADR-0033) trabaja PDF, no recomprime imágenes sueltas; el
detector de 005 solo lee firmas. Restricciones: equipo de 4, un servidor de 8 GB con ONLYOFFICE en ~3–4 GB y el `worker`
limitado a 768 MB (`compose.yml`, `WORKER_MEM_LIMIT`), pnpm 10 (bloquea scripts de instalación fuera de
`onlyBuiltDependencies`), desarrollo en Windows, CI en Ubuntu y todavía sin imagen Docker del `worker` (PD-128).

## Opciones consideradas
1. **`sharp` (libvips) en el `worker`**
   - Pros: una sola dependencia para leer, recomprimir y validar los cuatro formatos; libvips procesa por regiones y
     ofrece un límite de píxeles de entrada (`limitInputPixels`) y un tiempo límite por operación; lee orientación,
     perfil, alfa, cuadros, tiempos y bucle (`metadata`); lee y escribe WebP animado (entrada con `animated: true`);
     permite conservar EXIF y perfil en la salida; trae binarios
     precompilados de libvips para Linux (glibc y musl), macOS y Windows x64, sin compilar en la instalación. La
     propuesta ya nombra libvips en el stack.
   - Contras: dependencia nativa que corre **en el mismo proceso** del `worker` (un fallo grave de memoria lo afectaría);
     por defecto **descarta los metadatos** (hay que pedir conservarlos) y no corrige la orientación salvo que se rote,
     y rotar cambiaría las dimensiones; decodificadores de entrada no confiable (actualizaciones de seguridad); su
     binario debe entrar en la futura imagen del `worker`.
2. **Herramientas separadas por formato** (`jpegoptim`, `oxipng`, `gifsicle`, `cwebp`/`dwebp`), por `ICommandRunner`
   - Pros: procesos aparte (un fallo no tumba el `worker`); cada una es especialista en su formato (`gifsicle` y `oxipng`
     son sin pérdida de verdad); reutiliza el patrón de Ghostscript.
   - Contras: cuatro o cinco binarios que instalar en CI, en cada máquina Windows y en la imagen del `worker` (la misma
     fricción de `GHOSTSCRIPT_BIN`, multiplicada); cada una con sus opciones de metadatos; **ninguna valida** el
     resultado: haría falta además un decodificador para comparar dimensiones y píxeles; WebP necesita dos herramientas.
3. **Posponer la optimización de imágenes**
   - Pros: sin dependencia ni riesgo nuevo.
   - Contras: 021 quedaría sin entregable (Adrián decidió que 021 sea imágenes y 021b PDF); RF-36 sin cubrir.

## Decisión
Opción 1, **`sharp` en el `worker`, nunca en el `api`**, detrás del puerto `IOptimizer` de `optimizer` (el dominio no
conoce la librería, Art. VIII) y con estas reglas, que el plan de 021 concreta y sus pruebas verifican:

- **Formatos:** salida en el **mismo formato** que la entrada. JPEG (calidad 80 con `mozjpeg: true`) y WebP (calidad 80)
  con pérdida controlada; PNG con compresión 9, filtrado adaptativo y sin paleta (sin pérdida). El validador compara
  píxeles en PNG y GIF. **GIF estático:** `sharp` no lo recomprime sin pérdida (ver «Validación»), así que con la regla
  de la spec siempre termina en «no conviene».
- **Animación:** el **GIF animado** «no está disponible» en 021 (se detecta con `metadata().pages > 1`, sin decodificar).
  El **WebP animado** se lee **siempre** con `animated: true` (sin esa opción queda un solo cuadro) y se escribe como WebP
  animado pasando `delay` y `loop`; el validador compara formato, cuadros, alto por cuadro (`pageHeight`), ancho,
  tiempos, bucle y alfa.
- **Metadatos:** `sharp` **descarta los metadatos por defecto**. Se llama a `keepIccProfile()` siempre y a `keepExif()`
  solo si la entrada trae EXIF (en una entrada sin EXIF lo agregaría con orientación 1). **No** se usa `withMetadata()`:
  reemplaza un perfil no sRGB por sRGB. **No se rota** la imagen (`rotate()` cambiaría ancho y alto). El resto de EXIF
  no es requisito (spec 021 RN-6) y no se promete.
- **Memoria y tiempo:** `limitInputPixels` = `OPTIMIZER_MAX_PIXELS` (36 M), que `sharp` aplica a los píxeles **totales** de
  una animación y ya en `metadata()`; `OPTIMIZER_MAX_FILE_BYTES` (40 MB); `timeout({ seconds })` con
  `OPTIMIZER_TIMEOUT_MS` (100 s). Concurrencia 1 en la cola, `sharp.concurrency(1)` y `sharp.cache(false)`. Validar con
  `stats()` (no decodificar a crudo) salvo la comparación de píxeles de PNG y GIF.
- **Instalación:** `sharp` 0.34.5 en `apps/api/package.json` (el `api` y el `worker` comparten paquete; solo el `worker`
  lo instancia). Con pnpm 10 el script de instalación de `sharp` se ignora («Ignored build scripts») y la librería
  funciona igual con el binario precompilado: **no** hace falta `onlyBuiltDependencies`; el aviso se puede silenciar
  declarándolo en `ignoredBuiltDependencies` (no probado en el repo).
- **Imagen Docker del `worker` (PD-128):** cuando exista, debe usar una base con binario precompilado disponible
  (glibc o musl) y documentarlo; no cambia este ADR.

## Consecuencias
- Positivas: una dependencia en vez de cinco binarios; leer, recomprimir y validar con la misma librería; sin
  instalación de sistema en CI ni en Windows; límites de memoria y tiempo explícitos.
- Negativas / deuda aceptada: el proceso del `worker` comparte memoria con la indexación (concurrencia 1 en cada cola);
  un error nativo grave reiniciaría el `worker` (BullMQ reintenta y la caducidad del plan de 021 marca la operación como
  fallida); la ganancia de PNG y GIF sin pérdida puede ser pequeña y quedar a menudo bajo el umbral (resultado correcto:
  «el ahorro sería mínimo»).
- Cómo sabremos si fue un error: el `worker` se reinicia por memoria con imágenes dentro de los límites, la salida pierde
  orientación o perfil, o la instalación exige pasos manuales en algún entorno. Entonces se pasa a la opción 2 detrás
  del mismo `IOptimizer`, sin tocar el dominio.

## Validación (spike, 2026-10-25)
Hecho fuera del repositorio (directorio temporal, sin tocar `package.json` ni el lockfile), con *fixtures* sintéticos.

- **Instalación:** `sharp` 0.34.5 y libvips 8.17.3 en Windows x64 con Node 24.14.1: binario precompilado
  `@img/sharp-win32-x64`, sin compilar ni toolchain, 4 s con npm. Con pnpm 10.34 se instala, avisa «Ignored build scripts:
  sharp» y carga igual. **No probado:** Linux (CI) ni la imagen del `worker` (PD-128); `sharp` publica binarios para
  ambos (glibc y musl).
- **Metadatos:** por defecto se pierden orientación y perfil. `keepExif()` + `keepIccProfile()` conservan la orientación 6
  y el perfil **idéntico byte a byte**, con el mismo ancho y alto guardados y la misma imagen visible (diferencia media
  2,0–2,7 sobre 255 por la recompresión). `withMetadata()` cambia un perfil P3 por sRGB. `rotate()` cambia 4000 × 3000
  por 3000 × 4000.
- **WebP animado:** 5 cuadros de 480 × 320, tiempos 100–500 ms, bucle 3 y alfa: la salida a calidad 80 los conserva todos
  (44 % de ahorro). Sin `animated: true` se lee un solo cuadro. **Sin bloqueo.**
- **GIF:** el animado se detecta por `pages > 1`. El estático **no** sale idéntico en píxeles con ninguna opción probada
  (`reuse`, `dither: 0`, `effort: 10`): cambian ~2 % de los píxeles (diferencia máxima 5) y ahorra 0,2–0,3 %.
- **PNG:** compresión 9 sin paleta → píxeles idénticos; ahorro 37 % en un PNG fotográfico y 95 % en uno de zonas planas.
- **JPEG por defecto frente a `mozjpeg: true`** (calidad 80): 12 MP, 57,2 % en 134 ms frente a 62,7 % en 865 ms;
  50 MP, 0,53 s frente a 3,76 s; error medio 2,48 frente a 2,00; misma memoria. Se elige mozjpeg: menos bytes y menos
  error, con un tiempo lejos del límite.
- **Memoria y tiempo** (1 hilo, trabajo completo con validación por `stats()`): JPEG 40 MP 297 MB / 2,4 s; WebP 40 MP
  348 MB / 7,8 s; PNG de 40 MB 302 MB / 15,3 s; WebP animado de 40 M píxeles 141 MB / 34,3 s; JPEG 50 MP 369 MB y
  WebP 50 MP 417 MB (no caben en ~350 MB). Con 2 hilos, entre 6 % y 30 % más rápido y misma memoria.
- **Bordes:** un JPEG truncado da error al recomprimir (→ «ilegible»); una cabecera de 100 000 × 100 000 se rechaza en
  `metadata()` sin decodificar; `limitInputPixels` cuenta los cuadros de una animación; `timeout({ seconds: 1 })` corta
  a ~1,2 s.
- **Restricciones descubiertas:** el GIF estático no se puede optimizar sin pérdida con `sharp`; la base de memoria del
  `worker` real no se pudo medir aquí (la supone el plan de 021 y la mide su T-08).
