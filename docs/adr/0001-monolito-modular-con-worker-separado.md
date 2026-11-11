# ADR-0001 — Monolito modular con un proceso `worker` separado

| Campo | Valor |
|---|---|
| Estado | Aceptado (2026-09-26, Adrián) |
| Fecha | 2026-09-15 |
| Decisores | Adrián (architect), equipo Nimbo |
| Specs relacionadas | 000 (lo materializa); todas las posteriores; **enmendado por ADR-0038** (021: dos procesos `worker`) |

## Contexto

Nimbo tiene ocho módulos funcionales (M1–M8) y cuatro transversales, con trabajo pesado que no cabe en una petición
HTTP: indexación con embeddings (RF-30), optimización de PDF e imágenes (RF-35/36), guardado de versiones desde el
callback de ONLYOFFICE (RF-26) y renovaciones diarias (RF-22). La caída de indexación u optimizador no puede impedir
cargar, descargar ni navegar (RNF-09, Art. XII).

Restricciones: 4 personas, 10 semanas, un servidor de producción de 4 vCPU / 8 GB donde ONLYOFFICE ocupa ~4 GB
(`product-context.md` §8) y un Droplet de staging de 4 GB. El curso exige defender la arquitectura con diagramas que
coincidan con el código (Art. VIII.6).

## Opciones consideradas

1. **Monolito modular (`api`) + un proceso `worker` con el mismo código, desplegados como dos imágenes**
   - Pros: un solo repositorio de módulos con fronteras verificadas por lint (ADR-0008); el worker reutiliza dominio,
     aplicación e infraestructura sin duplicar; se puede escalar o reiniciar el worker sin tocar la API; una tarea
     de indexación de 2 GB no bloquea el *event loop* del HTTP; encaja en 8 GB con límites de memoria por contenedor.
   - Contras: dos procesos que arrancar, vigilar y desplegar; `apps/worker` necesita importar los módulos de
     `apps/api` (alias `@nimbo/api/*`) y el lint debe cubrirlo.
2. **Monolito único: la API también procesa las colas (BullMQ en el mismo proceso)**
   - Pros: una sola imagen y un solo proceso; sin alias entre apps.
   - Contras: la indexación de un archivo grande o `qpdf`/`sharp` compiten con las peticiones HTTP por CPU y memoria;
     un OOM en un trabajo tumba la API (viola Art. XII); no se puede escalar el procesamiento aparte.
3. **Microservicios por módulo (identidad, almacenamiento, inteligencia…)**
   - Pros: aislamiento máximo y escalado independiente.
   - Contras: con 4 personas y 10 semanas el costo de red, contratos, despliegue y observabilidad por servicio
     consume el tiempo de los requisitos; el servidor de 8 GB no da para N procesos Node más ONLYOFFICE; la
     autorización dentro de la consulta (Art. IX.2, ADR-0005) exige una sola base y un solo CTE `accessibleNodes`.
4. **Posponer: empezar con monolito único y separar el worker cuando duela**
   - Contras: los procesadores se escribirían asumiendo el mismo proceso (estado en memoria, inyecciones del ciclo
     HTTP); separar después implica reescribir la propagación de `correlationId` y la salud. El costo de separarlo
     desde 000 es bajo (un `main.ts` y una imagen).

## Decisión

Opción 1. Un monolito modular en `apps/api` (`modules/<x>` con capas `domain/application/infrastructure/presentation`)
y un proceso `apps/worker` (NestJS, sin HTTP público) que **compone** los procesadores y trabajos programados que
viven dentro de cada módulo (`*.processor.ts`, `*.job.ts`). `worker` importa únicamente `@nimbo/api/shared` y
`@nimbo/api/modules/<x>` (su `index.ts`). Ambos procesos comparten `SharedModule`, la fuente de datos y las colas
BullMQ sobre Redis; cada uno expone su salud (`api`: `/api/v1/health/*`; `worker`: puerto interno no publicado).

La separación es por **proceso e imagen** (`nimbo-api`, `nimbo-worker`), no por carpeta: si el alias `@nimbo/api/*`
resulta costoso (R-3 del plan 000), el punto de entrada del worker puede compilarse dentro de `apps/api`
(`worker.main.ts`) siempre que la imagen, el proceso, la salud y las reglas de lint del worker se mantengan.

## Consecuencias

- Positivas: fronteras por módulo defendibles en la exposición; el día que un módulo necesite ser un servicio aparte,
  su `index.ts` ya es el contrato; RNF-09 se cumple por construcción (las colas se consumen fuera del proceso HTTP).
- Negativas / deuda aceptada: dos procesos que operar; `apps/worker` depende de la compilación de `apps/api`;
  la memoria de staging (4 GB) obliga a límites por contenedor y a ONLYOFFICE bajo perfil.
- Cómo sabremos si fue un error: si aparece `forwardRef` o un ciclo entre módulos que el lint no pueda resolver, o si
  el worker termina duplicando lógica de la API en lugar de importarla.

## Enmienda (ADR-0038, 2026-10-27)

El `worker` pasa a ser **dos procesos con la misma imagen** `nimbo-worker`: el general (`worker.main.ts`, todas las
colas salvo `optimization`) y `worker-optimizer` (`worker-optimizer.main.ts`, solo `optimization`). Cada uno tiene su
salud interna, su `HEALTHCHECK` y su límite de memoria. La separación por proceso e imagen y el lint de las raíces se
mantienen; la imagen de los `worker` usa base glibc. La actualización concreta a Debian 13 (`trixie-slim`) y
sharp 0.35.5/libvips 8.18.7 fue aceptada por Matul/Adrián el 2026-10-28, después de `7f9285ff` (ADR-0038).
