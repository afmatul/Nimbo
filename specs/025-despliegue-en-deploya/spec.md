# Spec 025 — Despliegue público en Deploya

> Qué y por qué, en ≤ 150 líneas. El cómo va en `./plan.md` (obligatorio).

| Campo | Valor |
|---|---|
| Estado | Hecha |
| Dueño | Adrián |
| Fase | 4 |
| Requisitos | RNF-12, RNF-15, RNF-17, RNF-09 (ONLYOFFICE opcional), RNF-10 (migraciones al arrancar) |
| Depende de | 000 (imágenes, `compose`), 016 (edición `.docx`), 002 (`DatabaseRoleCheck`), 005 (S3 firmado) |
| Última actualización | 2026-11-13 |

## 1. Contexto y objetivo
Staging en DigitalOcean (000) no estuvo listo para la exposición final, así que el equipo desplegó la demo pública de
Nimbo en **Deploya** (`deploya.larasolutions.dev`), una plataforma de contenedores: un proyecto por contenedor, construido
desde la raíz del repo, con PostgreSQL, Redis y S3 administrados. Esta spec deja registrado lo que se hizo (PR #109,
#110, #113, #115, #116, #117 y el commit `a2efa8f`): el sistema completo, incluida la edición colaborativa, funciona en
`https://nimbo.deploya.larasolutions.dev` y se puede repetir con la guía `docs/operations/deploya.md`. **No reemplaza
a staging**: no hay Prometheus, Grafana ni respaldos.

## 2. Historias de usuario
- **HU-1** Como Operador, quiero desplegar `api`, `worker`, `optimizer` y `web` en Deploya sin tocar el código, para
  tener una demo pública con HTTPS.
- **HU-2** Como Operador, quiero que la base y el almacenamiento administrados por Deploya funcionen con la regla de
  Nimbo de conectarse con un rol sin privilegios, para no debilitar el aislamiento (ADR-0005).
- **HU-3** Como Operador, quiero editar `.docx` también en la demo, para mostrar la diferencia de Nimbo.
- **HU-4** Como Operador, quiero una guía paso a paso y plantillas de variables, para que otra persona repita el despliegue.

## 3. Criterios de aceptación
- **CA-1** (HU-1, RNF-12) Dado el repositorio público, cuando se dan de alta los proyectos `nimbo-api`, `nimbo-worker`,
  `nimbo-optimizer` y `nimbo` con la «Ruta del Dockerfile» de `plan.md` §2, entonces cada imagen se construye con el builder
  clásico de Docker, sin `.dockerignore` ni BuildKit, y Deploya la marca sana (`GET /` < 500 antes de 60 s).
- **CA-2** (HU-2, RNF-15) Dado un PostgreSQL de Deploya con un solo usuario (el dueño), cuando arranca `nimbo-api`,
  entonces el entrypoint crea o actualiza `nimbo_app` sin privilegios, aplica las migraciones como el dueño y `DATABASE_URL`
  de la app conecta como `nimbo_app`; `/api/v1/health/ready` responde `200` con postgres, redis y minio `up`.
- **CA-3** (HU-2) — error: Dado que falta `NIMBO_APP_DB_PASSWORD`, cuando arranca, entonces el entrypoint avisa solo el
  **nombre** de la variable y la app no arranca con el dueño (`db.role_rejected`); nunca se imprime ningún valor.
- **CA-4** (HU-2) Dado un valor con `'`, `$`, comillas o espacios (p. ej. una contraseña), cuando el entrypoint lo
  exporta, entonces llega intacto al proceso (`deploya-env.spec.ts`).
- **CA-5** (HU-1) Dado `nimbo-worker` y `nimbo-optimizer` (misma imagen, distinto comando de inicio) con los recursos
  de datos compartidos desde `nimbo-api`, entonces ambos arrancan tras el api, sin migrar, y su `/health/ready` responde `200`.
- **CA-6** (HU-1, RNF-17) Dado el contenedor de Deploya (`--cap-drop ALL`, `no-new-privileges`, 1 GB, 1 vCPU, sin
  volúmenes), entonces las imágenes corren como `node` (o `ds`), sin escribir en disco salvo cachés efímeras, y cada
  proyecto usa menos de 150 MB (ONLYOFFICE, ≈ 540 MB).
- **CA-7** (HU-1) Dado `nimbo` (web) construida sin variables de entorno, entonces las páginas públicas no se
  prerenderizan con la configuración local (`force-dynamic`) y la portada ve la API por `API_INTERNAL_URL`.
- **CA-8** (HU-4) Dado Deploya sin consola, cuando el Operador usa el comando de inicio temporal de la guía, entonces
  se crea el primer administrador (`admin.bootstrap.completed`) y repetirlo responde `IDENTITY_ADMIN_ALREADY_EXISTS` sin
  impedir el arranque; el worker envía la invitación por SMTP.
- **CA-9** (HU-3, RNF-09) Dado `nimbo-docs` (ONLYOFFICE Docs 9.3.1, la versión de compose) con su propio PostgreSQL, cuando
  se abre un `.docx` en la web, entonces el editor carga por HTTPS sin contenido mixto, guarda en Nimbo al cerrar
  (aviso `status 2`) y la conversión firmada con JWT funciona.
- **CA-10** (HU-3, RNF-09) — error: Dado que `nimbo-docs` o sus cuatro variables en el api faltan, entonces «Editar»
  responde `EDITING_UNAVAILABLE` (503) y el resto de Nimbo funciona igual.
- **CA-11** (HU-1) Dado el servidor de construcción compartido de Deploya, entonces ninguna imagen base sale de Docker
  Hub (429): `node:22.23.3-trixie-slim` y `ubuntu:24.04` bajan de `mirror.gcr.io`.
- **CA-12** (HU-4) Dada la guía, entonces describe cada pantalla de Deploya con sus textos exactos, el orden
  (api → worker → optimizer → web → docs), los límites conocidos, una tabla de síntomas y los resultados de la prueba local.

## 4. Reglas de negocio
- **RN-1** Un proyecto de Deploya por proceso de Nimbo: `nimbo-api` (3000), `nimbo-worker` (3001),
  `nimbo-optimizer` (3003), `nimbo` web (3002) y `nimbo-docs` (8080). El del api crea los recursos de datos y los comparte.
- **RN-2** Las imágenes son las mismas de compose y staging: el entrypoint de Deploya **no hace nada** sin variables
  `DEPLOYA_*` (RNF-15). No hay variantes por ambiente en el código.
- **RN-3** `APP_ENV=staging` en la demo: cookies `Secure`, SMTP con STARTTLS obligatorio y secretos largos (≥ 43 caracteres el JWT).
- **RN-4** Los secretos (`JWT_ACCESS_SECRET`, `NIMBO_APP_DB_PASSWORD`, `ONLYOFFICE_JWT_SECRET`, SMTP, `GEMINI_API_KEY`)
  se pegan en Deploya y **nunca** entran al repositorio: las plantillas solo traen `<genera-uno>`.
- **RN-5** Solo `.docx` se edita en línea (ADR-0004); ONLYOFFICE no recibe la base de Nimbo.

## 5. Seguridad y privacidad
- ¿Toca datos de un cliente? No agrega consultas ni cambia `accessibleNodes`; no lleva prueba de aislamiento nueva. Sí
  **preserva** el aislamiento: la app nunca corre como dueño de la base (CA-2, CA-3).
- Bitácoras: el entrypoint imprime solo nombres de variables; `config.invalid` nunca muestra valores.
- Worker y optimizer quedan con salud pública (`GET /` 404): no exponen datos. Roles internos: sin cambio.
- CORS del S3: Deploya no lo configura; las cargas firmadas funcionan, pero el bucket no restringe orígenes.

## 6. Experiencia de usuario
- Sin interfaz nueva. Único cambio de web: páginas públicas dinámicas (CA-7).

## 7. Fuera de alcance
- Prometheus, Grafana, cAdvisor y respaldos (022, 022c) en Deploya; la CI/CD a Deploya (se despliega a mano).
- Staging en DigitalOcean (sigue en 000) y producción.
- Persistencia propia de ONLYOFFICE: su caché se pierde al redesplegar; las sesiones abiertas se cierran.
- Fuentes de Microsoft en ONLYOFFICE (licencia): van Carlito, Caladea, Liberation y DejaVu.
- Agente e indexación sin `GEMINI_API_KEY` (responden `AGENT_UNAVAILABLE`, RNF-09).

## 8. Supuestos
- Plan Pro de Deploya (4–5 proyectos, 3 recursos de datos, 1 GB y 1 vCPU por proyecto) y repo público.
- Deploya es de un tercero (`derekCmorales/deploya`); la guía se contrastó con su código @ `8e68889` y su interfaz.

## 9. Preguntas
- [RESUELTA] ¿El `Dockerfile` del api va en la raíz? → Sí: el alta de Deploya solo acepta la raíz; los demás cambian la ruta en Configuración (2026-11-12, Adrián).
- [RESUELTA] ¿ONLYOFFICE entra en la demo? → Sí, como `nimbo-docs` con imagen propia (#113), porque la oficial no arranca con las reglas de Deploya.
- [ABIERTA] Probar con el TLS y proxy reales: WebSocket del editor y `readTimeout` de 60 s en cargas lentas — bloquea: no.

## 10. Registro de cambios
| Fecha | Cambio | Motivo | Aprobó |
|---|---|---|---|
| 2026-11-12 | Imágenes, entrypoint, plantillas y guía (#109) | Demo pública | Adrián |
| 2026-11-12 | `Dockerfile` del api a la raíz; base desde `mirror.gcr.io`; guía pantalla por pantalla (#110) | Alta de Deploya y 429 de Docker Hub | Adrián |
| 2026-11-12 | `nimbo-docs` con ONLYOFFICE 9.3.1 (#113) | Edición en la demo | Adrián |
| 2026-11-12 | `X-Forwarded-Proto` fijo en https; luego acotado y verificado (#115, #116, #117) | «Error de descarga» por contenido mixto; la salud de Deploya fallaba | Adrián |
| 2026-11-13 | Spec redactada con lo hecho; estado `Hecha` | Documentar | Adrián |
| 2026-11-13 | Semilla de demostración al arrancar el contenedor (`SEED_ON_START`) | Rama `fix/pendientes-explorador-planes-facturas` | Pendiente Adrián |
